
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { randomUUID } from "crypto";
import request from "supertest";
import jwt from "jsonwebtoken";

import app from "../src/app";
import { authConfig } from "../src/config/auth";
import { getDatabase, sql } from "../src/config/database";

// =====================================================
// TEST ORGANIZATION AND PROPERTIES
// =====================================================

const organizationId =
  "4587318B-7DA1-482E-B0B7-587B9A26C7D8";

const otherOrganizationId =
  "290FE9A8-C8A3-40D7-9592-97E1BEDB04C4";

const propertyAId =
  "2BA345BB-3864-4E83-A0BE-E3B2CC915623";

const propertyBId =
  "AC02E56C-E610-4D54-A274-FC3413F8A9C7";

// =====================================================
// TEST RECORD IDS
// =====================================================

const alertAId = randomUUID();
const alertBId = randomUUID();

let serviceProviderId: string | null = null;

// =====================================================
// TEST ACCOUNTS
// =====================================================

const accounts = {
  owner: {
    userId: "08281964-BFA4-4B29-86AC-65FE96A8AECE",
    membershipId: "FEF9B2ED-6C14-4716-8C0A-EFD7720F960E",
  },

  administrator: {
    userId: "62026EEE-8D8E-477A-A33E-A057D8F505F0",
    membershipId: "D38E23A2-72DD-4CBA-AAF7-1C60D77D0650",
  },

  member: {
    userId: "53A8EC9B-EE87-4577-A59B-985CA1B252E8",
    membershipId: "A17328BB-02BD-4A2A-A9CF-D79F180B65BA",
  },

  viewer: {
    userId: "3E2BF33C-A551-4371-974A-B31F4DF838A1",
    membershipId: "DE1E339C-3F5F-41C0-83BF-76FB18E2FFF8",
  },
};

// =====================================================
// AUTHENTICATION HELPERS
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

function authenticatedRequest(userId: string) {
  return {
    token: createAccessToken(userId),
  };
}

// =====================================================
// ASSIGNMENT HELPERS
// =====================================================

function getAssignmentId(data: any): string {
  const id =
    data?.alertAssignmentId ??
    data?.AlertAssignmentId;

  if (!id) {
    throw new Error("Alert Assignment ID was not returned.");
  }

  return id;
}

function createAssignment(
  userId: string,
  alertId: string,
  assignee: {
    membershipId?: string;
    serviceProviderId?: string;
  },
  propertyId = propertyAId
) {
  const { token } = authenticatedRequest(userId);

  return request(app)
    .post("/api/v1/alert-assignments")
    .set("Authorization", `Bearer ${token}`)
    .send({
      organizationId,
      alertId,
      propertyId,
      ...assignee,
      notes: "Created by automated alert assignment test",
    });
}

function getAlertAssignments(
  userId: string,
  alertId: string,
  requestedOrganizationId = organizationId
) {
  const { token } = authenticatedRequest(userId);

  return request(app)
    .get(`/api/v1/alert-assignments/alert/${alertId}`)
    .query({
      organizationId: requestedOrganizationId,
    })
    .set("Authorization", `Bearer ${token}`);
}

function getAlertAssignment(
  userId: string,
  assignmentId: string,
  requestedOrganizationId = organizationId
) {
  const { token } = authenticatedRequest(userId);

  return request(app)
    .get(`/api/v1/alert-assignments/${assignmentId}`)
    .query({
      organizationId: requestedOrganizationId,
    })
    .set("Authorization", `Bearer ${token}`);
}

function unassignAlert(
  userId: string,
  assignmentId: string,
  notes?: string
) {
  const { token } = authenticatedRequest(userId);

  return request(app)
    .patch(
      `/api/v1/alert-assignments/${assignmentId}/unassign`
    )
    .query({ organizationId })
    .set("Authorization", `Bearer ${token}`)
    .send({ notes });
}

// =====================================================
// SETUP
// =====================================================

beforeAll(async () => {
  const pool = await getDatabase();

  // Create an active test service provider.
  const providerResult = await pool
    .request()
    .input(
      "OrganizationId",
      sql.UniqueIdentifier,
      organizationId
    )
    .input(
      "CompanyName",
      sql.NVarChar(200),
      "PropertyIQ Alert Assignment Test Provider"
    )
    .query(`
      INSERT INTO dbo.ServiceProviders (
        OrganizationId,
        CompanyName
      )
      OUTPUT INSERTED.ServiceProviderId
      VALUES (
        @OrganizationId,
        @CompanyName
      );
    `);

  serviceProviderId =
    providerResult.recordset[0].ServiceProviderId;

  // Create an alert on Property A.
  await pool
    .request()
    .input(
      "AlertId",
      sql.UniqueIdentifier,
      alertAId
    )
    .input(
      "OrganizationId",
      sql.UniqueIdentifier,
      organizationId
    )
    .input(
      "PropertyId",
      sql.UniqueIdentifier,
      propertyAId
    )
    .input(
      "Title",
      sql.NVarChar(255),
      "Alert Assignment Test - Property A"
    )
    .input(
      "Severity",
      sql.NVarChar(50),
      "high"
    )
    .input(
      "Status",
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
        @AlertId,
        @OrganizationId,
        @PropertyId,
        @Title,
        @Severity,
        @Status,
        SYSUTCDATETIME()
      );
    `);

  // Create an alert on Property B.
  await pool
    .request()
    .input(
      "AlertId",
      sql.UniqueIdentifier,
      alertBId
    )
    .input(
      "OrganizationId",
      sql.UniqueIdentifier,
      organizationId
    )
    .input(
      "PropertyId",
      sql.UniqueIdentifier,
      propertyBId
    )
    .input(
      "Title",
      sql.NVarChar(255),
      "Alert Assignment Test - Property B"
    )
    .input(
      "Severity",
      sql.NVarChar(50),
      "medium"
    )
    .input(
      "Status",
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
        @AlertId,
        @OrganizationId,
        @PropertyId,
        @Title,
        @Severity,
        @Status,
        SYSUTCDATETIME()
      );
    `);
});

// =====================================================
// CLEANUP
// =====================================================

afterAll(async () => {
  const pool = await getDatabase();

  // Delete assignments before deleting their alerts.
  await pool
    .request()
    .input(
      "AlertAId",
      sql.UniqueIdentifier,
      alertAId
    )
    .input(
      "AlertBId",
      sql.UniqueIdentifier,
      alertBId
    )
    .query(`
      DELETE FROM dbo.AlertAssignments
      WHERE AlertId IN (
        @AlertAId,
        @AlertBId
      );
    `);

  // Delete test alerts.
  await pool
    .request()
    .input(
      "AlertAId",
      sql.UniqueIdentifier,
      alertAId
    )
    .input(
      "AlertBId",
      sql.UniqueIdentifier,
      alertBId
    )
    .input(
      "OrganizationId",
      sql.UniqueIdentifier,
      organizationId
    )
    .query(`
      DELETE FROM dbo.Alerts
      WHERE AlertId IN (
        @AlertAId,
        @AlertBId
      )
        AND OrganizationId = @OrganizationId;
    `);

  // Delete test provider.
  if (serviceProviderId) {
    await pool
      .request()
      .input(
        "ServiceProviderId",
        sql.UniqueIdentifier,
        serviceProviderId
      )
      .input(
        "OrganizationId",
        sql.UniqueIdentifier,
        organizationId
      )
      .query(`
        DELETE FROM dbo.ServiceProviders
        WHERE ServiceProviderId = @ServiceProviderId
          AND OrganizationId = @OrganizationId;
      `);
  }
});

// =====================================================
// AUTHORIZATION AND ASSIGNMENT TESTS
// =====================================================

describe("PropertyIQ Alert Assignments", () => {

  it("rejects unauthenticated assignment requests", async () => {
    const response = await request(app)
      .get(`/api/v1/alert-assignments/alert/${alertAId}`)
      .query({ organizationId });

    expect(response.status).toBe(401);
  });

  it("allows Owner to assign an alert to an internal member", async () => {
    const response = await createAssignment(
      accounts.owner.userId,
      alertAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.membershipId).toBe(
      accounts.member.membershipId
    );
    expect(response.body.data.isActive).toBe(true);
  });

  it("allows Owner to assign an alert to an external provider", async () => {
    const response = await createAssignment(
      accounts.owner.userId,
      alertAId,
      {
        serviceProviderId: serviceProviderId!,
      }
    );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.serviceProviderId).toBe(
      serviceProviderId
    );
  });

  it("allows Administrator to create alert assignments", async () => {
    const response = await createAssignment(
      accounts.administrator.userId,
      alertAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it("prevents Member from creating alert assignments", async () => {
    const response = await createAssignment(
      accounts.member.userId,
      alertAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(response.status).toBe(403);
  });

  it("prevents Viewer from creating alert assignments", async () => {
    const response = await createAssignment(
      accounts.viewer.userId,
      alertAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(response.status).toBe(403);
  });

  it("rejects an assignment without an assignee", async () => {
    const response = await createAssignment(
      accounts.owner.userId,
      alertAId,
      {}
    );

    expect(response.status).toBe(400);
  });

  it("rejects an assignment with both assignee types", async () => {
    const response = await createAssignment(
      accounts.owner.userId,
      alertAId,
      {
        membershipId: accounts.member.membershipId,
        serviceProviderId: serviceProviderId!,
      }
    );

    expect(response.status).toBe(400);
  });

  it("rejects a nonexistent internal membership", async () => {
    const response = await createAssignment(
      accounts.owner.userId,
      alertAId,
      {
        membershipId:
          "A1200001-0000-4000-8000-000000000099",
      }
    );

    expect(response.status).toBe(400);
  });

  it("rejects a nonexistent external service provider", async () => {
    const response = await createAssignment(
      accounts.owner.userId,
      alertAId,
      {
        serviceProviderId:
          "A1200001-0000-4000-8000-000000000098",
      }
    );

    expect(response.status).toBe(400);
  });

  it("rejects an assignment when the supplied property does not match the alert", async () => {
    const response = await createAssignment(
      accounts.owner.userId,
      alertAId,
      {
        membershipId: accounts.member.membershipId,
      },
      propertyBId
    );

    expect(response.status).toBe(404);
  });

  // =====================================================
  // READ ACCESS TESTS
  // =====================================================

  it("allows Owner to view alert assignment history", async () => {
    const createResponse = await createAssignment(
      accounts.owner.userId,
      alertAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(createResponse.status).toBe(201);

    const response = await getAlertAssignments(
      accounts.owner.userId,
      alertAId
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it("allows Member to view assignments for an accessible property", async () => {
    const response = await getAlertAssignments(
      accounts.member.userId,
      alertAId
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("allows Viewer to view assignments for an accessible property", async () => {
    const response = await getAlertAssignments(
      accounts.viewer.userId,
      alertAId
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("does not expose assignments for an inaccessible property", async () => {
    const createResponse = await createAssignment(
      accounts.owner.userId,
      alertBId,
      {
        membershipId: accounts.member.membershipId,
      },
      propertyBId
    );

    expect(createResponse.status).toBe(201);

    const response = await getAlertAssignments(
      accounts.member.userId,
      alertBId
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(0);
  });

  it("returns an assignment by ID to an authorized user", async () => {
    const createResponse = await createAssignment(
      accounts.owner.userId,
      alertAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(createResponse.status).toBe(201);

    const assignmentId = getAssignmentId(
      createResponse.body.data
    );

    const response = await getAlertAssignment(
      accounts.owner.userId,
      assignmentId
    );

    expect(response.status).toBe(200);
    expect(response.body.data.alertAssignmentId).toBe(
      assignmentId
    );
  });

  it("does not expose an inaccessible assignment by ID", async () => {
    const createResponse = await createAssignment(
      accounts.owner.userId,
      alertBId,
      {
        membershipId: accounts.member.membershipId,
      },
      propertyBId
    );

    expect(createResponse.status).toBe(201);

    const assignmentId = getAssignmentId(
      createResponse.body.data
    );

    const response = await getAlertAssignment(
      accounts.member.userId,
      assignmentId
    );

    expect(response.status).toBe(404);
  });

  // =====================================================
  // REASSIGNMENT HISTORY
  // =====================================================

  it("unassigns the previous assignee when an alert is reassigned", async () => {
    const firstResponse = await createAssignment(
      accounts.owner.userId,
      alertAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(firstResponse.status).toBe(201);

    const firstAssignmentId = getAssignmentId(
      firstResponse.body.data
    );

    const secondResponse = await createAssignment(
      accounts.owner.userId,
      alertAId,
      {
        serviceProviderId: serviceProviderId!,
      }
    );

    expect(secondResponse.status).toBe(201);

    const historyResponse = await getAlertAssignments(
      accounts.owner.userId,
      alertAId
    );

    expect(historyResponse.status).toBe(200);

    const previousAssignment =
      historyResponse.body.data.find(
        (assignment: any) =>
          assignment.alertAssignmentId.toUpperCase() ===
          firstAssignmentId.toUpperCase()
      );

    expect(previousAssignment).toBeDefined();
    expect(previousAssignment.isActive).toBe(false);
    expect(previousAssignment.unassignedAt).toBeTruthy();

    const activeAssignments =
      historyResponse.body.data.filter(
        (assignment: any) => assignment.isActive === true
      );

    expect(activeAssignments).toHaveLength(1);
    expect(activeAssignments[0].serviceProviderId).toBe(
      serviceProviderId
    );
  });

  // =====================================================
  // UNASSIGNMENT
  // =====================================================

  it("allows Owner to unassign an active alert assignment", async () => {
    const createResponse = await createAssignment(
      accounts.owner.userId,
      alertAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(createResponse.status).toBe(201);

    const assignmentId = getAssignmentId(
      createResponse.body.data
    );

    const response = await unassignAlert(
      accounts.owner.userId,
      assignmentId,
      "Work no longer required."
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.isActive).toBe(false);
    expect(response.body.data.unassignedAt).toBeTruthy();
    expect(response.body.data.notes).toBe(
      "Work no longer required."
    );
  });

  it("allows Administrator to unassign an active alert assignment", async () => {
    const createResponse = await createAssignment(
      accounts.owner.userId,
      alertAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(createResponse.status).toBe(201);

    const assignmentId = getAssignmentId(
      createResponse.body.data
    );

    const response = await unassignAlert(
      accounts.administrator.userId,
      assignmentId
    );

    expect(response.status).toBe(200);
    expect(response.body.data.isActive).toBe(false);
  });

  it("prevents Member from unassigning alerts", async () => {
    const createResponse = await createAssignment(
      accounts.owner.userId,
      alertAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(createResponse.status).toBe(201);

    const assignmentId = getAssignmentId(
      createResponse.body.data
    );

    const response = await unassignAlert(
      accounts.member.userId,
      assignmentId
    );

    expect(response.status).toBe(403);
  });

  it("prevents Viewer from unassigning alerts", async () => {
    const createResponse = await createAssignment(
      accounts.owner.userId,
      alertAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(createResponse.status).toBe(201);

    const assignmentId = getAssignmentId(
      createResponse.body.data
    );

    const response = await unassignAlert(
      accounts.viewer.userId,
      assignmentId
    );

    expect(response.status).toBe(403);
  });

  it("does not allow an assignment to be unassigned twice", async () => {
    const createResponse = await createAssignment(
      accounts.owner.userId,
      alertAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(createResponse.status).toBe(201);

    const assignmentId = getAssignmentId(
      createResponse.body.data
    );

    const firstResponse = await unassignAlert(
      accounts.owner.userId,
      assignmentId
    );

    expect(firstResponse.status).toBe(200);

    const secondResponse = await unassignAlert(
      accounts.owner.userId,
      assignmentId
    );

    expect(secondResponse.status).toBe(404);
  });

  // =====================================================
  // ORGANIZATION ISOLATION
  // =====================================================

  it("rejects requests using another organization ID", async () => {
    const response = await getAlertAssignments(
      accounts.owner.userId,
      alertAId,
      otherOrganizationId
    );

    expect(response.status).toBe(403);
  });

  it("rejects an invalid alert ID", async () => {
    const response = await getAlertAssignments(
      accounts.owner.userId,
      "not-a-valid-guid"
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 for a nonexistent assignment ID", async () => {
    const response = await getAlertAssignment(
      accounts.owner.userId,
      "A1200001-0000-4000-8000-000000000097"
    );

    expect(response.status).toBe(404);
  });
});
