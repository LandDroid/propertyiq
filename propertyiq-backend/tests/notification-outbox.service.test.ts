
import {
  afterAll,
  describe,
  expect,
  it,
} from "vitest";

import { randomUUID } from "crypto";

import { getDatabase, sql } from "../src/config/database";

import {
  createNotificationEvent,
  claimNotificationEvents,
  completeNotificationEvent,
  failNotificationEvent,
} from "../src/modules/notifications/notification-outbox.service";

// =====================================================
// TEST ORGANIZATIONS
// =====================================================

const organizationId =
  "4587318B-7DA1-482E-B0B7-587B9A26C7D8";

const otherOrganizationId =
  "290FE9A8-C8A3-40D7-9592-97E1BEDB04C4";

// =====================================================
// TEST RECORDS
// =====================================================

const createdEventIds: string[] = [];

const testPayload = {
  alertId: randomUUID(),
  title: "Notification Outbox Integration Test",
  severity: "high",
};

// =====================================================
// HELPERS
// =====================================================

function createEvent(
  idempotencyKey = randomUUID(),
  organization = organizationId
) {
  return createNotificationEvent(organization, {
    eventType: "alert.created",
    aggregateType: "Alert",
    aggregateId: testPayload.alertId,
    idempotencyKey,
    payload: {
      ...testPayload,
    },
  });
}

async function trackEvent(
  idempotencyKey = randomUUID(),
  organization = organizationId
) {
  const event = await createEvent(
    idempotencyKey,
    organization
  );

  if (event?.eventId) {
    createdEventIds.push(event.eventId);
  }

  return event;
}

async function makeEventAvailable(eventId: string) {
  const pool = await getDatabase();

  await pool
    .request()
    .input("eventId", sql.UniqueIdentifier, eventId)
    .query(`
      UPDATE dbo.NotificationOutbox

      SET AvailableAt = SYSUTCDATETIME()

      WHERE EventId = @eventId
        AND Status = 'queued';
    `);
}

async function expireEventLock(
  eventId: string,
  attempts?: number
) {
  const pool = await getDatabase();

  const request = pool
    .request()
    .input("eventId", sql.UniqueIdentifier, eventId);

  if (attempts !== undefined) {
    request.input("attempts", sql.Int, attempts);
  }

  await request.query(`
    UPDATE dbo.NotificationOutbox

    SET
      LockedAt = DATEADD(
        MINUTE,
        -10,
        SYSUTCDATETIME()
      )

      ${attempts !== undefined ? ", Attempts = @attempts" : ""}

    WHERE EventId = @eventId
      AND Status = 'processing';
  `);
}

async function getStoredEvent(eventId: string) {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input("eventId", sql.UniqueIdentifier, eventId)
    .query(`
      SELECT
        EventId AS eventId,
        Status AS status,
        Attempts AS attempts,
        LockedAt AS lockedAt,
        LockedBy AS lockedBy,
        LastError AS lastError

      FROM dbo.NotificationOutbox

      WHERE EventId = @eventId;
    `);

  return result.recordset[0] ?? null;
}

// Claims the requested event and completes any other
// events returned in the same batch.

async function claimSpecificEvent(
  eventId: string,
  workerId = randomUUID()
) {
  await makeEventAvailable(eventId);

  const claimed = await claimNotificationEvents({
    workerId,
    batchSize: 100,
  });

  const target = claimed.find(
    (event: any) =>
      event.eventId.toUpperCase() === eventId.toUpperCase()
  );

  for (const event of claimed) {
    if (
      event.eventId.toUpperCase() !== eventId.toUpperCase()
    ) {
      await completeNotificationEvent({
        eventId: event.eventId,
        workerId,
      });
    }
  }

  return {
    event: target ?? null,
    workerId,
    claimed,
  };
}

// =====================================================
// CLEANUP
// =====================================================

afterAll(async () => {
  const pool = await getDatabase();

  for (const eventId of createdEventIds) {
    await pool
      .request()
      .input("eventId", sql.UniqueIdentifier, eventId)
      .query(`
        DELETE FROM dbo.NotificationOutbox

        WHERE EventId = @eventId;
      `);
  }
});

// =====================================================
// NOTIFICATION OUTBOX SERVICE TESTS
// =====================================================

describe("PropertyIQ notification outbox service", () => {
  // ===================================================
  // EVENT CREATION
  // ===================================================

  it("creates a queued notification event", async () => {
    const event = await trackEvent();

    expect(event).toBeDefined();
    expect(event!.eventId).toBeDefined();

    expect(event!.organizationId.toUpperCase())
      .toBe(organizationId);

    expect(event!.eventType).toBe("alert.created");
    expect(event!.aggregateType).toBe("Alert");

    expect(event!.aggregateId.toUpperCase())
      .toBe(testPayload.alertId.toUpperCase());

    expect(event!.status).toBe("queued");
    expect(event!.attempts).toBe(0);
    expect(event!.lockedAt).toBeNull();
    expect(event!.lockedBy).toBeNull();
    expect(event!.processedAt).toBeNull();

    const payload =
      typeof event!.payload === "string"
        ? JSON.parse(event!.payload)
        : event!.payload;

    expect(payload.alertId).toBe(testPayload.alertId);
    expect(payload.severity).toBe("high");
  });

  it("does not create duplicate events with the same idempotency key", async () => {
    const idempotencyKey = randomUUID();

    const first = await trackEvent(idempotencyKey);

    const duplicate = await createEvent(idempotencyKey);

    expect(first).toBeDefined();
    expect(duplicate).toBeNull();
  });

  it("allows the same idempotency key in another organization", async () => {
    const idempotencyKey = randomUUID();

    const first = await trackEvent(
      idempotencyKey,
      organizationId
    );

    const second = await trackEvent(
      idempotencyKey,
      otherOrganizationId
    );

    expect(first).toBeDefined();
    expect(second).toBeDefined();

    expect(first!.eventId.toUpperCase())
      .not.toBe(second!.eventId.toUpperCase());

    expect(second!.organizationId.toUpperCase())
      .toBe(otherOrganizationId);
  });

  it("preserves event organization isolation", async () => {
    const event = await trackEvent(
      randomUUID(),
      otherOrganizationId
    );

    expect(event).toBeDefined();

    expect(event!.organizationId.toUpperCase())
      .toBe(otherOrganizationId);
  });

  // ===================================================
  // EVENT CLAIMING
  // ===================================================

  it("claims queued events and increments attempts", async () => {
    const event = await trackEvent();

    const result = await claimSpecificEvent(
      event!.eventId
    );

    expect(result.event).toBeDefined();
    expect(result.event!.status).toBe("processing");
    expect(result.event!.attempts).toBe(1);
    expect(result.event!.lockedAt).toBeTruthy();
    expect(result.event!.lockedBy).toBe(result.workerId);
  });

  it("does not claim the same event twice while it is processing", async () => {
    const event = await trackEvent();

    const first = await claimSpecificEvent(
      event!.eventId
    );

    expect(first.event).toBeDefined();

    const second = await claimNotificationEvents({
      workerId: randomUUID(),
      batchSize: 100,
    });

    expect(
      second.some(
        (item: any) =>
          item.eventId.toUpperCase() ===
          event!.eventId.toUpperCase()
      )
    ).toBe(false);
  });

  // ===================================================
  // STALE LOCK RECOVERY
  // ===================================================

  it("recovers an abandoned event and allows another worker to claim it", async () => {
    const event = await trackEvent();

    const originalClaim = await claimSpecificEvent(
      event!.eventId
    );

    expect(originalClaim.event).toBeDefined();
    expect(originalClaim.event!.attempts).toBe(1);

    await expireEventLock(event!.eventId);

    const recoveryWorkerId = randomUUID();

    const recovered = await claimNotificationEvents({
      workerId: recoveryWorkerId,
      batchSize: 100,
    });

    const recoveredEvent = recovered.find(
      (item: any) =>
        item.eventId.toUpperCase() ===
        event!.eventId.toUpperCase()
    );

    expect(recoveredEvent).toBeDefined();
    expect(recoveredEvent!.status).toBe("processing");
    expect(recoveredEvent!.attempts).toBe(2);
    expect(recoveredEvent!.lockedBy).toBe(
      recoveryWorkerId
    );

    for (const item of recovered) {
      if (
        item.eventId.toUpperCase() !==
        event!.eventId.toUpperCase()
      ) {
        await completeNotificationEvent({
          eventId: item.eventId,
          workerId: recoveryWorkerId,
        });
      }
    }
  });

  it("prevents the previous worker from completing a recovered event", async () => {
    const event = await trackEvent();

    const originalClaim = await claimSpecificEvent(
      event!.eventId
    );

    expect(originalClaim.event).toBeDefined();

    await expireEventLock(event!.eventId);

    const recoveryWorkerId = randomUUID();

    const recovered = await claimNotificationEvents({
      workerId: recoveryWorkerId,
      batchSize: 100,
    });

    const recoveredEvent = recovered.find(
      (item: any) =>
        item.eventId.toUpperCase() ===
        event!.eventId.toUpperCase()
    );

    expect(recoveredEvent).toBeDefined();

    const previousWorkerResult =
      await completeNotificationEvent({
        eventId: event!.eventId,
        workerId: originalClaim.workerId,
      });

    expect(previousWorkerResult).toBeNull();

    const currentWorkerResult =
      await completeNotificationEvent({
        eventId: event!.eventId,
        workerId: recoveryWorkerId,
      });

    expect(currentWorkerResult).toBeDefined();
    expect(currentWorkerResult!.status).toBe("processed");

    for (const item of recovered) {
      if (
        item.eventId.toUpperCase() !==
        event!.eventId.toUpperCase()
      ) {
        await completeNotificationEvent({
          eventId: item.eventId,
          workerId: recoveryWorkerId,
        });
      }
    }
  });

  it("marks an abandoned event failed when it has exhausted five attempts", async () => {
    const event = await trackEvent();

    const originalClaim = await claimSpecificEvent(
      event!.eventId
    );

    expect(originalClaim.event).toBeDefined();

    await expireEventLock(event!.eventId, 5);

    const recoveryWorkerId = randomUUID();

    const recovered = await claimNotificationEvents({
      workerId: recoveryWorkerId,
      batchSize: 100,
    });

    expect(
      recovered.some(
        (item: any) =>
          item.eventId.toUpperCase() ===
          event!.eventId.toUpperCase()
      )
    ).toBe(false);

    const storedEvent = await getStoredEvent(
      event!.eventId
    );

    expect(storedEvent).toBeDefined();
    expect(storedEvent.status).toBe("failed");
    expect(storedEvent.attempts).toBe(5);
    expect(storedEvent.lockedAt).toBeNull();
    expect(storedEvent.lockedBy).toBeNull();
    expect(storedEvent.lastError).toContain(
      "Worker lock expired"
    );

    for (const item of recovered) {
      await completeNotificationEvent({
        eventId: item.eventId,
        workerId: recoveryWorkerId,
      });
    }
  });

  // ===================================================
  // EVENT COMPLETION
  // ===================================================

  it("completes an event owned by the current worker", async () => {
    const event = await trackEvent();

    const claimed = await claimSpecificEvent(
      event!.eventId
    );

    const completed = await completeNotificationEvent({
      eventId: event!.eventId,
      workerId: claimed.workerId,
    });

    expect(completed).toBeDefined();
    expect(completed!.status).toBe("processed");
    expect(completed!.processedAt).toBeTruthy();
    expect(completed!.lockedAt).toBeNull();
    expect(completed!.lockedBy).toBeNull();
  });

  it("does not allow another worker to complete an event", async () => {
    const event = await trackEvent();

    const claimed = await claimSpecificEvent(
      event!.eventId
    );

    const result = await completeNotificationEvent({
      eventId: event!.eventId,
      workerId: randomUUID(),
    });

    expect(result).toBeNull();

    const stillOwned = await completeNotificationEvent({
      eventId: event!.eventId,
      workerId: claimed.workerId,
    });

    expect(stillOwned).toBeDefined();
    expect(stillOwned!.status).toBe("processed");
  });

  it("does not complete an event that does not exist", async () => {
    const result = await completeNotificationEvent({
      eventId: randomUUID(),
      workerId: randomUUID(),
    });

    expect(result).toBeNull();
  });

  // ===================================================
  // EVENT FAILURE AND RETRIES
  // ===================================================

  it("returns a failed event to the queue for retry", async () => {
    const event = await trackEvent();

    const claimed = await claimSpecificEvent(
      event!.eventId
    );

    const failed = await failNotificationEvent({
      eventId: event!.eventId,
      workerId: claimed.workerId,
      errorMessage: "Temporary notification processing failure.",
      retryDelaySeconds: 1,
    });

    expect(failed).toBeDefined();
    expect(failed!.status).toBe("queued");
    expect(failed!.attempts).toBe(1);
    expect(failed!.lastError).toBe(
      "Temporary notification processing failure."
    );
    expect(failed!.lockedAt).toBeNull();
    expect(failed!.lockedBy).toBeNull();
  });

  it("marks an event failed after five unsuccessful attempts", async () => {
    const event = await trackEvent();

    let finalResult: any = null;

    for (let attempt = 1; attempt <= 5; attempt++) {
      const claimed = await claimSpecificEvent(
        event!.eventId
      );

      expect(claimed.event).toBeDefined();
      expect(claimed.event!.attempts).toBe(attempt);

      finalResult = await failNotificationEvent({
        eventId: event!.eventId,
        workerId: claimed.workerId,
        errorMessage: `Processing attempt ${attempt} failed.`,
        retryDelaySeconds: 1,
      });

      expect(finalResult).toBeDefined();

      if (attempt < 5) {
        expect(finalResult.status).toBe("queued");
      }
    }

    expect(finalResult.status).toBe("failed");
    expect(finalResult.attempts).toBe(5);
    expect(finalResult.lastError).toBe(
      "Processing attempt 5 failed."
    );
  });

  it("does not allow another worker to fail an event", async () => {
    const event = await trackEvent();

    const claimed = await claimSpecificEvent(
      event!.eventId
    );

    const result = await failNotificationEvent({
      eventId: event!.eventId,
      workerId: randomUUID(),
      errorMessage: "Unauthorized worker failure.",
      retryDelaySeconds: 1,
    });

    expect(result).toBeNull();

    const validFailure = await failNotificationEvent({
      eventId: event!.eventId,
      workerId: claimed.workerId,
      errorMessage: "Valid worker failure.",
      retryDelaySeconds: 1,
    });

    expect(validFailure).toBeDefined();
    expect(validFailure!.status).toBe("queued");
  });

  it("does not fail an event that does not exist", async () => {
    const result = await failNotificationEvent({
      eventId: randomUUID(),
      workerId: randomUUID(),
      errorMessage: "Missing event.",
      retryDelaySeconds: 1,
    });

    expect(result).toBeNull();
  });
});
