
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import request from "supertest";
import jwt from "jsonwebtoken";

import app from "../src/app";
import { authConfig } from "../src/config/auth";
import { getDatabase, sql } from "../src/config/database";

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
// TEST DATA
// =====================================================

const uniqueSuffix = Date.now();

const testDeliveries = [
  {
    userId: accounts.owner.userId,
    channel: "email",
    recipient: `owner-${uniqueSuffix}@example.com`,
    subject: "Owner test notification",
    message: "Owner notification delivery test.",
    status: "queued",
  },
  {
    userId: accounts.owner.userId,
    channel: "push",
    recipient: `owner-device-${uniqueSuffix}`,
    subject: null,
    message: "Owner push notification test.",
    status: "sent",
  },
  {
    userId: accounts.member.userId,
    channel: "sms",
    recipient: `555${String(uniqueSuffix).slice(-7)}`,
    subject: null,
    message: "Member notification delivery test.",
    status: "delivered",
  },
  {
    userId: accounts.administrator.userId,
    channel: "email",
    recipient: `admin-${uniqueSuffix}@example.com`,
    subject: "Administrator test notification",
    message: "Administrator notification delivery test.",
    status: "failed",
  },
];

// =====================================================
// CREATED DELIVERY TRACKING
// =====================================================

const createdDeliveryIds: string[] = [];

// =====================================================
// ACCESS TOKEN
// =====================================================

function createAccessToken(userId: string) {
  return jwt.sign(
    { type: "access" },
    authConfig.accessTokenSecret,
    {
      subject: userId,
      expiresIn: "5m",
    }
  );
}

// =====================================================
// DATABASE FIXTURES
// =====================================================

beforeAll(async () => {
  const pool = await getDatabase();

  for (const delivery of testDeliveries) {
    const result = await pool
      .request()
      .input(
        "organizationId",
        sql.UniqueIdentifier,
        organizationId
      )
      .input(
        "userId",
        sql.UniqueIdentifier,
        delivery.userId
      )
      .input(
        "channel",
        sql.NVarChar(30),
        delivery.channel
      )
      .input(
        "recipient",
        sql.NVarChar(255),
        delivery.recipient
      )
      .input(
        "subject",
        sql.NVarChar(255),
        delivery.subject
      )
      .input(
        "message",
        sql.NVarChar(2000),
        delivery.message
      )
      .input(
        "status",
        sql.NVarChar(30),
        delivery.status
      )
      .query(`
        INSERT INTO dbo.NotificationDeliveries (
          OrganizationId,
          UserId,
          Channel,
          Recipient,
          Subject,
          Message,
          Status,
          SentAt,
          DeliveredAt
        )

        OUTPUT INSERTED.NotificationDeliveryId
          AS notificationDeliveryId

        VALUES (
          @organizationId,
          @userId,
          @channel,
          @recipient,
          @subject,
          @message,
          @status,
          CASE
            WHEN @status IN ('sent', 'delivered')
            THEN SYSUTCDATETIME()
            ELSE NULL
          END,
          CASE
            WHEN @status = 'delivered'
            THEN SYSUTCDATETIME()
            ELSE NULL
          END
        );
      `);

    createdDeliveryIds.push(
      result.recordset[0].notificationDeliveryId
    );
  }
});

// =====================================================
// CLEANUP
// =====================================================

afterAll(async () => {
  if (createdDeliveryIds.length === 0) {
    return;
  }

  const pool = await getDatabase();

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
});

// =====================================================
// NOTIFICATION DELIVERY TESTS
// =====================================================

describe("PropertyIQ notification deliveries integration", () => {
  // ===================================================
  // AUTHENTICATION
  // ===================================================

  it("rejects unauthenticated delivery history requests", async () => {
    const response = await request(app)
      .get("/api/v1/notifications/deliveries")
      .query({ organizationId });

    expect(response.status).toBe(401);
  });

  it("rejects unauthenticated delivery detail requests", async () => {
    const response = await request(app)
      .get(
        "/api/v1/notifications/deliveries/00000000-0000-0000-0000-000000000001"
      )
      .query({ organizationId });

    expect(response.status).toBe(401);
  });

  // ===================================================
  // REQUIRED ORGANIZATION
  // ===================================================

  it("requires an organization ID when listing deliveries", async () => {
    const token = createAccessToken(accounts.owner.userId);

    const response = await request(app)
      .get("/api/v1/notifications/deliveries")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(400);
  });

  it("requires an organization ID when retrieving a delivery", async () => {
    const token = createAccessToken(accounts.owner.userId);

    const response = await request(app)
      .get(
        "/api/v1/notifications/deliveries/00000000-0000-0000-0000-000000000001"
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(400);
  });

  // ===================================================
  // ROLE READ ACCESS
  // ===================================================

  it("allows the Owner to list their notification deliveries", async () => {
    const token = createAccessToken(accounts.owner.userId);

    const response = await request(app)
      .get("/api/v1/notifications/deliveries")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);

    expect(
      response.body.data.length
    ).toBeGreaterThanOrEqual(2);

    expect(
      response.body.data.every(
        (delivery: { userId: string }) =>
          delivery.userId.toUpperCase() ===
          accounts.owner.userId
      )
    ).toBe(true);
  });

  it("allows the Administrator to list their notification deliveries", async () => {
    const token = createAccessToken(accounts.administrator.userId);

    const response = await request(app)
      .get("/api/v1/notifications/deliveries")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(
      response.body.data.every(
        (delivery: { userId: string }) =>
          delivery.userId.toUpperCase() ===
          accounts.administrator.userId
      )
    ).toBe(true);
  });

  it("allows a Member to list their notification deliveries", async () => {
    const token = createAccessToken(accounts.member.userId);

    const response = await request(app)
      .get("/api/v1/notifications/deliveries")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(
      response.body.data.every(
        (delivery: { userId: string }) =>
          delivery.userId.toUpperCase() ===
          accounts.member.userId
      )
    ).toBe(true);
  });

  it("allows a Viewer to list their notification deliveries", async () => {
    const token = createAccessToken(accounts.viewer.userId);

    const response = await request(app)
      .get("/api/v1/notifications/deliveries")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(
      response.body.data.every(
        (delivery: { userId: string }) =>
          delivery.userId.toUpperCase() ===
          accounts.viewer.userId
      )
    ).toBe(true);
  });

  // ===================================================
  // DELIVERY DETAIL
  // ===================================================

  it("allows a user to retrieve their own delivery", async () => {
    const token = createAccessToken(accounts.owner.userId);
    const deliveryId = createdDeliveryIds[0];

    const response = await request(app)
      .get(`/api/v1/notifications/deliveries/${deliveryId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toBeDefined();

    expect(
      response.body.data.notificationDeliveryId.toUpperCase()
    ).toBe(deliveryId.toUpperCase());

    expect(
      response.body.data.userId.toUpperCase()
    ).toBe(accounts.owner.userId);

    expect(response.body.data.channel).toBe("email");
    expect(response.body.data.status).toBe("queued");
  });

  it("returns 404 for a delivery that does not exist", async () => {
    const token = createAccessToken(accounts.owner.userId);

    const response = await request(app)
      .get(
        "/api/v1/notifications/deliveries/00000000-0000-0000-0000-000000000001"
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  // ===================================================
  // USER ISOLATION
  // ===================================================

  it("does not expose another user's delivery in history", async () => {
    const token = createAccessToken(accounts.owner.userId);

    const response = await request(app)
      .get("/api/v1/notifications/deliveries")
      .query({
        organizationId,
        userId: accounts.member.userId,
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(
      response.body.data.every(
        (delivery: { userId: string }) =>
          delivery.userId.toUpperCase() ===
          accounts.owner.userId
      )
    ).toBe(true);
  });

  it("does not allow retrieving another user's delivery", async () => {
    const token = createAccessToken(accounts.owner.userId);
    const memberDeliveryId = createdDeliveryIds[2];

    const response = await request(app)
      .get(
        `/api/v1/notifications/deliveries/${memberDeliveryId}`
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  // ===================================================
  // ORGANIZATION ISOLATION
  // ===================================================

  it("rejects access through another organization", async () => {
    const token = createAccessToken(accounts.owner.userId);

    const response = await request(app)
      .get("/api/v1/notifications/deliveries")
      .query({ organizationId: otherOrganizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("does not expose a delivery through another organization", async () => {
    const token = createAccessToken(accounts.owner.userId);
    const deliveryId = createdDeliveryIds[0];

    const response = await request(app)
      .get(`/api/v1/notifications/deliveries/${deliveryId}`)
      .query({ organizationId: otherOrganizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  // ===================================================
  // PUBLIC WRITE RESTRICTIONS
  // ===================================================

  it("does not expose a public delivery creation endpoint", async () => {
    const token = createAccessToken(accounts.owner.userId);

    const response = await request(app)
      .post("/api/v1/notifications/deliveries")
      .set("Authorization", `Bearer ${token}`)
      .send({
        organizationId,
        userId: accounts.owner.userId,
        channel: "email",
        recipient: "unauthorized@example.com",
      });

    expect([404, 405]).toContain(response.status);
  });

  it("does not expose a public delivery status update endpoint", async () => {
    const token = createAccessToken(accounts.owner.userId);
    const deliveryId = createdDeliveryIds[0];

    const response = await request(app)
      .patch(`/api/v1/notifications/deliveries/${deliveryId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "sent" });

    expect([404, 405]).toContain(response.status);
  });
});
