
import { describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

import app from "../src/app";
import { authConfig } from "../src/config/auth";

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
// VALID REQUEST BODIES
// =====================================================

const createPropertyBody = {
  organizationId,
  propertyName: "Authorization Test Property",
  propertyType: "residential",
  country: "Canada",
  timeZone: "America/Toronto",
  status: "Active",
};

const updatePropertyBody = {
  propertyName: "Updated Authorization Test Property",
  propertyType: "residential",
  country: "Canada",
  timeZone: "America/Toronto",
  status: "Active",
};

// =====================================================
// CREATE TEST ACCESS TOKEN
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
// HELPER: AUTHENTICATED REQUEST
// =====================================================

function authenticatedRequest(userId: string) {
  return {
    token: createAccessToken(userId),
  };
}

// =====================================================
// HELPER: GET PROPERTY IDS
// =====================================================

async function getVisiblePropertyIds(userId: string) {
  const { token } = authenticatedRequest(userId);

  const response = await request(app)
    .get("/api/v1/properties")
    .query({ organizationId })
    .set("Authorization", `Bearer ${token}`);

  expect(response.status).toBe(200);
  expect(response.body.success).toBe(true);
  expect(Array.isArray(response.body.data)).toBe(true);

  return response.body.data.map(
    (property: { PropertyId: string }) =>
      property.PropertyId.toUpperCase()
  );
}

// =====================================================
// PROPERTY-LEVEL ACCESS TESTS
// =====================================================

describe("PropertyIQ property-level access control", () => {
  // ===================================================
  // PROPERTY LIST ACCESS
  // ===================================================

  it("allows the Owner to view both organization properties", async () => {
    const propertyIds = await getVisiblePropertyIds(
      accounts.owner.userId
    );

    expect(propertyIds).toHaveLength(2);
    expect(propertyIds).toContain(propertyAId);
    expect(propertyIds).toContain(propertyBId);
  });

  it("allows the Administrator to view both organization properties", async () => {
    const propertyIds = await getVisiblePropertyIds(
      accounts.administrator.userId
    );

    expect(propertyIds).toHaveLength(2);
    expect(propertyIds).toContain(propertyAId);
    expect(propertyIds).toContain(propertyBId);
  });

  it("limits the Member to assigned Property A", async () => {
    const propertyIds = await getVisiblePropertyIds(
      accounts.member.userId
    );

    expect(propertyIds).toHaveLength(1);
    expect(propertyIds).toContain(propertyAId);
    expect(propertyIds).not.toContain(propertyBId);
  });

  it("limits the Viewer to assigned Property A", async () => {
    const propertyIds = await getVisiblePropertyIds(
      accounts.viewer.userId
    );

    expect(propertyIds).toHaveLength(1);
    expect(propertyIds).toContain(propertyAId);
    expect(propertyIds).not.toContain(propertyBId);
  });

  // ===================================================
  // INDIVIDUAL PROPERTY ACCESS
  // ===================================================

  it("allows a Member to view an assigned property", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .get(`/api/v1/properties/${propertyAId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(
      response.body.data.PropertyId.toUpperCase()
    ).toBe(propertyAId);
  });

  it("denies a Member access to an unassigned property", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .get(`/api/v1/properties/${propertyBId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  it("allows a Viewer to view an assigned property", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .get(`/api/v1/properties/${propertyAId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("denies a Viewer access to an unassigned property", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .get(`/api/v1/properties/${propertyBId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  // ===================================================
  // PROPERTY CREATION RESTRICTIONS
  // ===================================================

  it("prevents a Member from creating properties", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .post("/api/v1/properties")
      .set("Authorization", `Bearer ${token}`)
      .send(createPropertyBody);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("prevents a Viewer from creating properties", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .post("/api/v1/properties")
      .set("Authorization", `Bearer ${token}`)
      .send(createPropertyBody);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  // ===================================================
  // PROPERTY UPDATE RESTRICTIONS
  // ===================================================

  it("prevents a Member from updating an assigned property", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .put(`/api/v1/properties/${propertyAId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send(updatePropertyBody);

    expect(response.status).toBe(404);
  });

  it("prevents a Viewer from updating an assigned property", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .put(`/api/v1/properties/${propertyAId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send(updatePropertyBody);

    expect(response.status).toBe(404);
  });

  // ===================================================
  // PROPERTY DELETE RESTRICTIONS
  // ===================================================

  it("prevents a Member from deleting an assigned property", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .delete(`/api/v1/properties/${propertyAId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  it("prevents a Viewer from deleting an assigned property", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .delete(`/api/v1/properties/${propertyAId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });
});
