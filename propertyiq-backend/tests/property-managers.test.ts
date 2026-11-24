
import {
  afterAll,
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

// =====================================================
// TEST PROPERTIES
// =====================================================

const propertyAId =
  "2BA345BB-3864-4E83-A0BE-E3B2CC915623";

const propertyBId =
  "AC02E56C-E610-4D54-A274-FC3413F8A9C7";

// =====================================================
// TEST MEMBERSHIPS
// =====================================================

const memberships = {
  owner: "FEF9B2ED-6C14-4716-8C0A-EFD7720F960E",
  administrator: "D38E23A2-72DD-4CBA-AAF7-1C60D77D0650",
  member: "A17328BB-02BD-4A2A-A9CF-D79F180B65BA",
  viewer: "DE1E339C-3F5F-41C0-83BF-76FB18E2FFF8",
};

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
// TEST REQUEST BODY
// =====================================================

const createAssignmentBody = {
  organizationId,
  propertyId: propertyBId,
  membershipId: memberships.member,
};

// =====================================================
// TRACK CREATED ASSIGNMENTS FOR CLEANUP
// =====================================================

let createdAssignmentId: string | null = null;

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
// AUTHENTICATED REQUEST HELPER
// =====================================================

function authenticatedRequest(userId: string) {
  return {
    token: createAccessToken(userId),
  };
}

// =====================================================
// CLEANUP
// =====================================================

afterAll(async () => {
  if (!createdAssignmentId) {
    return;
  }

  const pool = await getDatabase();

  await pool
    .request()
    .input(
      "PropertyManagerId",
      sql.UniqueIdentifier,
      createdAssignmentId
    )
    .query(`
      DELETE FROM dbo.PropertyManagers
      WHERE PropertyManagerId = @PropertyManagerId;
    `);
});

// =====================================================
// PROPERTY MANAGER TESTS
// =====================================================

describe("PropertyIQ property manager assignments", () => {
  // ===================================================
  // AUTHENTICATION
  // ===================================================

  it("rejects unauthenticated requests", async () => {
    const response = await request(app)
      .get("/api/v1/property-managers")
      .query({ organizationId });

    expect(response.status).toBe(401);
  });

  // ===================================================
  // READ ACCESS
  // ===================================================

  it("allows the Owner to retrieve property manager assignments", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .get("/api/v1/property-managers")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.count).toBe(response.body.data.length);
  });

  it("allows the Administrator to retrieve property manager assignments", async () => {
    const { token } = authenticatedRequest(
      accounts.administrator.userId
    );

    const response = await request(app)
      .get("/api/v1/property-managers")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("limits a Member to assignments for accessible properties", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .get("/api/v1/property-managers")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    for (const assignment of response.body.data) {
      expect(
        assignment.PropertyId.toUpperCase()
      ).toBe(propertyAId);
    }
  });

  it("limits a Viewer to assignments for accessible properties", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .get("/api/v1/property-managers")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    for (const assignment of response.body.data) {
      expect(
        assignment.PropertyId.toUpperCase()
      ).toBe(propertyAId);
    }
  });

  // ===================================================
  // CREATE PERMISSIONS
  // ===================================================

  it("prevents a Member from creating property manager assignments", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .post("/api/v1/property-managers")
      .set("Authorization", `Bearer ${token}`)
      .send(createAssignmentBody);

    expect(response.status).toBe(403);
  });

  it("prevents a Viewer from creating property manager assignments", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .post("/api/v1/property-managers")
      .set("Authorization", `Bearer ${token}`)
      .send(createAssignmentBody);

    expect(response.status).toBe(403);
  });

  // ===================================================
  // VALIDATION
  // ===================================================

  it("rejects invalid assignment identifiers", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .post("/api/v1/property-managers")
      .set("Authorization", `Bearer ${token}`)
      .send({
        organizationId,
        propertyId: "invalid-property-id",
        membershipId: memberships.member,
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  // ===================================================
  // CREATE, DUPLICATE, RETRIEVE AND END
  // ===================================================

  it("creates, retrieves, prevents duplicates, and ends an assignment", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    // CREATE
    const createResponse = await request(app)
      .post("/api/v1/property-managers")
      .set("Authorization", `Bearer ${token}`)
      .send(createAssignmentBody);

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.success).toBe(true);
    expect(createResponse.body.data).toBeDefined();

    createdAssignmentId =
      createResponse.body.data.PropertyManagerId;

    expect(createdAssignmentId).toBeDefined();

    // DUPLICATE ACTIVE ASSIGNMENT
    const duplicateResponse = await request(app)
      .post("/api/v1/property-managers")
      .set("Authorization", `Bearer ${token}`)
      .send(createAssignmentBody);

    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body.success).toBe(false);

    // RETRIEVE BY ID
    const getResponse = await request(app)
      .get(`/api/v1/property-managers/${createdAssignmentId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.success).toBe(true);

    expect(
      getResponse.body.data.PropertyManagerId.toUpperCase()
    ).toBe(createdAssignmentId.toUpperCase());

    // END ASSIGNMENT
    const endResponse = await request(app)
      .patch(
        `/api/v1/property-managers/${createdAssignmentId}/end`
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(endResponse.status).toBe(200);
    expect(endResponse.body.success).toBe(true);

    // CANNOT END THE SAME ASSIGNMENT TWICE
    const repeatedEndResponse = await request(app)
      .patch(
        `/api/v1/property-managers/${createdAssignmentId}/end`
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(repeatedEndResponse.status).toBe(404);
  });

  // ===================================================
  // ADMINISTRATOR MANAGEMENT
  // ===================================================

  it("allows an Administrator to create a property manager assignment", async () => {
    const { token } = authenticatedRequest(
      accounts.administrator.userId
    );

    const response = await request(app)
      .post("/api/v1/property-managers")
      .set("Authorization", `Bearer ${token}`)
      .send({
        organizationId,
        propertyId: propertyAId,
        membershipId: memberships.viewer,
      });

    if (response.status === 201) {
      const pool = await getDatabase();

      await pool
        .request()
        .input(
          "PropertyManagerId",
          sql.UniqueIdentifier,
          response.body.data.PropertyManagerId
        )
        .query(`
          DELETE FROM dbo.PropertyManagers
          WHERE PropertyManagerId = @PropertyManagerId;
        `);
    }

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  // ===================================================
  // ASSIGNMENT END PERMISSIONS
  // ===================================================

  it("prevents a Member from ending a property manager assignment", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .patch(
        "/api/v1/property-managers/00000000-0000-0000-0000-000000000001/end"
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("prevents a Viewer from ending a property manager assignment", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .patch(
        "/api/v1/property-managers/00000000-0000-0000-0000-000000000001/end"
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});
