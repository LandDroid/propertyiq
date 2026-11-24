
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

const createProviderBody = {
  organizationId,
  companyName: `Integration Test Provider ${uniqueSuffix}`,
  contactName: "Test Contact",
  email: "provider-test@example.com",
  phone: "555-0100",
  website: "https://example.com",
  address: "100 Test Street",
  city: "Hamilton",
  province: "Ontario",
  postalCode: "L8P 1A1",
  country: "Canada",
  notes: "Created by automated integration tests.",
};

const updateProviderBody = {
  companyName: `Updated Test Provider ${uniqueSuffix}`,
  contactName: "Updated Contact",
  email: "updated-provider@example.com",
  phone: "555-0200",
  website: "https://updated-example.com",
  address: "200 Updated Street",
  city: "Toronto",
  province: "Ontario",
  postalCode: "M5V 1A1",
  country: "Canada",
  notes: "Updated by automated integration tests.",
};

// =====================================================
// CREATED PROVIDER TRACKING
// =====================================================

const createdProviderIds: string[] = [];

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

function authenticatedRequest(userId: string) {
  return {
    token: createAccessToken(userId),
  };
}

// =====================================================
// CLEANUP
// =====================================================

afterAll(async () => {
  if (createdProviderIds.length === 0) {
    return;
  }

  const pool = await getDatabase();

  for (const providerId of createdProviderIds) {
    await pool
      .request()
      .input(
        "ServiceProviderId",
        sql.UniqueIdentifier,
        providerId
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
// SERVICE PROVIDER TESTS
// =====================================================

describe("PropertyIQ service provider integration", () => {
  // ===================================================
  // AUTHENTICATION
  // ===================================================

  it("rejects unauthenticated requests", async () => {
    const response = await request(app)
      .get("/api/v1/service-providers")
      .query({ organizationId });

    expect(response.status).toBe(401);
  });

  // ===================================================
  // REQUIRED ORGANIZATION
  // ===================================================

  it("requires an organization ID when listing providers", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .get("/api/v1/service-providers")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(400);
  });

  // ===================================================
  // READ ACCESS
  // ===================================================

  it("allows the Owner to list service providers", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .get("/api/v1/service-providers")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.count).toBe(response.body.data.length);
  });

  it("allows the Administrator to list service providers", async () => {
    const { token } = authenticatedRequest(
      accounts.administrator.userId
    );

    const response = await request(app)
      .get("/api/v1/service-providers")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("allows a Member to list service providers", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .get("/api/v1/service-providers")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("allows a Viewer to list service providers", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .get("/api/v1/service-providers")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  // ===================================================
  // CREATE PERMISSIONS
  // ===================================================

  it("prevents a Member from creating service providers", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .post("/api/v1/service-providers")
      .set("Authorization", `Bearer ${token}`)
      .send(createProviderBody);

    expect(response.status).toBe(403);
  });

  it("prevents a Viewer from creating service providers", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .post("/api/v1/service-providers")
      .set("Authorization", `Bearer ${token}`)
      .send(createProviderBody);

    expect(response.status).toBe(403);
  });

  // ===================================================
  // VALIDATION
  // ===================================================

  it("rejects service provider creation without a company name", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .post("/api/v1/service-providers")
      .set("Authorization", `Bearer ${token}`)
      .send({
        organizationId,
        email: "invalid-provider@example.com",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("rejects an invalid service provider email", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .post("/api/v1/service-providers")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...createProviderBody,
        email: "not-an-email",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  // ===================================================
  // ADMINISTRATOR CREATION
  // ===================================================

  it("allows an Administrator to create a service provider", async () => {
    const { token } = authenticatedRequest(
      accounts.administrator.userId
    );

    const response = await request(app)
      .post("/api/v1/service-providers")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...createProviderBody,
        companyName: `Administrator Test Provider ${uniqueSuffix}`,
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    const providerId =
      response.body.data.serviceProviderId;

    expect(providerId).toBeDefined();

    createdProviderIds.push(providerId);
  });

  // ===================================================
  // COMPLETE PROVIDER LIFECYCLE
  // ===================================================

  it("creates, retrieves, updates, deactivates, and reactivates a provider", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    // CREATE
    const createResponse = await request(app)
      .post("/api/v1/service-providers")
      .set("Authorization", `Bearer ${token}`)
      .send(createProviderBody);

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.success).toBe(true);

    const providerId =
      createResponse.body.data.serviceProviderId;

    expect(providerId).toBeDefined();

    createdProviderIds.push(providerId);

    // GET BY ID
    const getResponse = await request(app)
      .get(`/api/v1/service-providers/${providerId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.success).toBe(true);
    expect(
      getResponse.body.data.serviceProviderId.toUpperCase()
    ).toBe(providerId.toUpperCase());

    // UPDATE
    const updateResponse = await request(app)
      .put(`/api/v1/service-providers/${providerId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send(updateProviderBody);

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.success).toBe(true);
    expect(updateResponse.body.data.companyName).toBe(
      updateProviderBody.companyName
    );

    // DEACTIVATE
    const deactivateResponse = await request(app)
      .patch(
        `/api/v1/service-providers/${providerId}/status`
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "inactive" });

    expect(deactivateResponse.status).toBe(200);
    expect(deactivateResponse.body.success).toBe(true);
    expect(deactivateResponse.body.data.status).toBe("inactive");

    // INACTIVE PROVIDER REMAINS VISIBLE
    const inactiveGetResponse = await request(app)
      .get(`/api/v1/service-providers/${providerId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(inactiveGetResponse.status).toBe(200);
    expect(inactiveGetResponse.body.data.status).toBe("inactive");

    // REACTIVATE
    const reactivateResponse = await request(app)
      .patch(
        `/api/v1/service-providers/${providerId}/status`
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "active" });

    expect(reactivateResponse.status).toBe(200);
    expect(reactivateResponse.body.success).toBe(true);
    expect(reactivateResponse.body.data.status).toBe("active");
  });

  // ===================================================
  // UPDATE PERMISSIONS
  // ===================================================

  it("prevents a Member from updating service providers", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .put(
        "/api/v1/service-providers/00000000-0000-0000-0000-000000000001"
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send(updateProviderBody);

    expect(response.status).toBe(403);
  });

  it("prevents a Viewer from updating service providers", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .put(
        "/api/v1/service-providers/00000000-0000-0000-0000-000000000001"
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send(updateProviderBody);

    expect(response.status).toBe(403);
  });

  // ===================================================
  // STATUS PERMISSIONS
  // ===================================================

  it("prevents a Member from changing provider status", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .patch(
        "/api/v1/service-providers/00000000-0000-0000-0000-000000000001/status"
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "inactive" });

    expect(response.status).toBe(403);
  });

  it("prevents a Viewer from changing provider status", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .patch(
        "/api/v1/service-providers/00000000-0000-0000-0000-000000000001/status"
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "inactive" });

    expect(response.status).toBe(403);
  });

  it("rejects an unsupported provider status", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .patch(
        "/api/v1/service-providers/00000000-0000-0000-0000-000000000001/status"
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "suspended" });

    expect(response.status).toBe(400);
  });

  // ===================================================
  // ORGANIZATION ISOLATION
  // ===================================================

  it("does not expose a provider through another organization", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const createResponse = await request(app)
      .post("/api/v1/service-providers")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...createProviderBody,
        companyName: `Isolation Test Provider ${uniqueSuffix}`,
      });

    expect(createResponse.status).toBe(201);

    const providerId =
      createResponse.body.data.serviceProviderId;

    createdProviderIds.push(providerId);

    const getResponse = await request(app)
      .get(`/api/v1/service-providers/${providerId}`)
      .query({ organizationId: otherOrganizationId })
      .set("Authorization", `Bearer ${token}`);

    // The organization membership middleware rejects this
    // before the provider repository is reached.
    expect(getResponse.status).toBe(403);
  });
});
