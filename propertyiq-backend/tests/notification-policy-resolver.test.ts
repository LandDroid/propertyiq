
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { randomUUID } from "crypto";

import { getDatabase, sql } from "../src/config/database";

import {
  resolveNotificationPolicy,
} from "../src/modules/notifications/notification-policy-resolver.service";

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
// ISOLATED INACTIVE USER
// =====================================================

const inactiveUserId = randomUUID();
const inactiveMembershipId = randomUUID();

const inactiveUserEmail =
  `notification-policy-${inactiveUserId}@propertyiq-test.local`;

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
// HELPERS
// =====================================================

function normalizeId(value: string): string {
  return value.toLowerCase();
}

async function setOwnerPreferences(data: {
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  criticalAlertsOnly: boolean;
}) {
  const db = await getDatabase();

  await db.request()
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      organizationId
    )
    .input(
      "userId",
      sql.UniqueIdentifier,
      accounts.owner.userId
    )
    .input("emailEnabled", sql.Bit, data.emailEnabled)
    .input("smsEnabled", sql.Bit, data.smsEnabled)
    .input("pushEnabled", sql.Bit, data.pushEnabled)
    .input(
      "criticalAlertsOnly",
      sql.Bit,
      data.criticalAlertsOnly
    )
    .query(`
      IF EXISTS (
        SELECT 1
        FROM dbo.NotificationPreferences
        WHERE OrganizationId = @organizationId
          AND UserId = @userId
      )
      BEGIN
        UPDATE dbo.NotificationPreferences
        SET
          EmailEnabled = @emailEnabled,
          SmsEnabled = @smsEnabled,
          PushEnabled = @pushEnabled,
          CriticalAlertsOnly = @criticalAlertsOnly,
          UpdatedAt = SYSUTCDATETIME()
        WHERE OrganizationId = @organizationId
          AND UserId = @userId;
      END
      ELSE
      BEGIN
        INSERT INTO dbo.NotificationPreferences (
          OrganizationId,
          UserId,
          EmailEnabled,
          SmsEnabled,
          PushEnabled,
          CriticalAlertsOnly
        )
        VALUES (
          @organizationId,
          @userId,
          @emailEnabled,
          @smsEnabled,
          @pushEnabled,
          @criticalAlertsOnly
        );
      END;
    `);
}

async function countOwnerPreferences(): Promise<number> {
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
      accounts.owner.userId
    )
    .query(`
      SELECT COUNT(*) AS recordCount
      FROM dbo.NotificationPreferences
      WHERE OrganizationId = @organizationId
        AND UserId = @userId;
    `);

  return result.recordset[0].recordCount;
}

// =====================================================
// DATABASE SETUP
// =====================================================

beforeAll(async () => {
  const db = await getDatabase();

  // Snapshot original preferences for shared accounts.

  const snapshotResult = await db.request()
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      organizationId
    )
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

  originalPreferences = snapshotResult.recordset.filter(
    (preference: PreferenceSnapshot) =>
      userIds.some(
        (userId) =>
          normalizeId(userId) ===
          normalizeId(preference.UserId)
      )
  );

  // Remove preferences temporarily so defaults can be tested.

  for (const userId of userIds) {
    await db.request()
      .input(
        "organizationId",
        sql.UniqueIdentifier,
        organizationId
      )
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        DELETE FROM dbo.NotificationPreferences
        WHERE OrganizationId = @organizationId
          AND UserId = @userId;
      `);
  }

  // Create an isolated inactive user.

  await db.request()
    .input(
      "userId",
      sql.UniqueIdentifier,
      inactiveUserId
    )
    .input(
      "email",
      sql.NVarChar(510),
      inactiveUserEmail
    )
    .input(
      "firstName",
      sql.NVarChar(200),
      "Inactive"
    )
    .input(
      "lastName",
      sql.NVarChar(200),
      "PolicyTest"
    )
    .input(
      "status",
      sql.NVarChar(60),
      "inactive"
    )
    .query(`
      INSERT INTO dbo.Users (
        UserId,
        Email,
        FirstName,
        LastName,
        Status
      )
      VALUES (
        @userId,
        @email,
        @firstName,
        @lastName,
        @status
      );
    `);

  await db.request()
    .input(
      "membershipId",
      sql.UniqueIdentifier,
      inactiveMembershipId
    )
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      organizationId
    )
    .input(
      "userId",
      sql.UniqueIdentifier,
      inactiveUserId
    )
    .query(`
      INSERT INTO dbo.Memberships (
        MembershipId,
        OrganizationId,
        UserId
      )
      VALUES (
        @membershipId,
        @organizationId,
        @userId
      );
    `);
});

// =====================================================
// DATABASE CLEANUP
// =====================================================

afterAll(async () => {
  const db = await getDatabase();

  // Remove preferences created or changed by these tests.

  for (const userId of userIds) {
    await db.request()
      .input(
        "organizationId",
        sql.UniqueIdentifier,
        organizationId
      )
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        DELETE FROM dbo.NotificationPreferences
        WHERE OrganizationId = @organizationId
          AND UserId = @userId;
      `);
  }

  // Restore original preferences.

  for (const preference of originalPreferences) {
    await db.request()
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

  // Remove the isolated inactive user's records.

  await db.request()
    .input(
      "membershipId",
      sql.UniqueIdentifier,
      inactiveMembershipId
    )
    .query(`
      DELETE FROM dbo.Memberships
      WHERE MembershipId = @membershipId;
    `);

  await db.request()
    .input(
      "userId",
      sql.UniqueIdentifier,
      inactiveUserId
    )
    .query(`
      DELETE FROM dbo.Users
      WHERE UserId = @userId;
    `);
});

// =====================================================
// NOTIFICATION POLICY RESOLVER TESTS
// =====================================================

describe("Notification Policy Resolver integration", () => {
  // ===================================================
  // DEFAULT PREFERENCES
  // ===================================================

  it("uses default channels when no preferences exist", async () => {
    expect(await countOwnerPreferences()).toBe(0);

    const result = await resolveNotificationPolicy({
      organizationId,
      userId: accounts.owner.userId,
      severity: "warning",
    });

    expect(result.eligible).toBe(true);
    expect(result.channels).toEqual(["email", "push"]);
    expect(result.criticalAlertsOnly).toBe(false);

    // Resolving policy must not create preference records.

    expect(await countOwnerPreferences()).toBe(0);
  });

  // ===================================================
  // CUSTOM CHANNEL PREFERENCES
  // ===================================================

  it("returns only enabled notification channels", async () => {
    await setOwnerPreferences({
      emailEnabled: false,
      smsEnabled: true,
      pushEnabled: false,
      criticalAlertsOnly: false,
    });

    const result = await resolveNotificationPolicy({
      organizationId,
      userId: accounts.owner.userId,
      severity: "warning",
    });

    expect(result.eligible).toBe(true);
    expect(result.channels).toEqual(["sms"]);
    expect(result.criticalAlertsOnly).toBe(false);
  });

  it("returns no channels when all channels are disabled", async () => {
    await setOwnerPreferences({
      emailEnabled: false,
      smsEnabled: false,
      pushEnabled: false,
      criticalAlertsOnly: false,
    });

    const result = await resolveNotificationPolicy({
      organizationId,
      userId: accounts.owner.userId,
      severity: "critical",
    });

    expect(result.eligible).toBe(true);
    expect(result.channels).toEqual([]);
  });

  // ===================================================
  // CRITICAL ALERT PREFERENCE
  // ===================================================

  it("allows critical alerts when critical-only is enabled", async () => {
    await setOwnerPreferences({
      emailEnabled: true,
      smsEnabled: true,
      pushEnabled: true,
      criticalAlertsOnly: true,
    });

    const result = await resolveNotificationPolicy({
      organizationId,
      userId: accounts.owner.userId,
      severity: "critical",
    });

    expect(result.eligible).toBe(true);
    expect(result.channels).toEqual([
      "email",
      "sms",
      "push",
    ]);
    expect(result.criticalAlertsOnly).toBe(true);
  });

  it("excludes warning alerts when critical-only is enabled", async () => {
    await setOwnerPreferences({
      emailEnabled: true,
      smsEnabled: true,
      pushEnabled: true,
      criticalAlertsOnly: true,
    });

    const result = await resolveNotificationPolicy({
      organizationId,
      userId: accounts.owner.userId,
      severity: "warning",
    });

    expect(result.eligible).toBe(false);
    expect(result.channels).toEqual([]);
    expect(result.criticalAlertsOnly).toBe(true);
  });

  it("excludes informational alerts when critical-only is enabled", async () => {
    await setOwnerPreferences({
      emailEnabled: true,
      smsEnabled: true,
      pushEnabled: true,
      criticalAlertsOnly: true,
    });

    const result = await resolveNotificationPolicy({
      organizationId,
      userId: accounts.owner.userId,
      severity: "info",
    });

    expect(result.eligible).toBe(false);
    expect(result.channels).toEqual([]);
    expect(result.criticalAlertsOnly).toBe(true);
  });

  it("allows warning and informational alerts when critical-only is disabled", async () => {
    await setOwnerPreferences({
      emailEnabled: true,
      smsEnabled: false,
      pushEnabled: true,
      criticalAlertsOnly: false,
    });

    for (const severity of ["warning", "info"] as const) {
      const result = await resolveNotificationPolicy({
        organizationId,
        userId: accounts.owner.userId,
        severity,
      });

      expect(result.eligible).toBe(true);
      expect(result.channels).toEqual(["email", "push"]);
      expect(result.criticalAlertsOnly).toBe(false);
    }
  });

  // ===================================================
  // USER ACCESS
  // ===================================================

  it("excludes inactive user accounts", async () => {
    const result = await resolveNotificationPolicy({
      organizationId,
      userId: inactiveUserId,
      severity: "critical",
    });

    expect(result.eligible).toBe(false);
    expect(result.channels).toEqual([]);
  });

  it("excludes users who are not members of the organization", async () => {
    const result = await resolveNotificationPolicy({
      organizationId: otherOrganizationId,
      userId: accounts.owner.userId,
      severity: "critical",
    });

    expect(result.eligible).toBe(false);
    expect(result.channels).toEqual([]);
  });

  it("does not return channels for an unauthorized organization", async () => {
    const result = await resolveNotificationPolicy({
      organizationId: otherOrganizationId,
      userId: accounts.owner.userId,
      severity: "warning",
    });

    expect(result.userId.toUpperCase())
      .toBe(accounts.owner.userId);

    expect(result.eligible).toBe(false);
    expect(result.channels).toEqual([]);
  });

  // ===================================================
  // INPUT VALIDATION
  // ===================================================

  it("rejects unsupported severity values", async () => {
    await expect(
      resolveNotificationPolicy({
        organizationId,
        userId: accounts.owner.userId,
        severity: "urgent" as "critical",
      })
    ).rejects.toThrow();
  });

  it("rejects invalid organization IDs", async () => {
    await expect(
      resolveNotificationPolicy({
        organizationId: "not-a-uuid",
        userId: accounts.owner.userId,
        severity: "critical",
      })
    ).rejects.toThrow();
  });
});
