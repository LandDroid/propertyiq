
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import request from "supertest";
import jwt from "jsonwebtoken";
import crypto from "crypto";

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
// TEST DATA
// =====================================================

const uniqueSuffix = Date.now();

const serviceProviderId = crypto.randomUUID();

const createdServiceIds: string[] = [];

const createdProviderIds: string[] = [
  serviceProviderId,
];

const baseServiceBody = {
  organizationId,
  propertyId: propertyAId,

  serviceProviderId,
  assignedMembershipId: null,

  serviceName: `Integration Test HVAC ${uniqueSuffix}`,
  serviceCategory: "HVAC",

  description: "Created by automated integration tests.",

  serviceFrequency: "Monthly",

  contractReference: `TEST-${uniqueSuffix}`,

  contractStartDate: "2026-01-01",
  contractEndDate: "2026-12-31",

  nextServiceDate: "2026-12-15T10:00:00Z",

  notes: "Property Services integration test.",

  status: "active",
};

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
// DATABASE FIXTURE
// =====================================================

beforeAll(async () => {
  const pool = await getDatabase();

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
    .input(
      "CompanyName",
      sql.NVarChar(255),
      `Property Services Test Provider ${uniqueSuffix}`
    )
    .query(`
      INSERT INTO dbo.ServiceProviders (
        ServiceProviderId,
        OrganizationId,
        CompanyName,
        Status,
        CreatedAt
      )
      VALUES (
        @ServiceProviderId,
        @OrganizationId,
        @CompanyName,
        'active',
        SYSDATETIME()
      );
    `);
});

// =====================================================
// CLEANUP
// =====================================================

afterAll(async () => {
  const pool = await getDatabase();

  for (const serviceId of createdServiceIds) {
    await pool
      .request()
      .input(
        "PropertyServiceId",
        sql.UniqueIdentifier,
        serviceId
      )
      .input(
        "OrganizationId",
        sql.UniqueIdentifier,
        organizationId
      )
      .query(`
        DELETE FROM dbo.PropertyServices
        WHERE PropertyServiceId = @PropertyServiceId
          AND OrganizationId = @OrganizationId;
      `);
  }

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
// HELPERS
// =====================================================

async function createService(
  token: string,
  overrides: Record<string, unknown> = {}
) {
  const response = await request(app)
    .post("/api/v1/property-services")
    .set("Authorization", `Bearer ${token}`)
    .send({
      ...baseServiceBody,
      ...overrides,
    });

  if (response.status === 201) {
    const serviceId =
      response.body.service?.PropertyServiceId;

    if (serviceId) {
      createdServiceIds.push(serviceId);
    }
  }

  return response;
}

// =====================================================
// PROPERTY SERVICES TESTS
// =====================================================

describe("PropertyIQ property services integration", () => {
  // ===================================================
  // AUTHENTICATION
  // ===================================================

  it("rejects unauthenticated requests", async () => {
    const response = await request(app)
      .get("/api/v1/property-services")
      .query({ organizationId });

    expect(response.status).toBe(401);
  });

  // ===================================================
  // REQUIRED ORGANIZATION
  // ===================================================

  it("requires an organization ID when listing services", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .get("/api/v1/property-services")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(400);
  });

  // ===================================================
  // READ ACCESS
  // ===================================================

  it("allows the Owner to list property services", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .get("/api/v1/property-services")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it("allows the Administrator to list property services", async () => {
    const { token } = authenticatedRequest(
      accounts.administrator.userId
    );

    const response = await request(app)
      .get("/api/v1/property-services")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it("allows a Member to list services for accessible properties only", async () => {
    const { token: ownerToken } = authenticatedRequest(
      accounts.owner.userId
    );

    const propertyAResponse = await createService(
      ownerToken,
      {
        propertyId: propertyAId,
        serviceName: `Member Visible Service ${uniqueSuffix}`,
      }
    );

    expect(propertyAResponse.status).toBe(201);

    const propertyBResponse = await createService(
      ownerToken,
      {
        propertyId: propertyBId,
        serviceName: `Member Hidden Service ${uniqueSuffix}`,
      }
    );

    expect(propertyBResponse.status).toBe(201);

    const propertyAServiceId =
      propertyAResponse.body.service.PropertyServiceId;

    const propertyBServiceId =
      propertyBResponse.body.service.PropertyServiceId;

    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .get("/api/v1/property-services")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    const returnedIds = response.body.map(
      (service: { PropertyServiceId: string }) =>
        service.PropertyServiceId.toUpperCase()
    );

    expect(returnedIds).toContain(
      propertyAServiceId.toUpperCase()
    );

    expect(returnedIds).not.toContain(
      propertyBServiceId.toUpperCase()
    );
  });

  it("allows a Viewer to list services for accessible properties", async () => {
    const { token: ownerToken } = authenticatedRequest(
      accounts.owner.userId
    );

    const createResponse = await createService(
      ownerToken,
      {
        propertyId: propertyAId,
        serviceName: `Viewer Visible Service ${uniqueSuffix}`,
      }
    );

    expect(createResponse.status).toBe(201);

    const serviceId =
      createResponse.body.service.PropertyServiceId;

    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .get("/api/v1/property-services")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    const returnedIds = response.body.map(
      (service: { PropertyServiceId: string }) =>
        service.PropertyServiceId.toUpperCase()
    );

    expect(returnedIds).toContain(
      serviceId.toUpperCase()
    );
  });

  it("does not allow a Member to retrieve a service on an inaccessible property", async () => {
    const { token: ownerToken } = authenticatedRequest(
      accounts.owner.userId
    );

    const createResponse = await createService(
      ownerToken,
      {
        propertyId: propertyBId,
      }
    );

    expect(createResponse.status).toBe(201);

    const serviceId =
      createResponse.body.service.PropertyServiceId;

    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .get(`/api/v1/property-services/${serviceId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  // ===================================================
  // CREATE PERMISSIONS
  // ===================================================

  it("allows an Administrator to create a property service", async () => {
    const { token } = authenticatedRequest(
      accounts.administrator.userId
    );

    const response = await createService(token, {
      serviceName: `Administrator Created Service ${uniqueSuffix}`,
    });

    expect(response.status).toBe(201);
    expect(response.body.service).toBeDefined();
    expect(
      response.body.service.PropertyServiceId
    ).toBeDefined();
  });

  it("prevents a Member from creating property services", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .post("/api/v1/property-services")
      .set("Authorization", `Bearer ${token}`)
      .send(baseServiceBody);

    expect(response.status).toBe(403);
  });

  it("prevents a Viewer from creating property services", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .post("/api/v1/property-services")
      .set("Authorization", `Bearer ${token}`)
      .send(baseServiceBody);

    expect(response.status).toBe(403);
  });

  // ===================================================
  // ASSIGNEE VALIDATION
  // ===================================================

  it("allows assignment to an external service provider", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await createService(token);

    expect(response.status).toBe(201);

    expect(
      response.body.service.ServiceProviderId.toUpperCase()
    ).toBe(serviceProviderId.toUpperCase());

    expect(
      response.body.service.AssignedMembershipId
    ).toBeNull();
  });

  it("allows assignment to an internal organization membership", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await createService(token, {
      serviceProviderId: null,
      assignedMembershipId: memberships.member,
    });

    expect(response.status).toBe(201);

    expect(
      response.body.service.AssignedMembershipId.toUpperCase()
    ).toBe(memberships.member.toUpperCase());

    expect(
      response.body.service.ServiceProviderId
    ).toBeNull();
  });

  it("rejects a service with both assignee types", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .post("/api/v1/property-services")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...baseServiceBody,
        assignedMembershipId: memberships.member,
      });

    expect(response.status).toBe(400);
  });

  it("rejects a service without an assignee", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .post("/api/v1/property-services")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...baseServiceBody,
        serviceProviderId: null,
        assignedMembershipId: null,
      });

    expect(response.status).toBe(400);
  });

  it("rejects a service assigned to a nonexistent provider", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await createService(token, {
      serviceProviderId:
        "A1000001-0000-4000-8000-000000000002",
      assignedMembershipId: null,
    });

    expect(response.status).toBe(403);
  });

  it("rejects a service assigned to a nonexistent membership", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await createService(token, {
      serviceProviderId: null,
      assignedMembershipId:
        "A1000001-0000-4000-8000-000000000002",
    });

    expect(response.status).toBe(403);
  });

  // ===================================================
  // CONTRACT VALIDATION
  // ===================================================

  it("rejects a contract end date before its start date", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .post("/api/v1/property-services")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...baseServiceBody,
        contractStartDate: "2026-12-31",
        contractEndDate: "2026-01-01",
      });

    expect(response.status).toBe(400);
  });

  // ===================================================
  // COMPLETE SERVICE LIFECYCLE
  // ===================================================

  it("creates, retrieves, updates, deactivates, and reactivates a property service", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const createResponse = await createService(token);

    expect(createResponse.status).toBe(201);

    const serviceId =
      createResponse.body.service.PropertyServiceId;

    expect(serviceId).toBeDefined();

    const getResponse = await request(app)
      .get(`/api/v1/property-services/${serviceId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(getResponse.status).toBe(200);

    expect(
      getResponse.body.PropertyServiceId.toUpperCase()
    ).toBe(serviceId.toUpperCase());

    const updateResponse = await request(app)
      .put(`/api/v1/property-services/${serviceId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({
        serviceProviderId: serviceProviderId,
        assignedMembershipId: null,

        serviceName: `Updated Property Service ${uniqueSuffix}`,
        serviceCategory: "HVAC",

        description: "Updated integration test service.",

        serviceFrequency: "Quarterly",

        contractReference: `UPDATED-${uniqueSuffix}`,

        contractStartDate: "2026-01-01",
        contractEndDate: "2026-12-31",

        nextServiceDate: "2026-12-20T10:00:00Z",

        notes: "Updated integration test notes.",

        status: "active",
      });

    expect(updateResponse.status).toBe(200);

    expect(
      updateResponse.body.service.ServiceName
    ).toBe(`Updated Property Service ${uniqueSuffix}`);

    const deactivateResponse = await request(app)
      .patch(
        `/api/v1/property-services/${serviceId}/status`
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "inactive" });

    expect(deactivateResponse.status).toBe(200);

    expect(
      deactivateResponse.body.service.Status
    ).toBe("inactive");

    const inactiveGetResponse = await request(app)
      .get(`/api/v1/property-services/${serviceId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(inactiveGetResponse.status).toBe(200);

    expect(inactiveGetResponse.body.Status).toBe("inactive");

    const reactivateResponse = await request(app)
      .patch(
        `/api/v1/property-services/${serviceId}/status`
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "active" });

    expect(reactivateResponse.status).toBe(200);

    expect(
      reactivateResponse.body.service.Status
    ).toBe("active");
  });

  // ===================================================
  // UPDATE PERMISSIONS
  // ===================================================

  it("prevents a Member from updating property services", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .put(
        "/api/v1/property-services/00000000-0000-0000-0000-000000000001"
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({
        serviceProviderId,
        assignedMembershipId: null,
        serviceName: "Unauthorized Update",
        serviceCategory: "HVAC",
        description: null,
        serviceFrequency: null,
        contractReference: null,
        contractStartDate: null,
        contractEndDate: null,
        nextServiceDate: null,
        notes: null,
        status: "active",
      });

    expect(response.status).toBe(403);
  });

  it("prevents a Viewer from updating property services", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .put(
        "/api/v1/property-services/00000000-0000-0000-0000-000000000001"
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({
        serviceProviderId,
        assignedMembershipId: null,
        serviceName: "Unauthorized Update",
        serviceCategory: "HVAC",
        description: null,
        serviceFrequency: null,
        contractReference: null,
        contractStartDate: null,
        contractEndDate: null,
        nextServiceDate: null,
        notes: null,
        status: "active",
      });

    expect(response.status).toBe(403);
  });

  // ===================================================
  // STATUS PERMISSIONS
  // ===================================================

  it("prevents a Member from changing property service status", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .patch(
        "/api/v1/property-services/00000000-0000-0000-0000-000000000001/status"
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "inactive" });

    expect(response.status).toBe(403);
  });

  it("prevents a Viewer from changing property service status", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .patch(
        "/api/v1/property-services/00000000-0000-0000-0000-000000000001/status"
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "inactive" });

    expect(response.status).toBe(403);
  });

  it("rejects an unsupported property service status", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .patch(
        "/api/v1/property-services/00000000-0000-0000-0000-000000000001/status"
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "suspended" });

    expect(response.status).toBe(400);
  });

  // ===================================================
  // ORGANIZATION ISOLATION
  // ===================================================

  it("does not expose property services through another organization", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .get("/api/v1/property-services")
      .query({ organizationId: otherOrganizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});
