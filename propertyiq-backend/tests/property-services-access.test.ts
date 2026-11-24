
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
// TRACK TEST RECORDS FOR CLEANUP
// =====================================================

let serviceProviderId: string | null = null;

const createdPropertyServiceIds: string[] = [];

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
// CREATE SERVICE PROVIDER
// =====================================================

async function createServiceProvider() {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input("OrganizationId", sql.UniqueIdentifier, organizationId)
    .input("CompanyName", sql.NVarChar(200), "PropertyIQ Test HVAC Provider")
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

  return result.recordset[0].ServiceProviderId as string;
}

// =====================================================
// CREATE PROPERTY SERVICE
// =====================================================

async function createPropertyService(
  userId: string,
  propertyId: string,
  assignee: {
    assignedMembershipId?: string;
    serviceProviderId?: string;
  },
  serviceName: string
) {
  const { token } = authenticatedRequest(userId);

  return request(app)
    .post("/api/v1/property-services")
    .set("Authorization", `Bearer ${token}`)
    .send({
      organizationId,
      propertyId,
      ...assignee,
      serviceName,
      serviceCategory: "Maintenance",
      description: "PropertyIQ integration test service",
      serviceFrequency: "Monthly",
      contractReference: null,
      contractStartDate: null,
      contractEndDate: null,
      nextServiceDate: null,
      notes: "Created by automated integration test",
      status: "active",
    });
}

// =====================================================
// EXTRACT PROPERTY SERVICE ID
// =====================================================

function getPropertyServiceId(data: any): string {
  const id =
    data?.PropertyServiceId ??
    data?.propertyServiceId;

  if (!id) {
    throw new Error(
      "Property Service ID was not returned."
    );
  }

  return String(id).toUpperCase();
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

  return String(id).toUpperCase();
}

// =====================================================
// SETUP AND CLEANUP
// =====================================================

beforeAll(async () => {
  serviceProviderId = await createServiceProvider();

  // Internal membership assignment on Property A.
  const propertyAResponse = await createPropertyService(
    accounts.owner.userId,
    propertyAId,
    {
      assignedMembershipId: accounts.member.membershipId,
    },
    "Test Internal Maintenance"
  );

  expect(propertyAResponse.status).toBe(201);

  const propertyAService = propertyAResponse.body.service;

  createdPropertyServiceIds.push(
    getPropertyServiceId(propertyAService)
  );

  // External provider assignment on Property B.
  const propertyBResponse = await createPropertyService(
    accounts.owner.userId,
    propertyBId,
    {
      serviceProviderId,
    },
    "Test External HVAC Service"
  );

  expect(propertyBResponse.status).toBe(201);

  const propertyBService = propertyBResponse.body.service;

  createdPropertyServiceIds.push(
    getPropertyServiceId(propertyBService)
  );
});

afterAll(async () => {
  const pool = await getDatabase();

  // Delete only the services created by this test.
  for (const propertyServiceId of createdPropertyServiceIds) {
    await pool
      .request()
      .input(
        "PropertyServiceId",
        sql.UniqueIdentifier,
        propertyServiceId
      )
      .query(`
        DELETE FROM dbo.PropertyServices
        WHERE PropertyServiceId = @PropertyServiceId;
      `);
  }

  // Delete the test provider after its services are removed.
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
// PROPERTY SERVICES AUTHORIZATION TESTS
// =====================================================

describe("PropertyIQ Property Services authorization", () => {
  // ===================================================
  // OWNER ACCESS
  // ===================================================

  it("allows Owner to view services across both properties", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .get("/api/v1/property-services")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    const visibleServiceIds = response.body.map(
      (service: any) => getPropertyServiceId(service)
    );

    expect(visibleServiceIds).toContain(
      createdPropertyServiceIds[0]
    );

    expect(visibleServiceIds).toContain(
      createdPropertyServiceIds[1]
    );

    const propertyIds = response.body.map(
      (service: any) => getPropertyId(service)
    );

    expect(propertyIds).toContain(propertyAId);
    expect(propertyIds).toContain(propertyBId);
  });

  // ===================================================
  // ADMINISTRATOR ACCESS
  // ===================================================

  it("allows Administrator to view services across both properties", async () => {
    const { token } = authenticatedRequest(
      accounts.administrator.userId
    );

    const response = await request(app)
      .get("/api/v1/property-services")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    const visibleServiceIds = response.body.map(
      (service: any) => getPropertyServiceId(service)
    );

    expect(visibleServiceIds).toContain(
      createdPropertyServiceIds[0]
    );

    expect(visibleServiceIds).toContain(
      createdPropertyServiceIds[1]
    );
  });

  // ===================================================
  // MEMBER PROPERTY ACCESS
  // ===================================================

  it("limits Member to services on Property A", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .get("/api/v1/property-services")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    const visibleServiceIds = response.body.map(
      (service: any) => getPropertyServiceId(service)
    );

    expect(visibleServiceIds).toContain(
      createdPropertyServiceIds[0]
    );

    expect(visibleServiceIds).not.toContain(
      createdPropertyServiceIds[1]
    );

    expect(
      response.body.every(
        (service: any) => getPropertyId(service) === propertyAId
      )
    ).toBe(true);
  });

  // ===================================================
  // VIEWER PROPERTY ACCESS
  // ===================================================

  it("limits Viewer to services on Property A", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .get("/api/v1/property-services")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    const visibleServiceIds = response.body.map(
      (service: any) => getPropertyServiceId(service)
    );

    expect(visibleServiceIds).toContain(
      createdPropertyServiceIds[0]
    );

    expect(visibleServiceIds).not.toContain(
      createdPropertyServiceIds[1]
    );

    expect(
      response.body.every(
        (service: any) => getPropertyId(service) === propertyAId
      )
    ).toBe(true);
  });

  // ===================================================
  // MEMBER CANNOT CREATE
  // ===================================================

  it("prevents Member from creating property services", async () => {
    const response = await createPropertyService(
      accounts.member.userId,
      propertyAId,
      {
        assignedMembershipId: accounts.member.membershipId,
      },
      "Unauthorized Member Service"
    );

    expect(response.status).toBe(403);
  });

  // ===================================================
  // VIEWER CANNOT CREATE
  // ===================================================

  it("prevents Viewer from creating property services", async () => {
    const response = await createPropertyService(
      accounts.viewer.userId,
      propertyAId,
      {
        assignedMembershipId: accounts.viewer.membershipId,
      },
      "Unauthorized Viewer Service"
    );

    expect(response.status).toBe(403);
  });

  // ===================================================
  // MEMBER CANNOT UPDATE
  // ===================================================

  it("prevents Member from updating a property service", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .patch(
        `/api/v1/property-services/${createdPropertyServiceIds[0]}/status`
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "inactive" });

    expect(response.status).toBe(403);
  });

  // ===================================================
  // VIEWER CANNOT UPDATE
  // ===================================================

  it("prevents Viewer from updating a property service", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .patch(
        `/api/v1/property-services/${createdPropertyServiceIds[0]}/status`
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "inactive" });

    expect(response.status).toBe(403);
  });

  // ===================================================
  // INTERNAL ASSIGNMENT
  // ===================================================

  it("creates a service assigned to an internal membership", async () => {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input(
        "PropertyServiceId",
        sql.UniqueIdentifier,
        createdPropertyServiceIds[0]
      )
      .query(`
        SELECT
          PropertyId,
          AssignedMembershipId,
          ServiceProviderId
        FROM dbo.PropertyServices
        WHERE PropertyServiceId = @PropertyServiceId;
      `);

    expect(result.recordset).toHaveLength(1);

    expect(
      result.recordset[0].AssignedMembershipId.toUpperCase()
    ).toBe(accounts.member.membershipId);

    expect(result.recordset[0].ServiceProviderId).toBeNull();
  });

  // ===================================================
  // EXTERNAL PROVIDER ASSIGNMENT
  // ===================================================

  it("creates a service assigned to an external service provider", async () => {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input(
        "PropertyServiceId",
        sql.UniqueIdentifier,
        createdPropertyServiceIds[1]
      )
      .query(`
        SELECT
          PropertyId,
          AssignedMembershipId,
          ServiceProviderId
        FROM dbo.PropertyServices
        WHERE PropertyServiceId = @PropertyServiceId;
      `);

    expect(result.recordset).toHaveLength(1);
    expect(result.recordset[0].AssignedMembershipId).toBeNull();

    expect(
      result.recordset[0].ServiceProviderId.toUpperCase()
    ).toBe(serviceProviderId?.toUpperCase());
  });

  // ===================================================
  // INVALID DOUBLE ASSIGNMENT
  // ===================================================

  it("rejects a service assigned to both a membership and provider", async () => {
    const response = await request(app)
      .post("/api/v1/property-services")
      .set(
        "Authorization",
        `Bearer ${createAccessToken(accounts.owner.userId)}`
      )
      .send({
        organizationId,
        propertyId: propertyAId,
        assignedMembershipId: accounts.member.membershipId,
        serviceProviderId,
        serviceName: "Invalid Double Assignment",
        serviceCategory: "Maintenance",
      });

    expect(response.status).toBe(400);
  });

  // ===================================================
  // INVALID MISSING ASSIGNMENT
  // ===================================================

  it("rejects a service without an assignee", async () => {
    const response = await request(app)
      .post("/api/v1/property-services")
      .set(
        "Authorization",
        `Bearer ${createAccessToken(accounts.owner.userId)}`
      )
      .send({
        organizationId,
        propertyId: propertyAId,
        serviceName: "Missing Assignee",
        serviceCategory: "Maintenance",
      });

    expect(response.status).toBe(400);
  });
});
