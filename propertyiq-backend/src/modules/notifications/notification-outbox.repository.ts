
import { getDatabase, sql } from "../../config/database";

import type {
  CreateNotificationOutboxEventInput,
  ClaimNotificationOutboxEventsInput,
  CompleteNotificationOutboxEventInput,
  FailNotificationOutboxEventInput,
} from "./notification-outbox.validation";

export class NotificationOutboxRepository {
  private readonly maxAttempts = 5;

  private readonly defaultLockTimeoutMinutes = 5;

  // =====================================================
  // SAFE TRANSACTION ROLLBACK
  // =====================================================

  private async rollback(transaction: sql.Transaction) {
    try {
      await transaction.rollback();
    } catch {
      // Preserve the original database error.
    }
  }

  // =====================================================
  // INSERT EVENT USING EXISTING TRANSACTION
  //
  // The event and business operation commit or roll back
  // together.
  //
  // Returns null for an existing idempotency key.
  // =====================================================

  async createInTransaction(
    transaction: sql.Transaction,
    organizationId: string,
    data: CreateNotificationOutboxEventInput
  ) {
    const result = await transaction
      .request()
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .input("eventType", sql.NVarChar(100), data.eventType)
      .input("aggregateType", sql.NVarChar(50), data.aggregateType)
      .input("aggregateId", sql.UniqueIdentifier, data.aggregateId)
      .input("idempotencyKey", sql.NVarChar(255), data.idempotencyKey)
      .input("payload", sql.NVarChar(sql.MAX), JSON.stringify(data.payload))
      .query(`
        IF EXISTS (
          SELECT 1
          FROM dbo.NotificationOutbox WITH (UPDLOCK, HOLDLOCK)
          WHERE OrganizationId = @organizationId
            AND IdempotencyKey = @idempotencyKey
        )
        BEGIN
          SELECT CAST(0 AS BIT) AS created;
        END
        ELSE
        BEGIN
          INSERT INTO dbo.NotificationOutbox (
            OrganizationId,
            EventType,
            AggregateType,
            AggregateId,
            IdempotencyKey,
            Payload
          )
          OUTPUT
            CAST(1 AS BIT) AS created,
            INSERTED.EventId AS eventId,
            INSERTED.OrganizationId AS organizationId,
            INSERTED.EventType AS eventType,
            INSERTED.AggregateType AS aggregateType,
            INSERTED.AggregateId AS aggregateId,
            INSERTED.IdempotencyKey AS idempotencyKey,
            INSERTED.Payload AS payload,
            INSERTED.Status AS status,
            INSERTED.Attempts AS attempts,
            INSERTED.AvailableAt AS availableAt,
            INSERTED.LockedAt AS lockedAt,
            INSERTED.LockedBy AS lockedBy,
            INSERTED.ProcessedAt AS processedAt,
            INSERTED.LastError AS lastError,
            INSERTED.CreatedAt AS createdAt
          VALUES (
            @organizationId,
            @eventType,
            @aggregateType,
            @aggregateId,
            @idempotencyKey,
            @payload
          );
        END;
      `);

    const row = result.recordset[0];

    if (!row || row.created !== true) {
      return null;
    }

    const { created, ...event } = row;

    return event;
  }

  // =====================================================
  // CREATE EVENT
  //
  // Standalone transaction for workflows that do not
  // already have a business transaction.
  // =====================================================

  async create(
    organizationId: string,
    data: CreateNotificationOutboxEventInput
  ) {
    const pool = await getDatabase();
    const transaction = new sql.Transaction(pool);

    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    try {
      const event = await this.createInTransaction(
        transaction,
        organizationId,
        data
      );

      await transaction.commit();

      return event;
    } catch (error) {
      await this.rollback(transaction);
      throw error;
    }
  }

  // =====================================================
  // RECOVER STALE WORKER LOCKS
  //
  // Abandoned events are returned to the queue.
  // Events that exhausted their attempts become failed.
  //
  // Must execute inside the claim transaction.
  // =====================================================

  private async recoverStaleLocks(
    transaction: sql.Transaction,
    lockTimeoutMinutes: number
  ) {
    await transaction
      .request()
      .input(
        "lockTimeoutMinutes",
        sql.Int,
        lockTimeoutMinutes
      )
      .input(
        "maxAttempts",
        sql.Int,
        this.maxAttempts
      )
      .query(`
        UPDATE dbo.NotificationOutbox

        SET
          Status = CASE
            WHEN Attempts >= @maxAttempts
            THEN 'failed'
            ELSE 'queued'
          END,

          AvailableAt = CASE
            WHEN Attempts >= @maxAttempts
            THEN AvailableAt
            ELSE SYSUTCDATETIME()
          END,

          LastError = COALESCE(
            LastError,
            'Worker lock expired before processing completed.'
          ),

          LockedAt = NULL,
          LockedBy = NULL

        WHERE Status = 'processing'
          AND LockedAt IS NOT NULL
          AND LockedAt <= DATEADD(
            MINUTE,
            -@lockTimeoutMinutes,
            SYSUTCDATETIME()
          );
      `);
  }

  // =====================================================
  // CLAIM EVENTS
  //
  // Recovers abandoned events before claiming new work.
  // Uses READPAST to skip rows locked by other workers.
  // =====================================================

  async claim(
    data: ClaimNotificationOutboxEventsInput,
    lockTimeoutMinutes = this.defaultLockTimeoutMinutes
  ) {
    if (
      !Number.isInteger(lockTimeoutMinutes) ||
      lockTimeoutMinutes < 1 ||
      lockTimeoutMinutes > 1440
    ) {
      throw new Error(
        "Lock timeout must be between 1 and 1440 minutes."
      );
    }

    const pool = await getDatabase();
    const transaction = new sql.Transaction(pool);

    await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

    try {
      // Recover abandoned events before claiming work.

      await this.recoverStaleLocks(
        transaction,
        lockTimeoutMinutes
      );

      const result = await transaction
        .request()
        .input("workerId", sql.NVarChar(100), data.workerId)
        .input("batchSize", sql.Int, data.batchSize)
        .query(`
          ;WITH EventsToClaim AS (
            SELECT TOP (@batchSize)
              EventId

            FROM dbo.NotificationOutbox
              WITH (UPDLOCK, READPAST, ROWLOCK)

            WHERE Status = 'queued'
              AND AvailableAt <= SYSUTCDATETIME()

            ORDER BY
              AvailableAt ASC,
              CreatedAt ASC,
              EventId ASC
          )

          UPDATE outbox

          SET
            Status = 'processing',
            LockedAt = SYSUTCDATETIME(),
            LockedBy = @workerId,
            Attempts = Attempts + 1

          OUTPUT
            INSERTED.EventId AS eventId,
            INSERTED.OrganizationId AS organizationId,
            INSERTED.EventType AS eventType,
            INSERTED.AggregateType AS aggregateType,
            INSERTED.AggregateId AS aggregateId,
            INSERTED.IdempotencyKey AS idempotencyKey,
            INSERTED.Payload AS payload,
            INSERTED.Status AS status,
            INSERTED.Attempts AS attempts,
            INSERTED.AvailableAt AS availableAt,
            INSERTED.LockedAt AS lockedAt,
            INSERTED.LockedBy AS lockedBy,
            INSERTED.ProcessedAt AS processedAt,
            INSERTED.LastError AS lastError,
            INSERTED.CreatedAt AS createdAt

          FROM dbo.NotificationOutbox outbox

          INNER JOIN EventsToClaim claimed
            ON claimed.EventId = outbox.EventId;
        `);

      await transaction.commit();

      return result.recordset;
    } catch (error) {
      await this.rollback(transaction);
      throw error;
    }
  }


  // =====================================================
  // RENEW EVENT LOCK
  //
  // Extends the processing lease for the current worker.
  //
  // Renewal is allowed only when:
  // - The event is still processing.
  // - The event is still owned by this worker.
  // - The existing lock has not already expired.
  //
  // Returns the updated event or null if ownership
  // was lost or the lock expired.
  // =====================================================

  async renewLock(
    eventId: string,
    workerId: string,
    lockTimeoutMinutes = this.defaultLockTimeoutMinutes
  ) {
    if (
      !Number.isInteger(lockTimeoutMinutes) ||
      lockTimeoutMinutes < 1 ||
      lockTimeoutMinutes > 1440
    ) {
      throw new Error(
        "Lock timeout must be between 1 and 1440 minutes."
      );
    }

    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("eventId", sql.UniqueIdentifier, eventId)
      .input("workerId", sql.NVarChar(100), workerId)
      .input(
        "lockTimeoutMinutes",
        sql.Int,
        lockTimeoutMinutes
      )
      .query(`
        UPDATE dbo.NotificationOutbox

        SET
          LockedAt = SYSUTCDATETIME()

        OUTPUT
          INSERTED.EventId AS eventId,
          INSERTED.OrganizationId AS organizationId,
          INSERTED.EventType AS eventType,
          INSERTED.AggregateType AS aggregateType,
          INSERTED.AggregateId AS aggregateId,
          INSERTED.IdempotencyKey AS idempotencyKey,
          INSERTED.Payload AS payload,
          INSERTED.Status AS status,
          INSERTED.Attempts AS attempts,
          INSERTED.AvailableAt AS availableAt,
          INSERTED.LockedAt AS lockedAt,
          INSERTED.LockedBy AS lockedBy,
          INSERTED.ProcessedAt AS processedAt,
          INSERTED.LastError AS lastError,
          INSERTED.CreatedAt AS createdAt

        WHERE EventId = @eventId
          AND Status = 'processing'
          AND LockedBy = @workerId
          AND LockedAt IS NOT NULL
          AND LockedAt > DATEADD(
            MINUTE,
            -@lockTimeoutMinutes,
            SYSUTCDATETIME()
          );
      `);

    return result.recordset[0] ?? null;
  }

  // =====================================================
  // COMPLETE EVENT
  //
  // Only the worker holding the current claim may
  // complete the event.
  // =====================================================

  async complete(
    data: CompleteNotificationOutboxEventInput
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("eventId", sql.UniqueIdentifier, data.eventId)
      .input("workerId", sql.NVarChar(100), data.workerId)
      .query(`
        UPDATE dbo.NotificationOutbox

        SET
          Status = 'processed',
          ProcessedAt = SYSUTCDATETIME(),
          LockedAt = NULL,
          LockedBy = NULL,
          LastError = NULL

        OUTPUT
          INSERTED.EventId AS eventId,
          INSERTED.OrganizationId AS organizationId,
          INSERTED.EventType AS eventType,
          INSERTED.AggregateType AS aggregateType,
          INSERTED.AggregateId AS aggregateId,
          INSERTED.IdempotencyKey AS idempotencyKey,
          INSERTED.Payload AS payload,
          INSERTED.Status AS status,
          INSERTED.Attempts AS attempts,
          INSERTED.AvailableAt AS availableAt,
          INSERTED.LockedAt AS lockedAt,
          INSERTED.LockedBy AS lockedBy,
          INSERTED.ProcessedAt AS processedAt,
          INSERTED.LastError AS lastError,
          INSERTED.CreatedAt AS createdAt

        WHERE EventId = @eventId
          AND Status = 'processing'
          AND LockedBy = @workerId;
      `);

    return result.recordset[0] ?? null;
  }

  // =====================================================
  // FAIL EVENT
  //
  // Retryable events return to queued status.
  // Events exceeding the retry limit become failed.
  // =====================================================

  async fail(
    data: FailNotificationOutboxEventInput
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("eventId", sql.UniqueIdentifier, data.eventId)
      .input("workerId", sql.NVarChar(100), data.workerId)
      .input("errorMessage", sql.NVarChar(2000), data.errorMessage)
      .input("retryDelaySeconds", sql.Int, data.retryDelaySeconds)
      .input("maxAttempts", sql.Int, this.maxAttempts)
      .query(`
        UPDATE dbo.NotificationOutbox

        SET
          Status = CASE
            WHEN Attempts >= @maxAttempts THEN 'failed'
            ELSE 'queued'
          END,

          AvailableAt = CASE
            WHEN Attempts >= @maxAttempts THEN AvailableAt
            ELSE DATEADD(
              SECOND,
              @retryDelaySeconds,
              SYSUTCDATETIME()
            )
          END,

          LastError = @errorMessage,
          LockedAt = NULL,
          LockedBy = NULL

        OUTPUT
          INSERTED.EventId AS eventId,
          INSERTED.OrganizationId AS organizationId,
          INSERTED.EventType AS eventType,
          INSERTED.AggregateType AS aggregateType,
          INSERTED.AggregateId AS aggregateId,
          INSERTED.IdempotencyKey AS idempotencyKey,
          INSERTED.Payload AS payload,
          INSERTED.Status AS status,
          INSERTED.Attempts AS attempts,
          INSERTED.AvailableAt AS availableAt,
          INSERTED.LockedAt AS lockedAt,
          INSERTED.LockedBy AS lockedBy,
          INSERTED.ProcessedAt AS processedAt,
          INSERTED.LastError AS lastError,
          INSERTED.CreatedAt AS createdAt

        WHERE EventId = @eventId
          AND Status = 'processing'
          AND LockedBy = @workerId;
      `);

    return result.recordset[0] ?? null;
  }
}
