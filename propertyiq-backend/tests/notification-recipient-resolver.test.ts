
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { randomUUID } from "crypto";

import { getDatabase, sql } from "../src/config/database";
import { resolveNotificationRecipients } from "../src/modules/notifications/notification-recipient-resolver.service";

// =====================================================
// TEST FIXTURES
// =====================================================

const organizationId =
  "4587318B-7DA1-482E-B0B7-587B9A26C7D8";

const otherOrganizationId =
  "290FE9A8-C8A3-40D7-9592-97E1BEDB04C4";

const propertyId =
  "2BA345BB-3864-4E83-A0BE-E3B2CC915623";

const alertId = randomUUID();

const testUsers = [
  {
    userId: randomUUID(),
    firstName: "Resolver",
    lastName: "Assigned",
    status: "active",
  },
  {
    userId: randomUUID(),
    firstName: "Resolver",
    lastName: "Manager",
    status: "active",
  },
  {
    userId: randomUUID(),
    firstName: "Resolver",
    lastName: "Duplicate",
    status: "active",
  },
  {
    userId: randomUUID(),
    firstName: "Resolver",
    lastName: "InactiveUser",
    status: "inactive",
  },
  {
    userId: randomUUID(),
    firstName: "Resolver",
    lastName: "InactiveRelationship",
    status: "active",
  },
];

const testMemberships = testUsers.map((user) => ({
  membershipId: randomUUID(),
  userId: user.userId,
}));

const assignedMemberships = [
  testMemberships[0],
  testMemberships[2],
  testMemberships[3],
];

const activePropertyManagers = [
  testMemberships[1],
  testMemberships[2],
];

const inactivePropertyManager = testMemberships[4];

const alertAssignmentIds = [
  randomUUID(),
  randomUUID(),
  randomUUID(),
];

const inactiveAssignmentId = randomUUID();

const propertyManagerIds = [
  randomUUID(),
  randomUUID(),
  randomUUID(),
];

// =====================================================
// HELPERS
// =====================================================

function normalizeId(value: string): string {
  return value.toLowerCase();
}

// =====================================================
// DATABASE SETUP
// =====================================================

async function createTestData() {
  const db = await getDatabase();

  // Create an isolated alert.
  await db.request()
    .input("alertId", sql.UniqueIdentifier, alertId)
    .input("organizationId", sql.UniqueIdentifier, organizationId)
    .input("propertyId", sql.UniqueIdentifier, propertyId)
    .input("title", sql.NVarChar(200), "Recipient Resolver Test Alert")
    .query(`
      INSERT INTO dbo.Alerts (
        AlertId,
        OrganizationId,
        PropertyId,
        Title
      )
      VALUES (
        @alertId,
        @organizationId,
        @propertyId,
        @title
      );
    `);

  // Create isolated users.
  for (const user of testUsers) {
    await db.request()
      .input("userId", sql.UniqueIdentifier, user.userId)
      .input(
        "email",
        sql.NVarChar(510),
        `resolver-${user.userId}@propertyiq-test.local`
      )
      .input("firstName", sql.NVarChar(200), user.firstName)
      .input("lastName", sql.NVarChar(200), user.lastName)
      .input("status", sql.NVarChar(60), user.status)
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
  }

  // Create memberships.
  for (const membership of testMemberships) {
    await db.request()
      .input(
        "membershipId",
        sql.UniqueIdentifier,
        membership.membershipId
      )
      .input(
        "organizationId",
        sql.UniqueIdentifier,
        organizationId
      )
      .input("userId", sql.UniqueIdentifier, membership.userId)
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
  }

  // Active alert assignments.
  for (let i = 0; i < assignedMemberships.length; i++) {
    await db.request()
      .input(
        "assignmentId",
        sql.UniqueIdentifier,
        alertAssignmentIds[i]
      )
      .input(
        "organizationId",
        sql.UniqueIdentifier,
        organizationId
      )
      .input("alertId", sql.UniqueIdentifier, alertId)
      .input("propertyId", sql.UniqueIdentifier, propertyId)
      .input(
        "membershipId",
        sql.UniqueIdentifier,
        assignedMemberships[i].membershipId
      )
      .query(`
        INSERT INTO dbo.AlertAssignments (
          AlertAssignmentId,
          OrganizationId,
          AlertId,
          PropertyId,
          MembershipId,
          IsActive
        )
        VALUES (
          @assignmentId,
          @organizationId,
          @alertId,
          @propertyId,
          @membershipId,
          1
        );
      `);
  }

  // Inactive alert assignment.
  await db.request()
    .input(
      "assignmentId",
      sql.UniqueIdentifier,
      inactiveAssignmentId
    )
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      organizationId
    )
    .input("alertId", sql.UniqueIdentifier, alertId)
    .input("propertyId", sql.UniqueIdentifier, propertyId)
    .input(
      "membershipId",
      sql.UniqueIdentifier,
      testMemberships[4].membershipId
    )
    .query(`
      INSERT INTO dbo.AlertAssignments (
        AlertAssignmentId,
        OrganizationId,
        AlertId,
        PropertyId,
        MembershipId,
        IsActive
      )
      VALUES (
        @assignmentId,
        @organizationId,
        @alertId,
        @propertyId,
        @membershipId,
        0
      );
    `);

  // Active property managers.
  for (let i = 0; i < activePropertyManagers.length; i++) {
    await db.request()
      .input(
        "propertyManagerId",
        sql.UniqueIdentifier,
        propertyManagerIds[i]
      )
      .input(
        "organizationId",
        sql.UniqueIdentifier,
        organizationId
      )
      .input("propertyId", sql.UniqueIdentifier, propertyId)
      .input(
        "membershipId",
        sql.UniqueIdentifier,
        activePropertyManagers[i].membershipId
      )
      .query(`
        INSERT INTO dbo.PropertyManagers (
          PropertyManagerId,
          OrganizationId,
          PropertyId,
          MembershipId,
          Status
        )
        VALUES (
          @propertyManagerId,
          @organizationId,
          @propertyId,
          @membershipId,
          'active'
        );
      `);
  }

  // Inactive property manager.
  await db.request()
    .input(
      "propertyManagerId",
      sql.UniqueIdentifier,
      propertyManagerIds[2]
    )
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      organizationId
    )
    .input("propertyId", sql.UniqueIdentifier, propertyId)
    .input(
      "membershipId",
      sql.UniqueIdentifier,
      inactivePropertyManager.membershipId
    )
    .query(`
      INSERT INTO dbo.PropertyManagers (
        PropertyManagerId,
        OrganizationId,
        PropertyId,
        MembershipId,
        Status
      )
      VALUES (
        @propertyManagerId,
        @organizationId,
        @propertyId,
        @membershipId,
        'inactive'
      );
    `);
}

// =====================================================
// DATABASE CLEANUP
// =====================================================

async function cleanupTestData() {
  const db = await getDatabase();

  await db.request()
    .input("alertId", sql.UniqueIdentifier, alertId)
    .query(`
      DELETE FROM dbo.AlertAssignments
      WHERE AlertId = @alertId;
    `);

  const managerRequest = db.request();

  propertyManagerIds.forEach((id, index) => {
    managerRequest.input(
      `manager${index}`,
      sql.UniqueIdentifier,
      id
    );
  });

  await managerRequest.query(`
    DELETE FROM dbo.PropertyManagers
    WHERE PropertyManagerId IN (
      @manager0,
      @manager1,
      @manager2
    );
  `);

  const membershipRequest = db.request();

  testMemberships.forEach((membership, index) => {
    membershipRequest.input(
      `membership${index}`,
      sql.UniqueIdentifier,
      membership.membershipId
    );
  });

  await membershipRequest.query(`
    DELETE FROM dbo.Memberships
    WHERE MembershipId IN (
      @membership0,
      @membership1,
      @membership2,
      @membership3,
      @membership4
    );
  `);

  const userRequest = db.request();

  testUsers.forEach((user, index) => {
    userRequest.input(
      `user${index}`,
      sql.UniqueIdentifier,
      user.userId
    );
  });

  await userRequest.query(`
    DELETE FROM dbo.Users
    WHERE UserId IN (
      @user0,
      @user1,
      @user2,
      @user3,
      @user4
    );
  `);

  await db.request()
    .input("alertId", sql.UniqueIdentifier, alertId)
    .query(`
      DELETE FROM dbo.Alerts
      WHERE AlertId = @alertId;
    `);
}

// =====================================================
// TESTS
// =====================================================

describe("Notification Recipient Resolver integration", () => {
  beforeAll(async () => {
    await createTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  it("includes active alert assignees and active property managers", async () => {
    const recipients = await resolveNotificationRecipients({
      organizationId,
      alertId,
    });

    console.log("EXPECTED USERS:", testUsers);
    console.log("ACTUAL RECIPIENTS:", recipients);

    const recipientIds = recipients.map(
      (recipient) => normalizeId(recipient.userId)
    );

    expect(recipientIds).toContain(
      normalizeId(testUsers[0].userId)
    );

    expect(recipientIds).toContain(
      normalizeId(testUsers[1].userId)
    );

    expect(recipientIds).toContain(
      normalizeId(testUsers[2].userId)
    );
  });

  it("deduplicates users assigned through multiple paths", async () => {
    const recipients = await resolveNotificationRecipients({
      organizationId,
      alertId,
    });

    const duplicateRecipients = recipients.filter(
      (recipient) =>
        normalizeId(recipient.userId) ===
        normalizeId(testUsers[2].userId)
    );

    expect(duplicateRecipients).toHaveLength(1);
  });

  it("excludes inactive user accounts", async () => {
    const recipients = await resolveNotificationRecipients({
      organizationId,
      alertId,
    });

    const recipientIds = recipients.map(
      (recipient) => normalizeId(recipient.userId)
    );

    expect(recipientIds).not.toContain(
      normalizeId(testUsers[3].userId)
    );
  });

  it("excludes inactive property manager assignments", async () => {
    const recipients = await resolveNotificationRecipients({
      organizationId,
      alertId,
    });

    const recipientIds = recipients.map(
      (recipient) => normalizeId(recipient.userId)
    );

    expect(recipientIds).not.toContain(
      normalizeId(testUsers[4].userId)
    );
  });

  it("does not return recipients for an alert in another organization", async () => {
    const recipients = await resolveNotificationRecipients({
      organizationId: otherOrganizationId,
      alertId,
    });

    expect(recipients).toEqual([]);
  });

  it("returns recipient contact details", async () => {
    const recipients = await resolveNotificationRecipients({
      organizationId,
      alertId,
    });

    const assignedRecipient = recipients.find(
      (recipient) =>
        normalizeId(recipient.userId) ===
        normalizeId(testUsers[0].userId)
    );

    expect(assignedRecipient).toMatchObject({
      userId: expect.any(String),
      email: `resolver-${testUsers[0].userId}@propertyiq-test.local`,
      firstName: "Resolver",
      lastName: "Assigned",
    });
  });
});
