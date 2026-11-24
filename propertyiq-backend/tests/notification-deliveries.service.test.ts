
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { randomUUID } from "crypto";

import { getDatabase, sql } from "../src/config/database";
import { NotificationDeliveriesService } from "../src/modules/notifications/notification-deliveries.service";

// =====================================================
// TEST ORGANIZATION
// =====================================================

const organizationId =
  "4587318B-7DA1-482E-B0B7-587B9A26C7D8";

const otherOrganizationId =
  "290FE9A8-C8A3-40D7-9592-97E1BEDB04C4";

// =====================================================
// TEST USERS
// =====================================================

const accounts = {
  owner: {
    userId: "08281964-BFA4-4B29-86AC-65FE96A8AECE",
  },

  administrator: {
    userId: "62026EEE-8D8E-477A-A33E-A057D8F505F0",
  },

  member: {
    userId: "53A8EC9B-EE87-4577-A59B-985CA1B252E8",
  },

  viewer: {
    userId: "3E2BF33C-A551-4371-974A-B31F4DF838A1",
  },
};

// =====================================================
// TEST RECORD IDS
// =====================================================

const alertId = randomUUID();
const otherOrganizationAlertId = randomUUID();

const service = new NotificationDeliveriesService();

const createdDeliveryIds: string[] = [];

// =====================================================
// HELPERS
// =====================================================

function createDelivery(
  userId: string,
  channel: "email" | "sms" | "push" = "email",
  alertIdValue?: string,
  idempotencyKey?: string
) {
  return service.createDelivery(organizationId, {
    userId,
    channel,
    recipient: `${randomUUID()}@example.com`,
    subject: "Notification delivery integration test",
    message: "Created by automated integration tests.",
    ...(alertIdValue ? { alertId: alertIdValue } : {}),
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });
}

async function trackDelivery(
  userId: string,
  channel: "email" | "sms" | "push" = "email",
  alertIdValue?: string,
  idempotencyKey?: string
) {
  const delivery = await createDelivery(
    userId,
    channel,
    alertIdValue,
    idempotencyKey
  );

  if (delivery?.notificationDeliveryId) {
    createdDeliveryIds.push(
      delivery.notificationDeliveryId
    );
  }

  return delivery;
}

// =====================================================
// SETUP
// =====================================================

beforeAll(async () => {
  const pool = await getDatabase();

  // Create an alert belonging to the test organization.

  await pool
    .request()
    .input(
      "alertId",
      sql.UniqueIdentifier,
      alertId
    )
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      organizationId
    )
    .input(
      "propertyId",
      sql.UniqueIdentifier,
      "2BA345BB-3864-4E83-A0BE-E3B2CC915623"
    )
    .input(
      "title",
      sql.NVarChar(255),
      "Notification Delivery Test Alert"
    )
    .input(
      "severity",
      sql.NVarChar(50),
      "high"
    )
    .input(
      "status",
      sql.NVarChar(50),
      "open"
    )
    .query(`
      INSERT INTO dbo.Alerts (
        AlertId,
        OrganizationId,
        PropertyId,
        Title,
        Severity,
        Status,
        TriggeredAt
      )
      VALUES (
        @alertId,
        @organizationId,
        @propertyId,
        @title,
        @severity,
        @status,
        SYSUTCDATETIME()
      );
    `);

  // Create an alert belonging to another organization.

  await pool
    .request()
    .input(
      "alertId",
      sql.UniqueIdentifier,
      otherOrganizationAlertId
    )
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      otherOrganizationId
    )
    .input(
      "propertyId",
      sql.UniqueIdentifier,
      "2BA345BB-3864-4E83-A0BE-E3B2CC915623"
    )
    .input(
      "title",
      sql.NVarChar(255),
      "Other Organization Notification Test Alert"
    )
    .input(
      "severity",
      sql.NVarChar(50),
      "medium"
    )
    .input(
      "status",
      sql.NVarChar(50),
      "open"
    )
    .query(`
      INSERT INTO dbo.Alerts (
        AlertId,
        OrganizationId,
        PropertyId,
        Title,
        Severity,
        Status,
        TriggeredAt
      )
      VALUES (
        @alertId,
        @organizationId,
        @propertyId,
        @title,
        @severity,
        @status,
        SYSUTCDATETIME()
      );
    `);
});

// =====================================================
// CLEANUP
// =====================================================

afterAll(async () => {
  const pool = await getDatabase();

  // Delete test notification deliveries.

  for (const deliveryId of createdDeliveryIds) {
    await pool
      .request()
      .input(
        "deliveryId",
        sql.UniqueIdentifier,
        deliveryId
      )
      .input(
        "organizationId",
        sql.UniqueIdentifier,
        organizationId
      )
      .query(`
        DELETE FROM dbo.NotificationDeliveries

        WHERE NotificationDeliveryId = @deliveryId
          AND OrganizationId = @organizationId;
      `);
  }

  // Delete test alerts.

  await pool
    .request()
    .input(
      "alertId",
      sql.UniqueIdentifier,
      alertId
    )
    .input(
      "otherAlertId",
      sql.UniqueIdentifier,
      otherOrganizationAlertId
    )
    .query(`
      DELETE FROM dbo.Alerts
      WHERE AlertId IN (
        @alertId,
        @otherAlertId
      );
    `);
});

// =====================================================
// NOTIFICATION DELIVERY SERVICE TESTS
// =====================================================

describe("PropertyIQ notification delivery service", () => {
  // ===================================================
  // DELIVERY CREATION
  // ===================================================

  it("creates a queued email notification delivery", async () => {
    const delivery = await trackDelivery(
      accounts.owner.userId,
      "email"
    );

    expect(delivery).toBeDefined();
    expect(delivery!.notificationDeliveryId).toBeDefined();
    expect(delivery!.organizationId.toUpperCase())
      .toBe(organizationId);
    expect(delivery!.userId.toUpperCase())
      .toBe(accounts.owner.userId);
    expect(delivery!.channel).toBe("email");
    expect(delivery!.status).toBe("queued");
    expect(delivery!.sentAt).toBeNull();
    expect(delivery!.deliveredAt).toBeNull();
  });

  it("creates a queued SMS notification delivery", async () => {
    const delivery = await trackDelivery(
      accounts.member.userId,
      "sms"
    );

    expect(delivery).toBeDefined();
    expect(delivery!.channel).toBe("sms");
    expect(delivery!.status).toBe("queued");
  });

  it("creates a queued push notification delivery", async () => {
    const delivery = await trackDelivery(
      accounts.administrator.userId,
      "push"
    );

    expect(delivery).toBeDefined();
    expect(delivery!.channel).toBe("push");
    expect(delivery!.status).toBe("queued");
  });

  it("creates a delivery associated with an alert", async () => {
    const delivery = await trackDelivery(
      accounts.owner.userId,
      "email",
      alertId
    );

    expect(delivery).toBeDefined();
    expect(delivery!.alertId.toUpperCase()).toBe(
      alertId.toUpperCase()
    );
  });

  it("returns the existing delivery when the same idempotency key is used", async () => {
    const idempotencyKey = `test-${randomUUID()}`;

    const first = await trackDelivery(
      accounts.owner.userId,
      "email",
      undefined,
      idempotencyKey
    );

    const second = await createDelivery(
      accounts.owner.userId,
      "email",
      undefined,
      idempotencyKey
    );

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second!.notificationDeliveryId.toUpperCase()).toBe(
      first!.notificationDeliveryId.toUpperCase()
    );
  });

  it("creates separate deliveries for different idempotency keys", async () => {
    const first = await trackDelivery(
      accounts.owner.userId,
      "email",
      undefined,
      `test-${randomUUID()}`
    );

    const second = await trackDelivery(
      accounts.owner.userId,
      "email",
      undefined,
      `test-${randomUUID()}`
    );

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second!.notificationDeliveryId.toUpperCase()).not.toBe(
      first!.notificationDeliveryId.toUpperCase()
    );
  });

  it("rejects creating a delivery for a user outside the organization", async () => {
    const delivery = await service.createDelivery(
      otherOrganizationId,
      {
        userId: accounts.owner.userId,
        channel: "email",
        recipient: "outside@example.com",
        subject: "Unauthorized notification",
        message: "This should not be created.",
      }
    );

    expect(delivery).toBeNull();
  });

  it("rejects an alert belonging to another organization", async () => {
    const delivery = await service.createDelivery(
      organizationId,
      {
        userId: accounts.owner.userId,
        alertId: otherOrganizationAlertId,
        channel: "email",
        recipient: "wrong-alert@example.com",
        subject: "Invalid alert notification",
        message: "This should not be created.",
      }
    );

    expect(delivery).toBeNull();
  });

  it("rejects a nonexistent alert", async () => {
    const delivery = await service.createDelivery(
      organizationId,
      {
        userId: accounts.owner.userId,
        alertId: randomUUID(),
        channel: "email",
        recipient: "missing-alert@example.com",
      }
    );

    expect(delivery).toBeNull();
  });

  // ===================================================
  // DELIVERY HISTORY
  // ===================================================

  it("returns notification history for the requested user", async () => {
    const delivery = await trackDelivery(
      accounts.owner.userId
    );

    const history = await service.getDeliveries(
      organizationId,
      accounts.owner.userId
    );

    expect(Array.isArray(history)).toBe(true);

    expect(
      history.some(
        (item: any) =>
          item.notificationDeliveryId.toUpperCase() ===
          delivery!.notificationDeliveryId.toUpperCase()
      )
    ).toBe(true);

    expect(
      history.every(
        (item: any) =>
          item.userId.toUpperCase() ===
          accounts.owner.userId
      )
    ).toBe(true);
  });

  it("returns a delivery by ID for its owner", async () => {
    const delivery = await trackDelivery(
      accounts.member.userId
    );

    const result = await service.getDelivery(
      delivery!.notificationDeliveryId,
      organizationId,
      accounts.member.userId
    );

    expect(result).toBeDefined();
    expect(result!.notificationDeliveryId.toUpperCase())
      .toBe(delivery!.notificationDeliveryId.toUpperCase());
  });

  it("does not return another user's delivery", async () => {
    const delivery = await trackDelivery(
      accounts.member.userId
    );

    const result = await service.getDelivery(
      delivery!.notificationDeliveryId,
      organizationId,
      accounts.owner.userId
    );

    expect(result).toBeNull();
  });

  it("does not return delivery history through another organization", async () => {
    const history = await service.getDeliveries(
      otherOrganizationId,
      accounts.owner.userId
    );

    expect(history).toHaveLength(0);
  });

  // ===================================================
  // STATUS TRANSITIONS
  // ===================================================

  it("transitions queued to sent and sets SentAt", async () => {
    const delivery = await trackDelivery(
      accounts.owner.userId
    );

    const updated = await service.updateDeliveryStatus(
      delivery!.notificationDeliveryId,
      organizationId,
      {
        status: "sent",
        providerMessageId: "provider-message-001",
      }
    );

    expect(updated).toBeDefined();
    expect(updated!.status).toBe("sent");
    expect(updated!.sentAt).toBeTruthy();
    expect(updated!.deliveredAt).toBeNull();
    expect(updated!.providerMessageId).toBe(
      "provider-message-001"
    );
  });

  it("transitions sent to delivered and sets DeliveredAt", async () => {
    const delivery = await trackDelivery(
      accounts.owner.userId
    );

    const sent = await service.updateDeliveryStatus(
      delivery!.notificationDeliveryId,
      organizationId,
      {
        status: "sent",
      }
    );

    expect(sent!.status).toBe("sent");

    const delivered = await service.updateDeliveryStatus(
      delivery!.notificationDeliveryId,
      organizationId,
      {
        status: "delivered",
      }
    );

    expect(delivered!.status).toBe("delivered");
    expect(delivered!.sentAt).toBeTruthy();
    expect(delivered!.deliveredAt).toBeTruthy();
  });

  it("allows queued to failed", async () => {
    const delivery = await trackDelivery(
      accounts.owner.userId
    );

    const updated = await service.updateDeliveryStatus(
      delivery!.notificationDeliveryId,
      organizationId,
      {
        status: "failed",
        errorMessage: "Email provider rejected the request.",
      }
    );

    expect(updated!.status).toBe("failed");
    expect(updated!.errorMessage).toBe(
      "Email provider rejected the request."
    );
    expect(updated!.sentAt).toBeNull();
    expect(updated!.deliveredAt).toBeNull();
  });

  it("allows sent to failed", async () => {
    const delivery = await trackDelivery(
      accounts.owner.userId
    );

    await service.updateDeliveryStatus(
      delivery!.notificationDeliveryId,
      organizationId,
      {
        status: "sent",
      }
    );

    const updated = await service.updateDeliveryStatus(
      delivery!.notificationDeliveryId,
      organizationId,
      {
        status: "failed",
        errorMessage: "Delivery receipt failed.",
      }
    );

    expect(updated!.status).toBe("failed");
    expect(updated!.sentAt).toBeTruthy();
    expect(updated!.errorMessage).toBe(
      "Delivery receipt failed."
    );
  });

  // ===================================================
  // INVALID STATUS TRANSITIONS
  // ===================================================

  it("rejects queued directly to delivered", async () => {
    const delivery = await trackDelivery(
      accounts.owner.userId
    );

    await expect(
      service.updateDeliveryStatus(
        delivery!.notificationDeliveryId,
        organizationId,
        {
          status: "delivered",
        }
      )
    ).rejects.toThrow("Invalid notification delivery status transition");
  });

  it("rejects queued directly to sent after it has failed", async () => {
    const delivery = await trackDelivery(
      accounts.owner.userId
    );

    await service.updateDeliveryStatus(
      delivery!.notificationDeliveryId,
      organizationId,
      {
        status: "failed",
      }
    );

    await expect(
      service.updateDeliveryStatus(
        delivery!.notificationDeliveryId,
        organizationId,
        {
          status: "sent",
        }
      )
    ).rejects.toThrow("Invalid notification delivery status transition");
  });

  it("rejects updates to delivered terminal deliveries", async () => {
    const delivery = await trackDelivery(
      accounts.owner.userId
    );

    await service.updateDeliveryStatus(
      delivery!.notificationDeliveryId,
      organizationId,
      {
        status: "sent",
      }
    );

    await service.updateDeliveryStatus(
      delivery!.notificationDeliveryId,
      organizationId,
      {
        status: "delivered",
      }
    );

    await expect(
      service.updateDeliveryStatus(
        delivery!.notificationDeliveryId,
        organizationId,
        {
          status: "failed",
        }
      )
    ).rejects.toThrow("Invalid notification delivery status transition");
  });

  it("rejects updates to failed terminal deliveries", async () => {
    const delivery = await trackDelivery(
      accounts.owner.userId
    );

    await service.updateDeliveryStatus(
      delivery!.notificationDeliveryId,
      organizationId,
      {
        status: "failed",
      }
    );

    await expect(
      service.updateDeliveryStatus(
        delivery!.notificationDeliveryId,
        organizationId,
        {
          status: "sent",
        }
      )
    ).rejects.toThrow("Invalid notification delivery status transition");
  });

  // ===================================================
  // ORGANIZATION ISOLATION
  // ===================================================

  it("does not update a delivery through another organization", async () => {
    const delivery = await trackDelivery(
      accounts.owner.userId
    );

    const result = await service.updateDeliveryStatus(
      delivery!.notificationDeliveryId,
      otherOrganizationId,
      {
        status: "sent",
      }
    );

    expect(result).toBeNull();

    const unchanged = await service.getDelivery(
      delivery!.notificationDeliveryId,
      organizationId,
      accounts.owner.userId
    );

    expect(unchanged!.status).toBe("queued");
  });

  it("returns null when updating a nonexistent delivery", async () => {
    const result = await service.updateDeliveryStatus(
      randomUUID(),
      organizationId,
      {
        status: "sent",
      }
    );

    expect(result).toBeNull();
  });
});
