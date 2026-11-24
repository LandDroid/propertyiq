
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { randomUUID } from "crypto";

import { getDatabase, sql } from "../src/config/database";

import {
  createNotificationEvent,
} from "../src/modules/notifications/notification-outbox.service";

import * as notificationOutboxService from "../src/modules/notifications/notification-outbox.service";

import {
  NotificationOutboxWorker,
} from "../src/modules/notifications/notification-outbox.worker";

// =====================================================
// TEST ORGANIZATION
// =====================================================

const organizationId =
  "4587318B-7DA1-482E-B0B7-587B9A26C7D8";

// =====================================================
// TEST CLEANUP
// =====================================================

const createdEventIds: string[] = [];

async function cleanupEvents() {
  if (createdEventIds.length === 0) {
    return;
  }

  const db = await getDatabase();

  for (const eventId of createdEventIds) {
    await db
      .request()
      .input("eventId", sql.UniqueIdentifier, eventId)
      .query(`
        DELETE FROM dbo.NotificationOutbox
        WHERE EventId = @eventId;
      `);
  }

  createdEventIds.length = 0;
}

// =====================================================
// TEST HELPERS
// =====================================================

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function createEvent(
  eventType: string
): Promise<string> {
  const created = await createNotificationEvent(
    organizationId,
    {
      eventType,
      aggregateType: "Alert",
      aggregateId: randomUUID(),
      idempotencyKey: `worker-test-${randomUUID()}`,
      payload: {
        alertId: randomUUID(),
        title: "Notification Outbox Worker Test",
        severity: "high",
      },
    }
  );

  expect(created).not.toBeNull();

  const eventId = created!.eventId;

  createdEventIds.push(eventId);

  return eventId;
}

async function makeEventAvailable(
  eventId: string
) {
  const db = await getDatabase();

  await db
    .request()
    .input("eventId", sql.UniqueIdentifier, eventId)
    .query(`
      UPDATE dbo.NotificationOutbox
      SET
        CreatedAt = DATEADD(
          YEAR,
          -20,
          SYSUTCDATETIME()
        ),
        AvailableAt = SYSUTCDATETIME()
      WHERE EventId = @eventId;
    `);
}

async function getStoredEvent(eventId: string) {
  const db = await getDatabase();

  const result = await db
    .request()
    .input("eventId", sql.UniqueIdentifier, eventId)
    .query(`
      SELECT
        EventId AS eventId,
        Status AS status,
        Attempts AS attempts,
        LockedBy AS lockedBy,
        LockedAt AS lockedAt,
        ProcessedAt AS processedAt,
        LastError AS lastError,
        AvailableAt AS availableAt
      FROM dbo.NotificationOutbox
      WHERE EventId = @eventId;
    `);

  return result.recordset[0] ?? null;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupEvents();
});

// =====================================================
// TESTS
// =====================================================

describe("Notification Outbox worker integration", () => {
  // ---------------------------------------------------
  // SUCCESSFUL EVENT PROCESSING
  // ---------------------------------------------------

  it("processes an event using its registered handler", async () => {
    const eventId = await createEvent(
      "worker.test.success"
    );

    await makeEventAvailable(eventId);

    let handledEventId: string | null = null;

    const worker = new NotificationOutboxWorker({
      workerId: `worker-${randomUUID()}`,
      batchSize: 1,
      handlers: {
        "worker.test.success": async (event) => {
          handledEventId = event.eventId;
        },
      },
    });

    const result = await worker.processBatch();

    expect(result).toEqual({
      claimed: 1,
      processed: 1,
      failed: 0,
      skipped: 0,
    });

    expect(handledEventId).toBe(eventId);

    const storedEvent = await getStoredEvent(eventId);

    expect(storedEvent.status).toBe("processed");
    expect(storedEvent.attempts).toBe(1);
    expect(storedEvent.processedAt).not.toBeNull();
    expect(storedEvent.lockedAt).toBeNull();
    expect(storedEvent.lockedBy).toBeNull();
  });

  // ---------------------------------------------------
  // HANDLER FAILURE AND RETRY
  // ---------------------------------------------------

  it("retries an event when its handler throws an error", async () => {
    const eventId = await createEvent(
      "worker.test.failure"
    );

    await makeEventAvailable(eventId);

    const worker = new NotificationOutboxWorker({
      workerId: `worker-${randomUUID()}`,
      batchSize: 1,
      retryDelaySeconds: 60,
      handlers: {
        "worker.test.failure": async () => {
          throw new Error("Simulated handler failure.");
        },
      },
    });

    const result = await worker.processBatch();

    expect(result).toEqual({
      claimed: 1,
      processed: 0,
      failed: 1,
      skipped: 0,
    });

    const storedEvent = await getStoredEvent(eventId);

    expect(storedEvent.status).toBe("queued");
    expect(storedEvent.attempts).toBe(1);
    expect(storedEvent.lastError).toBe(
      "Simulated handler failure."
    );
    expect(storedEvent.lockedAt).toBeNull();
    expect(storedEvent.lockedBy).toBeNull();
    expect(
      new Date(storedEvent.availableAt).getTime()
    ).toBeGreaterThan(Date.now());
  });

  // ---------------------------------------------------
  // MISSING HANDLER
  // ---------------------------------------------------

  it("fails an event when no handler is registered", async () => {
    const eventId = await createEvent(
      "worker.test.missing-handler"
    );

    await makeEventAvailable(eventId);

    const worker = new NotificationOutboxWorker({
      workerId: `worker-${randomUUID()}`,
      batchSize: 1,
    });

    const result = await worker.processBatch();

    expect(result).toEqual({
      claimed: 1,
      processed: 0,
      failed: 1,
      skipped: 0,
    });

    const storedEvent = await getStoredEvent(eventId);

    expect(storedEvent.status).toBe("queued");
    expect(storedEvent.attempts).toBe(1);
    expect(storedEvent.lastError).toContain(
      "No handler registered"
    );
  });

  // ---------------------------------------------------
  // MULTIPLE EVENTS
  // ---------------------------------------------------

  it("processes multiple events in one batch", async () => {
    const eventIds = await Promise.all([
      createEvent("worker.test.batch"),
      createEvent("worker.test.batch"),
      createEvent("worker.test.batch"),
    ]);

    for (const eventId of eventIds) {
      await makeEventAvailable(eventId);
    }

    const handledEventIds: string[] = [];

    const worker = new NotificationOutboxWorker({
      workerId: `worker-${randomUUID()}`,
      batchSize: 3,
      handlers: {
        "worker.test.batch": async (event) => {
          handledEventIds.push(event.eventId);
        },
      },
    });

    const result = await worker.processBatch();

    expect(result).toEqual({
      claimed: 3,
      processed: 3,
      failed: 0,
      skipped: 0,
    });

    expect(handledEventIds).toHaveLength(3);

    for (const eventId of eventIds) {
      expect(handledEventIds).toContain(eventId);

      const storedEvent = await getStoredEvent(eventId);

      expect(storedEvent.status).toBe("processed");
      expect(storedEvent.attempts).toBe(1);
    }
  });

  // ---------------------------------------------------
  // CUSTOM LOCK TIMEOUT
  // ---------------------------------------------------

  it("recovers an expired lock using the configured timeout", async () => {
    const eventId = await createEvent(
      "worker.test.lock-timeout"
    );

    await makeEventAvailable(eventId);

    const db = await getDatabase();

    await db
      .request()
      .input("eventId", sql.UniqueIdentifier, eventId)
      .query(`
        UPDATE dbo.NotificationOutbox
        SET
          Status = 'processing',
          Attempts = 1,
          LockedAt = DATEADD(
            MINUTE,
            -2,
            SYSUTCDATETIME()
          ),
          LockedBy = 'expired-worker'
        WHERE EventId = @eventId;
      `);

    const worker = new NotificationOutboxWorker({
      workerId: `worker-${randomUUID()}`,
      batchSize: 1,
      lockTimeoutMinutes: 1,
      handlers: {
        "worker.test.lock-timeout": async () => {},
      },
    });

    const result = await worker.processBatch();

    expect(result).toEqual({
      claimed: 1,
      processed: 1,
      failed: 0,
      skipped: 0,
    });

    const storedEvent = await getStoredEvent(eventId);

    expect(storedEvent.status).toBe("processed");
    expect(storedEvent.attempts).toBe(2);
    expect(storedEvent.processedAt).not.toBeNull();
  });

  // ---------------------------------------------------
  // WORKER OWNERSHIP
  // ---------------------------------------------------

  it("does not complete an event after worker ownership changes", async () => {
    const eventId = await createEvent(
      "worker.test.ownership"
    );

    await makeEventAvailable(eventId);

    const db = await getDatabase();

    const workerId = `worker-${randomUUID()}`;

    const worker = new NotificationOutboxWorker({
      workerId,
      batchSize: 1,
      handlers: {
        "worker.test.ownership": async () => {
          await db
            .request()
            .input(
              "eventId",
              sql.UniqueIdentifier,
              eventId
            )
            .query(`
              UPDATE dbo.NotificationOutbox
              SET LockedBy = 'replacement-worker'
              WHERE EventId = @eventId;
            `);
        },
      },
    });

    const result = await worker.processBatch();

    expect(result).toEqual({
      claimed: 1,
      processed: 0,
      failed: 0,
      skipped: 1,
    });

    const storedEvent = await getStoredEvent(eventId);

    expect(storedEvent.status).toBe("processing");
    expect(storedEvent.lockedBy).toBe(
      "replacement-worker"
    );
    expect(storedEvent.processedAt).toBeNull();
  });

  // ---------------------------------------------------
  // HEARTBEAT RENEWAL
  // ---------------------------------------------------

  it("renews the event lock during a long-running handler", async () => {
    const eventId = await createEvent(
      "worker.test.heartbeat"
    );

    await makeEventAvailable(eventId);

    const worker = new NotificationOutboxWorker({
      workerId: `worker-${randomUUID()}`,
      batchSize: 1,
      lockTimeoutMinutes: 1,
      heartbeatIntervalSeconds: 1,
      handlers: {
        "worker.test.heartbeat": async () => {
          const initialEvent = await getStoredEvent(eventId);

          expect(initialEvent.lockedAt).not.toBeNull();

          const initialLockedAt = new Date(
            initialEvent.lockedAt
          ).getTime();

          await wait(1500);

          const renewedEvent = await getStoredEvent(eventId);

          expect(renewedEvent.lockedAt).not.toBeNull();

          expect(
            new Date(renewedEvent.lockedAt).getTime()
          ).toBeGreaterThan(initialLockedAt);
        },
      },
    });

    const result = await worker.processBatch();

    expect(result).toEqual({
      claimed: 1,
      processed: 1,
      failed: 0,
      skipped: 0,
    });

    const storedEvent = await getStoredEvent(eventId);

    expect(storedEvent.status).toBe("processed");
    expect(storedEvent.lockedAt).toBeNull();
  });

  // ---------------------------------------------------
  // HEARTBEAT DETECTS LOST OWNERSHIP
  // ---------------------------------------------------

  it("skips completion when heartbeat detects lost ownership", async () => {
    const eventId = await createEvent(
      "worker.test.heartbeat-ownership"
    );

    await makeEventAvailable(eventId);

    const db = await getDatabase();

    const worker = new NotificationOutboxWorker({
      workerId: `worker-${randomUUID()}`,
      batchSize: 1,
      lockTimeoutMinutes: 1,
      heartbeatIntervalSeconds: 1,
      handlers: {
        "worker.test.heartbeat-ownership": async () => {
          await db
            .request()
            .input("eventId", sql.UniqueIdentifier, eventId)
            .query(`
              UPDATE dbo.NotificationOutbox
              SET LockedBy = 'replacement-worker'
              WHERE EventId = @eventId;
            `);

          await wait(1500);
        },
      },
    });

    const result = await worker.processBatch();

    expect(result).toEqual({
      claimed: 1,
      processed: 0,
      failed: 0,
      skipped: 1,
    });

    const storedEvent = await getStoredEvent(eventId);

    expect(storedEvent.status).toBe("processing");
    expect(storedEvent.lockedBy).toBe(
      "replacement-worker"
    );
    expect(storedEvent.processedAt).toBeNull();
  });

  // ---------------------------------------------------
  // HEARTBEAT DATABASE ERROR
  // ---------------------------------------------------

  it("logs heartbeat database errors and skips event completion", async () => {
    const eventId = await createEvent(
      "worker.test.heartbeat-error"
    );

    await makeEventAvailable(eventId);

    const workerId = `worker-${randomUUID()}`;

    const heartbeatError = new Error(
      "Simulated heartbeat database failure."
    );

    const loggedErrors: Array<{
      eventId: string;
      workerId: string;
      error: unknown;
    }> = [];

    const renewalSpy = vi
      .spyOn(
        notificationOutboxService,
        "renewNotificationEventLock"
      )
      .mockRejectedValue(heartbeatError);

    const worker = new NotificationOutboxWorker({
      workerId,
      batchSize: 1,
      lockTimeoutMinutes: 1,
      heartbeatIntervalSeconds: 1,
      onHeartbeatError: (context) => {
        loggedErrors.push(context);
      },
      handlers: {
        "worker.test.heartbeat-error": async () => {
          await wait(1500);
        },
      },
    });

    const result = await worker.processBatch();

    expect(renewalSpy).toHaveBeenCalled();

    expect(loggedErrors).toHaveLength(1);
    expect(loggedErrors[0]).toEqual({
      eventId,
      workerId,
      error: heartbeatError,
    });

    expect(result).toEqual({
      claimed: 1,
      processed: 0,
      failed: 0,
      skipped: 1,
    });

    const storedEvent = await getStoredEvent(eventId);

    expect(storedEvent.status).toBe("processing");
    expect(storedEvent.lockedBy).toBe(workerId);
    expect(storedEvent.processedAt).toBeNull();
    expect(storedEvent.lastError).toBeNull();
  });

  // ---------------------------------------------------
  // HEARTBEAT CLEANUP
  // ---------------------------------------------------

  it("stops heartbeat renewal after event processing finishes", async () => {
    const eventId = await createEvent(
      "worker.test.heartbeat-cleanup"
    );

    await makeEventAvailable(eventId);

    const worker = new NotificationOutboxWorker({
      workerId: `worker-${randomUUID()}`,
      batchSize: 1,
      lockTimeoutMinutes: 1,
      heartbeatIntervalSeconds: 1,
      handlers: {
        "worker.test.heartbeat-cleanup": async () => {},
      },
    });

    const result = await worker.processBatch();

    expect(result.processed).toBe(1);

    const completedEvent = await getStoredEvent(eventId);

    expect(completedEvent.status).toBe("processed");
    expect(completedEvent.lockedAt).toBeNull();

    await wait(1200);

    const finalEvent = await getStoredEvent(eventId);

    expect(finalEvent.status).toBe("processed");
    expect(finalEvent.lockedAt).toBeNull();
    expect(finalEvent.lockedBy).toBeNull();
  });
});
