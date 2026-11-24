
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

const userIds = Object.values(accounts).map(
  (account) => account.userId
);

// =====================================================
// ORIGINAL PREFERENCES SNAPSHOT
// =====================================================

type PreferenceSnapshot = {
  NotificationPreferenceId: string;
  OrganizationId: string;
  UserId: string;
  EmailEnabled: boolean;
  SmsEnabled: boolean;
  PushEnabled: boolean;
  CriticalAlertsOnly: boolean;
  CreatedAt: Date;
  UpdatedAt: Date;
};

let originalPreferences: PreferenceSnapshot[] = [];

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
// SNAPSHOT AND CLEANUP
// =====================================================

beforeAll(async () => {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input("organizationId", sql.UniqueIdentifier, organizationId)
    .query(`
      SELECT
        NotificationPreferenceId,
        OrganizationId,
        UserId,
        EmailEnabled,
        SmsEnabled,
        PushEnabled,
        CriticalAlertsOnly,
        CreatedAt,
        UpdatedAt

      FROM dbo.NotificationPreferences

      WHERE OrganizationId = @organizationId;
    `);

  originalPreferences = result.recordset.filter(
    (preference: PreferenceSnapshot) =>
      userIds.some(
        (userId) =>
          userId.toUpperCase() === preference.UserId.toUpperCase()
      )
  );
});

afterAll(async () => {
  const pool = await getDatabase();

  // Remove preferences created or changed by these tests.

  for (const userId of userIds) {
    await pool
      .request()
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        DELETE FROM dbo.NotificationPreferences

        WHERE OrganizationId = @organizationId
          AND UserId = @userId;
      `);
  }

  // Restore the original preference records.

  for (const preference of originalPreferences) {
    await pool
      .request()
      .input(
        "preferenceId",
        sql.UniqueIdentifier,
        preference.NotificationPreferenceId
      )
      .input(
        "organizationId",
        sql.UniqueIdentifier,
        preference.OrganizationId
      )
      .input(
        "userId",
        sql.UniqueIdentifier,
        preference.UserId
      )
      .input(
        "emailEnabled",
        sql.Bit,
        preference.EmailEnabled
      )
      .input(
        "smsEnabled",
        sql.Bit,
        preference.SmsEnabled
      )
      .input(
        "pushEnabled",
        sql.Bit,
        preference.PushEnabled
      )
      .input(
        "criticalAlertsOnly",
        sql.Bit,
        preference.CriticalAlertsOnly
      )
      .input(
        "createdAt",
        sql.DateTime2,
        preference.CreatedAt
      )
      .input(
        "updatedAt",
        sql.DateTime2,
        preference.UpdatedAt
      )
      .query(`
        INSERT INTO dbo.NotificationPreferences (
          NotificationPreferenceId,
          OrganizationId,
          UserId,
          EmailEnabled,
          SmsEnabled,
          PushEnabled,
          CriticalAlertsOnly,
          CreatedAt,
          UpdatedAt
        )

        VALUES (
          @preferenceId,
          @organizationId,
          @userId,
          @emailEnabled,
          @smsEnabled,
          @pushEnabled,
          @criticalAlertsOnly,
          @createdAt,
          @updatedAt
        );
      `);
  }
});

// =====================================================
// NOTIFICATION PREFERENCES TESTS
// =====================================================

describe("PropertyIQ notification preferences integration", () => {
  // ===================================================
  // AUTHENTICATION
  // ===================================================

  it("rejects unauthenticated requests", async () => {
    const response = await request(app)
      .get("/api/v1/notifications/preferences")
      .query({ organizationId });

    expect(response.status).toBe(401);
  });

  it("rejects unauthenticated preference updates", async () => {
    const response = await request(app)
      .patch("/api/v1/notifications/preferences")
      .query({ organizationId })
      .send({ emailEnabled: false });

    expect(response.status).toBe(401);
  });

  // ===================================================
  // REQUIRED ORGANIZATION
  // ===================================================

  it("requires an organization ID", async () => {
    const token = createAccessToken(accounts.owner.userId);

    const response = await request(app)
      .get("/api/v1/notifications/preferences")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(400);
  });

  // ===================================================
  // DEFAULT PREFERENCES
  // ===================================================

  it("creates default preferences when none exist", async () => {
    const token = createAccessToken(accounts.owner.userId);

    const response = await request(app)
      .get("/api/v1/notifications/preferences")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toBeDefined();

    expect(response.body.data.organizationId.toUpperCase())
      .toBe(organizationId);

    expect(response.body.data.userId.toUpperCase())
      .toBe(accounts.owner.userId);

    expect(response.body.data.emailEnabled).toBe(true);
    expect(response.body.data.smsEnabled).toBe(false);
    expect(response.body.data.pushEnabled).toBe(true);
    expect(response.body.data.criticalAlertsOnly).toBe(false);
  });

  // ===================================================
  // ROLE READ ACCESS
  // ===================================================

  it("allows the Owner to retrieve preferences", async () => {
    const token = createAccessToken(accounts.owner.userId);

    const response = await request(app)
      .get("/api/v1/notifications/preferences")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toBeDefined();
  });

  it("allows the Administrator to retrieve preferences", async () => {
    const token = createAccessToken(accounts.administrator.userId);

    const response = await request(app)
      .get("/api/v1/notifications/preferences")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.userId.toUpperCase())
      .toBe(accounts.administrator.userId);
  });

  it("allows a Member to retrieve preferences", async () => {
    const token = createAccessToken(accounts.member.userId);

    const response = await request(app)
      .get("/api/v1/notifications/preferences")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.userId.toUpperCase())
      .toBe(accounts.member.userId);
  });

  it("allows a Viewer to retrieve preferences", async () => {
    const token = createAccessToken(accounts.viewer.userId);

    const response = await request(app)
      .get("/api/v1/notifications/preferences")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.userId.toUpperCase())
      .toBe(accounts.viewer.userId);
  });

  // ===================================================
  // UPDATE PREFERENCES
  // ===================================================

  it("allows the Owner to update notification preferences", async () => {
    const token = createAccessToken(accounts.owner.userId);

    const response = await request(app)
      .patch("/api/v1/notifications/preferences")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({
        emailEnabled: false,
        smsEnabled: true,
        pushEnabled: false,
        criticalAlertsOnly: true,
      });

    expect(response.status).toBe(200);
    expect(response.body.data.emailEnabled).toBe(false);
    expect(response.body.data.smsEnabled).toBe(true);
    expect(response.body.data.pushEnabled).toBe(false);
    expect(response.body.data.criticalAlertsOnly).toBe(true);
  });

  it("allows an Administrator to update their own preferences", async () => {
    const token = createAccessToken(accounts.administrator.userId);

    const response = await request(app)
      .patch("/api/v1/notifications/preferences")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ smsEnabled: true });

    expect(response.status).toBe(200);
    expect(response.body.data.smsEnabled).toBe(true);
  });

  it("allows a Member to update their own preferences", async () => {
    const token = createAccessToken(accounts.member.userId);

    const response = await request(app)
      .patch("/api/v1/notifications/preferences")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ emailEnabled: false });

    expect(response.status).toBe(200);
    expect(response.body.data.emailEnabled).toBe(false);
  });

  it("allows a Viewer to update their own preferences", async () => {
    const token = createAccessToken(accounts.viewer.userId);

    const response = await request(app)
      .patch("/api/v1/notifications/preferences")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ pushEnabled: false });

    expect(response.status).toBe(200);
    expect(response.body.data.pushEnabled).toBe(false);
  });

  // ===================================================
  // PARTIAL UPDATES
  // ===================================================

  it("preserves unspecified preferences during partial updates", async () => {
    const token = createAccessToken(accounts.owner.userId);

    // Set a known initial state.

    const initialResponse = await request(app)
      .patch("/api/v1/notifications/preferences")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({
        emailEnabled: true,
        smsEnabled: false,
        pushEnabled: true,
        criticalAlertsOnly: false,
      });

    expect(initialResponse.status).toBe(200);

    // Update only SMS.

    const updateResponse = await request(app)
      .patch("/api/v1/notifications/preferences")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ smsEnabled: true });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.emailEnabled).toBe(true);
    expect(updateResponse.body.data.smsEnabled).toBe(true);
    expect(updateResponse.body.data.pushEnabled).toBe(true);
    expect(updateResponse.body.data.criticalAlertsOnly).toBe(false);
  });

  // ===================================================
  // VALIDATION
  // ===================================================

  it("rejects an empty preference update", async () => {
    const token = createAccessToken(accounts.owner.userId);

    const response = await request(app)
      .patch("/api/v1/notifications/preferences")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
  });

  it("rejects non-boolean preference values", async () => {
    const token = createAccessToken(accounts.owner.userId);

    const response = await request(app)
      .patch("/api/v1/notifications/preferences")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ emailEnabled: "yes" });

    expect(response.status).toBe(400);
  });

  it("rejects unsupported preference fields", async () => {
    const token = createAccessToken(accounts.owner.userId);

    const response = await request(app)
      .patch("/api/v1/notifications/preferences")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({
        emailEnabled: false,
        userId: accounts.member.userId,
      });

    expect(response.status).toBe(400);
  });

  // ===================================================
  // USER ISOLATION
  // ===================================================

  it("does not expose another user's preferences", async () => {
    const token = createAccessToken(accounts.owner.userId);

    const response = await request(app)
      .get("/api/v1/notifications/preferences")
      .query({
        organizationId,
        userId: accounts.member.userId,
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.userId.toUpperCase())
      .toBe(accounts.owner.userId);
  });

  it("does not allow updating another user's preferences", async () => {
    const token = createAccessToken(accounts.owner.userId);

    const response = await request(app)
      .patch("/api/v1/notifications/preferences")
      .query({
        organizationId,
        userId: accounts.member.userId,
      })
      .set("Authorization", `Bearer ${token}`)
      .send({ emailEnabled: false });

    expect(response.status).toBe(200);
    expect(response.body.data.userId.toUpperCase())
      .toBe(accounts.owner.userId);
  });

  // ===================================================
  // ORGANIZATION ISOLATION
  // ===================================================

  it("rejects access through another organization", async () => {
    const token = createAccessToken(accounts.owner.userId);

    const response = await request(app)
      .get("/api/v1/notifications/preferences")
      .query({ organizationId: otherOrganizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("rejects updates through another organization", async () => {
    const token = createAccessToken(accounts.owner.userId);

    const response = await request(app)
      .patch("/api/v1/notifications/preferences")
      .query({ organizationId: otherOrganizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ emailEnabled: false });

    expect(response.status).toBe(403);
  });
});
