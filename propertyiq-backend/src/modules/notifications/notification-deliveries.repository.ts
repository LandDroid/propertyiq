
import { getDatabase, sql } from "../../config/database";

import type {
  CreateNotificationDeliveryInput,
  UpdateNotificationDeliveryStatusInput,
} from "./notification-deliveries.validation";

export class NotificationDeliveriesRepository {
  // =====================================================
  // ACTIVE ORGANIZATION MEMBERSHIP CHECK
  // =====================================================

  private readonly accessCheck = `
    EXISTS (
      SELECT 1
      FROM dbo.Memberships m
      INNER JOIN dbo.Organizations o
        ON o.OrganizationId = m.OrganizationId
      INNER JOIN dbo.Users u
        ON u.UserId = m.UserId
      WHERE m.OrganizationId = @organizationId
        AND m.UserId = @userId
        AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
        AND LOWER(LTRIM(RTRIM(u.Status))) = 'active'
    )
  `;

  // =====================================================
  // DELIVERY OUTPUT COLUMNS
  // =====================================================

  private readonly insertedDeliveryColumns = `
    INSERTED.NotificationDeliveryId
      AS notificationDeliveryId,
    INSERTED.OrganizationId
      AS organizationId,
    INSERTED.UserId
      AS userId,
    INSERTED.AlertId
      AS alertId,
    INSERTED.Channel
      AS channel,
    INSERTED.Recipient
      AS recipient,
    INSERTED.Subject
      AS subject,
    INSERTED.Message
      AS message,
    INSERTED.Status
      AS status,
    INSERTED.ProviderMessageId
      AS providerMessageId,
    INSERTED.ErrorMessage
      AS errorMessage,
    INSERTED.SentAt
      AS sentAt,
    INSERTED.DeliveredAt
      AS deliveredAt,
    INSERTED.CreatedAt
      AS createdAt
  `;

  private readonly selectedDeliveryColumns = `
    nd.NotificationDeliveryId
      AS notificationDeliveryId,
    nd.OrganizationId
      AS organizationId,
    nd.UserId
      AS userId,
    nd.AlertId
      AS alertId,
    nd.Channel
      AS channel,
    nd.Recipient
      AS recipient,
    nd.Subject
      AS subject,
    nd.Message
      AS message,
    nd.Status
      AS status,
    nd.ProviderMessageId
      AS providerMessageId,
    nd.ErrorMessage
      AS errorMessage,
    nd.SentAt
      AS sentAt,
    nd.DeliveredAt
      AS deliveredAt,
    nd.CreatedAt
      AS createdAt
  `;

  // =====================================================
  // CREATE DELIVERY
  // Trusted backend workflow only.
  //
  // When an idempotency key is supplied, serialize
  // requests for that organization/key and return the
  // existing delivery instead of inserting a duplicate.
  // =====================================================

  async create(
    organizationId: string,
    data: CreateNotificationDeliveryInput
  ) {
    const db = await getDatabase();
    const transaction = new sql.Transaction(db);

    let transactionStarted = false;

    try {
      await transaction.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
      );

      transactionStarted = true;

      const request = transaction.request()
        .input(
          "organizationId",
          sql.UniqueIdentifier,
          organizationId
        )
        .input(
          "userId",
          sql.UniqueIdentifier,
          data.userId
        )
        .input(
          "alertId",
          sql.UniqueIdentifier,
          data.alertId ?? null
        )
        .input(
          "channel",
          sql.NVarChar(30),
          data.channel
        )
        .input(
          "recipient",
          sql.NVarChar(255),
          data.recipient
        )
        .input(
          "subject",
          sql.NVarChar(255),
          data.subject ?? null
        )
        .input(
          "message",
          sql.NVarChar(2000),
          data.message ?? null
        )
        .input(
          "idempotencyKey",
          sql.NVarChar(255),
          data.idempotencyKey ?? null
        );

      // Check idempotency before creating a delivery.
      // UPDLOCK + HOLDLOCK protects the key range while
      // the transaction checks and inserts.
      if (data.idempotencyKey) {
        const existingResult = await request.query(`
          SELECT
            ${this.selectedDeliveryColumns}

          FROM dbo.NotificationDeliveries nd
            WITH (UPDLOCK, HOLDLOCK)

          WHERE nd.OrganizationId = @organizationId
            AND nd.IdempotencyKey = @idempotencyKey;
        `);

        const existingDelivery = existingResult.recordset[0];

        if (existingDelivery) {
          await transaction.commit();
          transactionStarted = false;

          return existingDelivery;
        }
      }

      const result = await request.query(`
        INSERT INTO dbo.NotificationDeliveries (
          OrganizationId,
          UserId,
          AlertId,
          Channel,
          Recipient,
          Subject,
          Message,
          IdempotencyKey,
          Status
        )

        OUTPUT
          ${this.insertedDeliveryColumns}

        SELECT
          @organizationId,
          @userId,
          @alertId,
          @channel,
          @recipient,
          @subject,
          @message,
          @idempotencyKey,
          'queued'

        WHERE ${this.accessCheck}

          AND (
            @alertId IS NULL
            OR EXISTS (
              SELECT 1
              FROM dbo.Alerts a
              WHERE a.AlertId = @alertId
                AND a.OrganizationId = @organizationId
            )
          );
      `);

      await transaction.commit();
      transactionStarted = false;

      return result.recordset[0] ?? null;
    } catch (error) {
      if (transactionStarted) {
        try {
          await transaction.rollback();
        } catch (rollbackError) {
          console.error(
            "Notification delivery transaction rollback failed:",
            rollbackError
          );
        }
      }

      throw error;
    }
  }

  // =====================================================
  // GET USER DELIVERY HISTORY
  // =====================================================

  async getAll(
    organizationId: string,
    userId: string
  ) {
    const db = await getDatabase();

    const result = await db.request()
      .input(
        "organizationId",
        sql.UniqueIdentifier,
        organizationId
      )
      .input(
        "userId",
        sql.UniqueIdentifier,
        userId
      )
      .query(`
        SELECT
          ${this.selectedDeliveryColumns}

        FROM dbo.NotificationDeliveries nd

        WHERE nd.OrganizationId = @organizationId
          AND nd.UserId = @userId
          AND ${this.accessCheck}

        ORDER BY nd.CreatedAt DESC;
      `);

    return result.recordset;
  }

  // =====================================================
  // GET USER DELIVERY BY ID
  // =====================================================

  async getById(
    notificationDeliveryId: string,
    organizationId: string,
    userId: string
  ) {
    const db = await getDatabase();

    const result = await db.request()
      .input(
        "notificationDeliveryId",
        sql.UniqueIdentifier,
        notificationDeliveryId
      )
      .input(
        "organizationId",
        sql.UniqueIdentifier,
        organizationId
      )
      .input(
        "userId",
        sql.UniqueIdentifier,
        userId
      )
      .query(`
        SELECT
          ${this.selectedDeliveryColumns}

        FROM dbo.NotificationDeliveries nd

        WHERE nd.NotificationDeliveryId =
          @notificationDeliveryId
          AND nd.OrganizationId = @organizationId
          AND nd.UserId = @userId
          AND ${this.accessCheck};
      `);

    return result.recordset[0] ?? null;
  }

  // =====================================================
  // UPDATE DELIVERY STATUS
  // Trusted backend workflow only.
  // =====================================================

  async updateStatus(
    notificationDeliveryId: string,
    organizationId: string,
    data: UpdateNotificationDeliveryStatusInput
  ) {
    const db = await getDatabase();

    const transaction = new sql.Transaction(db);

    let transactionStarted = false;

    try {
      await transaction.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
      );

      transactionStarted = true;

      const currentResult = await transaction.request()
        .input(
          "notificationDeliveryId",
          sql.UniqueIdentifier,
          notificationDeliveryId
        )
        .input(
          "organizationId",
          sql.UniqueIdentifier,
          organizationId
        )
        .query(`
          SELECT
            NotificationDeliveryId,
            Status

          FROM dbo.NotificationDeliveries
            WITH (UPDLOCK, HOLDLOCK)

          WHERE NotificationDeliveryId =
            @notificationDeliveryId
            AND OrganizationId = @organizationId;
        `);

      const currentDelivery = currentResult.recordset[0];

      if (!currentDelivery) {
        await transaction.commit();
        transactionStarted = false;

        return null;
      }

      const currentStatus = String(
        currentDelivery.Status
      ).toLowerCase();

      const validTransitions: Record<string, string[]> = {
        queued: ["sent", "failed"],
        sent: ["delivered", "failed"],
        delivered: [],
        failed: [],
      };

      if (
        !validTransitions[currentStatus]?.includes(
          data.status
        )
      ) {
        throw new Error(
          "Invalid notification delivery status transition"
        );
      }

      const providerMessageIdProvided =
        data.providerMessageId !== undefined;

      const errorMessageProvided =
        data.errorMessage !== undefined;

      const updateResult = await transaction.request()
        .input(
          "notificationDeliveryId",
          sql.UniqueIdentifier,
          notificationDeliveryId
        )
        .input(
          "organizationId",
          sql.UniqueIdentifier,
          organizationId
        )
        .input(
          "status",
          sql.NVarChar(30),
          data.status
        )
        .input(
          "providerMessageId",
          sql.NVarChar(255),
          data.providerMessageId ?? null
        )
        .input(
          "providerMessageIdProvided",
          sql.Bit,
          providerMessageIdProvided
        )
        .input(
          "errorMessage",
          sql.NVarChar(1000),
          data.errorMessage ?? null
        )
        .input(
          "errorMessageProvided",
          sql.Bit,
          errorMessageProvided
        )
        .query(`
          UPDATE dbo.NotificationDeliveries

          SET
            Status = @status,

            ProviderMessageId =
              CASE
                WHEN @providerMessageIdProvided = 1
                THEN @providerMessageId
                ELSE ProviderMessageId
              END,

            ErrorMessage =
              CASE
                WHEN @errorMessageProvided = 1
                THEN @errorMessage
                ELSE ErrorMessage
              END,

            SentAt =
              CASE
                WHEN @status = 'sent'
                THEN SYSUTCDATETIME()
                ELSE SentAt
              END,

            DeliveredAt =
              CASE
                WHEN @status = 'delivered'
                THEN SYSUTCDATETIME()
                ELSE DeliveredAt
              END

          OUTPUT
            ${this.insertedDeliveryColumns}

          WHERE NotificationDeliveryId =
            @notificationDeliveryId
            AND OrganizationId = @organizationId;
        `);

      await transaction.commit();
      transactionStarted = false;

      return updateResult.recordset[0] ?? null;
    } catch (error) {
      if (transactionStarted) {
        try {
          await transaction.rollback();
        } catch (rollbackError) {
          console.error(
            "Notification delivery transaction rollback failed:",
            rollbackError
          );
        }
      }

      throw error;
    }
  }
}
