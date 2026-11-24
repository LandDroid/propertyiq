
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
// SECURITY TEST ORGANIZATION
// =====================================================

const organizationId =
  "4587318B-7DA1-482E-B0B7-587B9A26C7D8";

// =====================================================
// TEST PROPERTY IDS
// =====================================================

const propertyAId =
  "2BA345BB-3864-4E83-A0BE-E3B2CC915623";

const propertyBId =
  "AC02E56C-E610-4D54-A274-FC3413F8A9C7";

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
// TRACK TEST ASSIGNMENTS FOR CLEANUP
// =====================================================

const createdAssignmentIds: string[] = [];

let propertyAAssignmentId: string;
let propertyBAssignmentId: string;

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

// =====================================================
// REQUEST HELPER
// =====================================================

function authenticatedRequest(userId: string) {
  return {
    token: createAccessToken(userId),
  };
}

// =====================================================
// CREATE ASSIGNMENT HELPER
// =====================================================

async function createAssignment(
  userId: string,
  propertyId: string,
  membershipId: string
) {
  const { token } = authenticatedRequest(userId);

  return request(app)
    .post("/api/v1/property-managers")
    .set("Authorization", `Bearer ${token}`)
    .send({
      organizationId,
      propertyId,
      membershipId,
    });
}

// =====================================================
// EXTRACT ASSIGNMENT ID
// Supports SQL Server PascalCase output
// and camelCase aliases.
// =====================================================

function getAssignmentId(data: any): string {
  const id =
    data?.PropertyManagerId ??
    data?.propertyManagerId;

  if (!id) {
    throw new Error(
      "Property Manager assignment ID was not returned."
    );
  }

  return id;
}

// =====================================================
// EXTRACT PROPERTY ID
// =====================================================

function getPropertyId(data: any): string {
  const id =
    data?.PropertyId ??
    data?.propertyId;

  if (!id) {
    throw new Error(
      "Property ID was not returned."
    );
  }

  return id.toUpperCase();
}

// =====================================================
// SETUP AND CLEANUP
// =====================================================

beforeAll(async () => {
  // Create an assignment on Property A for the Member.
  const propertyAResponse = await createAssignment(
    accounts.owner.userId,
    propertyAId,
    accounts.member.membershipId
  );

  expect(propertyAResponse.status).toBe(201);
  expect(propertyAResponse.body.success).toBe(true);

  propertyAAssignmentId = getAssignmentId(
    propertyAResponse.body.data
  );

  createdAssignmentIds.push(propertyAAssignmentId);

  // Create an assignment on Property B for the Viewer.
  const propertyBResponse = await createAssignment(
    accounts.owner.userId,
    propertyBId,
    accounts.viewer.membershipId
  );

  expect(propertyBResponse.status).toBe(201);
  expect(propertyBResponse.body.success).toBe(true);

  propertyBAssignmentId = getAssignmentId(
    propertyBResponse.body.data
  );

  createdAssignmentIds.push(propertyBAssignmentId);
});

afterAll(async () => {
  if (createdAssignmentIds.length === 0) {
    return;
  }

  const pool = await getDatabase();

  for (const assignmentId of createdAssignmentIds) {
    await pool
      .request()
      .input(
        "propertyManagerId",
        sql.UniqueIdentifier,
        assignmentId
      )
      .query(`
        UPDATE dbo.PropertyManagers
        SET
          Status = 'inactive',
          EndedAt = COALESCE(EndedAt, SYSDATETIME())
        WHERE PropertyManagerId = @propertyManagerId
          AND Status = 'active';
      `);
  }
});

// =====================================================
// PROPERTY MANAGERS AUTHORIZATION TESTS
// =====================================================

describe("PropertyIQ Property Managers authorization", () => {
  // ===================================================
  // OWNER ACCESS
  // ===================================================

  it("allows Owner to view assignments across both properties", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .get("/api/v1/property-managers")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.count).toBe(2);
    expect(response.body.data).toHaveLength(2);

    const propertyIds = response.body.data.map(
      (assignment: any) => getPropertyId(assignment)
    );

    expect(propertyIds).toContain(propertyAId);
    expect(propertyIds).toContain(propertyBId);
  });

  // ===================================================
  // ADMINISTRATOR ACCESS
  // ===================================================

  it("allows Administrator to view assignments across both properties", async () => {
    const { token } = authenticatedRequest(
      accounts.administrator.userId
    );

    const response = await request(app)
      .get("/api/v1/property-managers")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);
    expect(response.body.data).toHaveLength(2);
  });

  // ===================================================
  // MEMBER PROPERTY ACCESS
  // ===================================================

  it("limits Member to assignments on Property A", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .get("/api/v1/property-managers")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.count).toBe(1);
    expect(response.body.data).toHaveLength(1);

    expect(
      getPropertyId(response.body.data[0])
    ).toBe(propertyAId);
  });

  // ===================================================
  // VIEWER PROPERTY ACCESS
  // ===================================================

  it("limits Viewer to assignments on Property A", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .get("/api/v1/property-managers")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.data).toHaveLength(1);

    expect(
      getPropertyId(response.body.data[0])
    ).toBe(propertyAId);
  });

  // ===================================================
  // MEMBER CANNOT CREATE
  // ===================================================

  it("prevents Member from creating property manager assignments", async () => {
    const response = await createAssignment(
      accounts.member.userId,
      propertyAId,
      accounts.viewer.membershipId
    );

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  // ===================================================
  // MEMBER CANNOT END
  // ===================================================

  it("prevents Member from ending an assignment", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .patch(
        `/api/v1/property-managers/${propertyAAssignmentId}/end`
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  // ===================================================
  // DUPLICATE ACTIVE ASSIGNMENT
  // ===================================================

  it("prevents duplicate active assignments", async () => {
    const response = await createAssignment(
      accounts.owner.userId,
      propertyAId,
      accounts.member.membershipId
    );

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
  });

  // ===================================================
  // END ASSIGNMENT
  // ===================================================

  it("allows Administrator to end an assignment", async () => {
    const { token } = authenticatedRequest(
      accounts.administrator.userId
    );

    const response = await request(app)
      .patch(
        `/api/v1/property-managers/${propertyBAssignmentId}/end`
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  // ===================================================
  // ENDED ASSIGNMENT IS NO LONGER ACTIVE
  // ===================================================

  it("does not return ended assignments in the active list", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .get("/api/v1/property-managers")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.data).toHaveLength(1);

    expect(
      getPropertyId(response.body.data[0])
    ).toBe(propertyAId);
  });

  // ===================================================
  // ENDED ASSIGNMENT CANNOT BE ENDED AGAIN
  // ===================================================

  it("does not allow an already ended assignment to be ended again", async () => {
    const { token } = authenticatedRequest(
      accounts.administrator.userId
    );

    const response = await request(app)
      .patch(
        `/api/v1/property-managers/${propertyBAssignmentId}/end`
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });
});
