
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

const propertyAId =
  "2BA345BB-3864-4E83-A0BE-E3B2CC915623";

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
// AUTHENTICATION
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
// TEST FIXTURES
// =====================================================

let ownerHistoryTaskId: string;
let administratorHistoryTaskId: string;
let ownerDeleteTaskId: string;
let administratorDeleteTaskId: string;

const createdTaskIds: string[] = [];

// =====================================================
// API HELPERS
// =====================================================

function deleteMaintenanceTask(
  userId: string,
  maintenanceTaskId: string
) {
  const { token } = authenticatedRequest(userId);

  return request(app)
    .delete(`/api/v1/maintenance-tasks/${maintenanceTaskId}`)
    .query({ organizationId })
    .set("Authorization", `Bearer ${token}`);
}

async function createAssignment(
  maintenanceTaskId: string
) {
  const { token } = authenticatedRequest(
    accounts.owner.userId
  );

  return request(app)
    .post("/api/v1/maintenance-task-assignments")
    .set("Authorization", `Bearer ${token}`)
    .send({
      organizationId,
      maintenanceTaskId,
      membershipId: accounts.member.membershipId,
      notes: "Assignment history deletion protection test",
    });
}

// =====================================================
// DATABASE HELPERS
// =====================================================

async function createTaskFixture(
  title: string
): Promise<string> {
  const pool = await getDatabase();

  const result = await pool
    .request()
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
      title
    )
    .query(`
      INSERT INTO dbo.MaintenanceTasks (
        OrganizationId,
        PropertyId,
        Title
      )
      OUTPUT INSERTED.MaintenanceTaskId
      VALUES (
        @OrganizationId,
        @PropertyId,
        @Title
      );
    `);

  const taskId = result.recordset[0].MaintenanceTaskId;

  createdTaskIds.push(taskId);

  return taskId;
}

async function getAssignmentHistoryCount(
  maintenanceTaskId: string
): Promise<number> {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input(
      "OrganizationId",
      sql.UniqueIdentifier,
      organizationId
    )
    .input(
      "MaintenanceTaskId",
      sql.UniqueIdentifier,
      maintenanceTaskId
    )
    .query(`
      SELECT COUNT(*) AS AssignmentCount
      FROM dbo.MaintenanceTaskAssignments
      WHERE OrganizationId = @OrganizationId
        AND MaintenanceTaskId = @MaintenanceTaskId;
    `);

  return result.recordset[0].AssignmentCount;
}

async function maintenanceTaskExists(
  maintenanceTaskId: string
): Promise<boolean> {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input(
      "OrganizationId",
      sql.UniqueIdentifier,
      organizationId
    )
    .input(
      "MaintenanceTaskId",
      sql.UniqueIdentifier,
      maintenanceTaskId
    )
    .query(`
      SELECT MaintenanceTaskId
      FROM dbo.MaintenanceTasks
      WHERE OrganizationId = @OrganizationId
        AND MaintenanceTaskId = @MaintenanceTaskId;
    `);

  return result.recordset.length > 0;
}

// =====================================================
// SETUP
// =====================================================

beforeAll(async () => {
  ownerHistoryTaskId = await createTaskFixture(
    "Owner Assignment History Delete Protection Test"
  );

  administratorHistoryTaskId = await createTaskFixture(
    "Administrator Assignment History Delete Protection Test"
  );

  ownerDeleteTaskId = await createTaskFixture(
    "Owner Delete Without Assignment History Test"
  );

  administratorDeleteTaskId = await createTaskFixture(
    "Administrator Delete Without Assignment History Test"
  );
});

// =====================================================
// CLEANUP
// =====================================================

afterAll(async () => {
  if (createdTaskIds.length === 0) {
    return;
  }

  const pool = await getDatabase();
  const cleanupRequest = pool.request();

  cleanupRequest.input(
    "OrganizationId",
    sql.UniqueIdentifier,
    organizationId
  );

  const parameters = createdTaskIds.map((id, index) => {
    const name = `Task${index}`;

    cleanupRequest.input(
      name,
      sql.UniqueIdentifier,
      id
    );

    return `@${name}`;
  });

  const taskList = parameters.join(", ");

  // Assignment history must be removed before its tasks.
  await cleanupRequest.query(`
    DELETE FROM dbo.MaintenanceTaskAssignments
    WHERE OrganizationId = @OrganizationId
      AND MaintenanceTaskId IN (${taskList});
  `);

  await cleanupRequest.query(`
    DELETE FROM dbo.MaintenanceTasks
    WHERE OrganizationId = @OrganizationId
      AND MaintenanceTaskId IN (${taskList});
  `);
});

// =====================================================
// ASSIGNMENT HISTORY DELETION PROTECTION
// =====================================================

describe("PropertyIQ Maintenance Task deletion protection", () => {

  it("prevents Owner from deleting a task with assignment history", async () => {
    const assignmentResponse = await createAssignment(
      ownerHistoryTaskId
    );

    expect(assignmentResponse.status).toBe(201);

    const countBefore = await getAssignmentHistoryCount(
      ownerHistoryTaskId
    );

    expect(countBefore).toBe(1);

    const response = await deleteMaintenanceTask(
      accounts.owner.userId,
      ownerHistoryTaskId
    );

    expect(response.status).toBe(400);

    expect(response.body.message).toContain(
      "assignment history"
    );

    expect(
      await maintenanceTaskExists(ownerHistoryTaskId)
    ).toBe(true);

    expect(
      await getAssignmentHistoryCount(ownerHistoryTaskId)
    ).toBe(countBefore);
  });

  it("prevents Administrator from deleting a task with assignment history", async () => {
    const assignmentResponse = await createAssignment(
      administratorHistoryTaskId
    );

    expect(assignmentResponse.status).toBe(201);

    const countBefore = await getAssignmentHistoryCount(
      administratorHistoryTaskId
    );

    expect(countBefore).toBe(1);

    const response = await deleteMaintenanceTask(
      accounts.administrator.userId,
      administratorHistoryTaskId
    );

    expect(response.status).toBe(400);

    expect(response.body.message).toContain(
      "assignment history"
    );

    expect(
      await maintenanceTaskExists(administratorHistoryTaskId)
    ).toBe(true);

    expect(
      await getAssignmentHistoryCount(administratorHistoryTaskId)
    ).toBe(countBefore);
  });

  it("allows Owner to delete a task without assignment history", async () => {
    expect(
      await getAssignmentHistoryCount(ownerDeleteTaskId)
    ).toBe(0);

    const response = await deleteMaintenanceTask(
      accounts.owner.userId,
      ownerDeleteTaskId
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(
      await maintenanceTaskExists(ownerDeleteTaskId)
    ).toBe(false);
  });

  it("allows Administrator to delete a task without assignment history", async () => {
    expect(
      await getAssignmentHistoryCount(administratorDeleteTaskId)
    ).toBe(0);

    const response = await deleteMaintenanceTask(
      accounts.administrator.userId,
      administratorDeleteTaskId
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(
      await maintenanceTaskExists(administratorDeleteTaskId)
    ).toBe(false);
  });

  it("prevents Member from deleting a maintenance task", async () => {
    const response = await deleteMaintenanceTask(
      accounts.member.userId,
      ownerDeleteTaskId
    );

    expect(response.status).toBe(403);
  });

  it("prevents Viewer from deleting a maintenance task", async () => {
    const response = await deleteMaintenanceTask(
      accounts.viewer.userId,
      ownerDeleteTaskId
    );

    expect(response.status).toBe(403);
  });
});
