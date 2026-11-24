
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
// TEST ORGANIZATION AND PROPERTIES
// =====================================================

const organizationId =
  "4587318B-7DA1-482E-B0B7-587B9A26C7D8";

const propertyAId =
  "2BA345BB-3864-4E83-A0BE-E3B2CC915623";

const propertyBId =
  "AC02E56C-E610-4D54-A274-FC3413F8A9C7";

// =====================================================
// TEST RECORD IDS
// =====================================================

const taskAId =
  "A1100001-0000-4000-8000-000000000001";

const taskBId =
  "A1100001-0000-4000-8000-000000000002";

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
// CREATE ACCESS TOKEN
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
// EXTRACT ASSIGNMENT ID
// =====================================================

function getAssignmentId(data: any): string {
  const id =
    data?.TaskAssignmentId ??
    data?.taskAssignmentId;

  if (!id) {
    throw new Error("Task Assignment ID was not returned.");
  }

  return id;
}

// =====================================================
// EXTRACT ASSIGNMENT STATUS
// =====================================================

function getAssignmentStatus(data: any): string {
  return data?.Status ?? data?.status;
}

// =====================================================
// CREATE ASSIGNMENT THROUGH API
// =====================================================

async function createAssignment(
  userId: string,
  maintenanceTaskId: string,
  assignee: {
    membershipId?: string;
    serviceProviderId?: string;
  }
) {
  const { token } = authenticatedRequest(userId);

  return request(app)
    .post("/api/v1/maintenance-task-assignments")
    .set("Authorization", `Bearer ${token}`)
    .send({
      organizationId,
      maintenanceTaskId,
      ...assignee,
      notes: "Created by automated integration test",
    });
}

// =====================================================
// UPDATE ASSIGNMENT STATUS THROUGH API
// =====================================================

async function updateAssignmentStatus(
  userId: string,
  assignmentId: string,
  status: string
) {
  const { token } = authenticatedRequest(userId);

  return request(app)
    .patch(
      `/api/v1/maintenance-task-assignments/${assignmentId}/status`
    )
    .query({ organizationId })
    .set("Authorization", `Bearer ${token}`)
    .send({
      status,
      notes: `Updated to ${status} by automated integration test`,
    });
}

// =====================================================
// SETUP
// =====================================================

beforeAll(async () => {
  const pool = await getDatabase();

  // Create a test Service Provider.
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
      "PropertyIQ Assignment Test Provider"
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

  // Create a task on Property A.
  await pool
    .request()
    .input(
      "MaintenanceTaskId",
      sql.UniqueIdentifier,
      taskAId
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
      sql.NVarChar(400),
      "Assignment Test - Property A"
    )
    .query(`
      INSERT INTO dbo.MaintenanceTasks (
        MaintenanceTaskId,
        OrganizationId,
        PropertyId,
        Title
      )
      VALUES (
        @MaintenanceTaskId,
        @OrganizationId,
        @PropertyId,
        @Title
      );
    `);

  // Create a task on Property B.
  await pool
    .request()
    .input(
      "MaintenanceTaskId",
      sql.UniqueIdentifier,
      taskBId
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
      sql.NVarChar(400),
      "Assignment Test - Property B"
    )
    .query(`
      INSERT INTO dbo.MaintenanceTasks (
        MaintenanceTaskId,
        OrganizationId,
        PropertyId,
        Title
      )
      VALUES (
        @MaintenanceTaskId,
        @OrganizationId,
        @PropertyId,
        @Title
      );
    `);
});

// =====================================================
// CLEANUP
// =====================================================

afterAll(async () => {
  const pool = await getDatabase();

  // Delete test assignments.
  await pool
    .request()
    .input(
      "TaskAId",
      sql.UniqueIdentifier,
      taskAId
    )
    .input(
      "TaskBId",
      sql.UniqueIdentifier,
      taskBId
    )
    .query(`
      DELETE FROM dbo.MaintenanceTaskAssignments
      WHERE MaintenanceTaskId IN (
        @TaskAId,
        @TaskBId
      );
    `);

  // Delete test maintenance tasks.
  await pool
    .request()
    .input(
      "TaskAId",
      sql.UniqueIdentifier,
      taskAId
    )
    .input(
      "TaskBId",
      sql.UniqueIdentifier,
      taskBId
    )
    .input(
      "OrganizationId",
      sql.UniqueIdentifier,
      organizationId
    )
    .query(`
      DELETE FROM dbo.MaintenanceTasks
      WHERE MaintenanceTaskId IN (
        @TaskAId,
        @TaskBId
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
// AUTHORIZATION AND LIFECYCLE TESTS
// =====================================================

describe("PropertyIQ Maintenance Task Assignments authorization", () => {

  it("allows Owner to assign a task to a membership", async () => {
    const response = await createAssignment(
      accounts.owner.userId,
      taskAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it("allows Owner to assign a task to an external provider", async () => {
    const response = await createAssignment(
      accounts.owner.userId,
      taskAId,
      {
        serviceProviderId: serviceProviderId!,
      }
    );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it("allows Administrator to create task assignments", async () => {
    const response = await createAssignment(
      accounts.administrator.userId,
      taskAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it("allows Member to create assignments for accessible properties", async () => {
    const response = await createAssignment(
      accounts.member.userId,
      taskAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it("prevents Viewer from creating task assignments", async () => {
    const response = await createAssignment(
      accounts.viewer.userId,
      taskAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(response.status).toBe(403);
  });

  it("rejects an assignment without an assignee", async () => {
    const response = await createAssignment(
      accounts.owner.userId,
      taskAId,
      {}
    );

    expect(response.status).toBe(400);
  });

  it("rejects an assignment with both assignee types", async () => {
    const response = await createAssignment(
      accounts.owner.userId,
      taskAId,
      {
        membershipId: accounts.member.membershipId,
        serviceProviderId: serviceProviderId!,
      }
    );

    expect(response.status).toBe(400);
  });

  it("prevents Member from creating assignments on an inaccessible property", async () => {
    const response = await createAssignment(
      accounts.member.userId,
      taskBId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(response.status).toBe(403);
  });

  it("allows Owner to view assignment history for a task", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .get(`/api/v1/maintenance-task-assignments/task/${taskAId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.count).toBeGreaterThan(0);
  });

  it("allows Member to view assignments for an accessible property", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .get(`/api/v1/maintenance-task-assignments/task/${taskAId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("does not expose assignments for inaccessible properties", async () => {
    const createResponse = await createAssignment(
      accounts.owner.userId,
      taskBId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(createResponse.status).toBe(201);

    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .get(`/api/v1/maintenance-task-assignments/task/${taskBId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(0);
  });

  it("cancels the previous active assignment when a task is reassigned", async () => {
    const firstResponse = await createAssignment(
      accounts.owner.userId,
      taskAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(firstResponse.status).toBe(201);

    const secondResponse = await createAssignment(
      accounts.owner.userId,
      taskAId,
      {
        serviceProviderId: serviceProviderId!,
      }
    );

    expect(secondResponse.status).toBe(201);

    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const historyResponse = await request(app)
      .get(`/api/v1/maintenance-task-assignments/task/${taskAId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(historyResponse.status).toBe(200);

    const history = historyResponse.body.data;

    const previousAssignment = history.find(
      (assignment: any) =>
        getAssignmentId(assignment).toUpperCase() ===
        getAssignmentId(firstResponse.body.data).toUpperCase()
    );

    expect(previousAssignment).toBeDefined();

    expect(getAssignmentStatus(previousAssignment)).toBe(
      "cancelled"
    );

    expect(history.length).toBeGreaterThanOrEqual(2);
  });

  it("allows an authorized user to mark an assignment completed directly", async () => {
    const createResponse = await createAssignment(
      accounts.owner.userId,
      taskAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(createResponse.status).toBe(201);

    const assignmentId = getAssignmentId(
      createResponse.body.data
    );

    const updateResponse = await updateAssignmentStatus(
      accounts.member.userId,
      assignmentId,
      "completed"
    );

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.success).toBe(true);

    expect(
      getAssignmentStatus(updateResponse.body.data)
    ).toBe("completed");

    expect(
      updateResponse.body.data.CompletedAt ??
      updateResponse.body.data.completedAt
    ).toBeTruthy();
  });

  // =====================================================
  // STATUS TRANSITION TESTS
  // =====================================================

  it("allows the complete valid assignment status transition sequence", async () => {
    const createResponse = await createAssignment(
      accounts.owner.userId,
      taskAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(createResponse.status).toBe(201);

    const assignmentId = getAssignmentId(
      createResponse.body.data
    );

    // assigned -> accepted
    const acceptedResponse = await updateAssignmentStatus(
      accounts.member.userId,
      assignmentId,
      "accepted"
    );

    expect(acceptedResponse.status).toBe(200);
    expect(
      getAssignmentStatus(acceptedResponse.body.data)
    ).toBe("accepted");

    // accepted -> in_progress
    const inProgressResponse = await updateAssignmentStatus(
      accounts.member.userId,
      assignmentId,
      "in_progress"
    );

    expect(inProgressResponse.status).toBe(200);
    expect(
      getAssignmentStatus(inProgressResponse.body.data)
    ).toBe("in_progress");

    // in_progress -> completed
    const completedResponse = await updateAssignmentStatus(
      accounts.member.userId,
      assignmentId,
      "completed"
    );

    expect(completedResponse.status).toBe(200);
    expect(
      getAssignmentStatus(completedResponse.body.data)
    ).toBe("completed");

    expect(
      completedResponse.body.data.CompletedAt ??
      completedResponse.body.data.completedAt
    ).toBeTruthy();
  });

  it("prevents reopening a completed assignment", async () => {
    const createResponse = await createAssignment(
      accounts.owner.userId,
      taskAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(createResponse.status).toBe(201);

    const assignmentId = getAssignmentId(
      createResponse.body.data
    );

    const completeResponse = await updateAssignmentStatus(
      accounts.member.userId,
      assignmentId,
      "completed"
    );

    expect(completeResponse.status).toBe(200);

    const reopenResponse = await updateAssignmentStatus(
      accounts.owner.userId,
      assignmentId,
      "assigned"
    );

    expect(reopenResponse.status).not.toBe(200);
  });

  it("prevents changing a cancelled assignment", async () => {
    const firstResponse = await createAssignment(
      accounts.owner.userId,
      taskAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(firstResponse.status).toBe(201);

    const cancelledAssignmentId = getAssignmentId(
      firstResponse.body.data
    );

    // Reassignment cancels the previous active assignment.
    const secondResponse = await createAssignment(
      accounts.owner.userId,
      taskAId,
      {
        serviceProviderId: serviceProviderId!,
      }
    );

    expect(secondResponse.status).toBe(201);

    const updateResponse = await updateAssignmentStatus(
      accounts.owner.userId,
      cancelledAssignmentId,
      "accepted"
    );

    expect(updateResponse.status).not.toBe(200);
  });

  it("prevents Member from updating another member's assignment", async () => {
    const createResponse = await createAssignment(
      accounts.owner.userId,
      taskAId,
      {
        membershipId: accounts.administrator.membershipId,
      }
    );

    expect(createResponse.status).toBe(201);

    const assignmentId = getAssignmentId(
      createResponse.body.data
    );

    const updateResponse = await updateAssignmentStatus(
      accounts.member.userId,
      assignmentId,
      "accepted"
    );

    expect(updateResponse.status).not.toBe(200);
  });

  it("rejects an invalid assignment status", async () => {
    const createResponse = await createAssignment(
      accounts.owner.userId,
      taskAId,
      {
        membershipId: accounts.member.membershipId,
      }
    );

    expect(createResponse.status).toBe(201);

    const assignmentId = getAssignmentId(
      createResponse.body.data
    );

    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .patch(
        `/api/v1/maintenance-task-assignments/${assignmentId}/status`
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({
        status: "deleted",
      });

    expect(response.status).toBe(400);
  });
});
