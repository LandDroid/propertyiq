
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

let ownerProviderId: string | null = null;
let administratorProviderId: string | null = null;

const createdProviderIds: string[] = [];
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
// CREATE SERVICE PROVIDER THROUGH API
// =====================================================

async function createProvider(
  userId: string,
  companyName: string
) {
  const { token } = authenticatedRequest(userId);

  return request(app)
    .post("/api/v1/service-providers")
    .set("Authorization", `Bearer ${token}`)
    .send({
      organizationId,
      companyName,
      contactName: "Test Contact",
      email: "test@propertyiq.com",
      phone: "555-0100",
      website: "https://example.com",
      address: "100 Test Street",
      city: "Hamilton",
      province: "Ontario",
      postalCode: "L8P 1A1",
      country: "Canada",
      notes: "Created by automated integration test",
    });
}

// =====================================================
// EXTRACT SERVICE PROVIDER ID
// =====================================================

function getServiceProviderId(data: any): string {
  const id =
    data?.serviceProviderId ??
    data?.ServiceProviderId;

  if (!id) {
    throw new Error("Service Provider ID was not returned.");
  }

  return id;
}

// =====================================================
// CREATE PROPERTY SERVICE ASSIGNED TO PROVIDER
// =====================================================

async function createPropertyService(
  serviceProviderId: string
) {
  const { token } = authenticatedRequest(accounts.owner.userId);

  return request(app)
    .post("/api/v1/property-services")
    .set("Authorization", `Bearer ${token}`)
    .send({
      organizationId,
      propertyId: propertyAId,
      serviceProviderId,
      serviceName: "Test Provider Maintenance",
      serviceCategory: "Maintenance",
      description: "Service used to test provider deactivation",
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
// UPDATE PROVIDER REQUEST BODY
// =====================================================

const updateProviderData = {
  companyName: "Updated PropertyIQ Test Provider",
  contactName: "Updated Test Contact",
  email: "updated@propertyiq.com",
  phone: "555-0199",
  website: "https://updated-example.com",
  address: "200 Updated Street",
  city: "Hamilton",
  province: "Ontario",
  postalCode: "L8P 2A2",
  country: "Canada",
  notes: "Updated by automated integration test",
};

// =====================================================
// SETUP AND CLEANUP
// =====================================================

beforeAll(async () => {
  // Create the main test provider as Owner.
  const ownerResponse = await createProvider(
    accounts.owner.userId,
    "PropertyIQ Test HVAC Provider"
  );

  expect(ownerResponse.status).toBe(201);

  ownerProviderId = getServiceProviderId(
    ownerResponse.body.data
  );

  createdProviderIds.push(ownerProviderId);

  // Create a provider-assigned Property Service.
  const propertyServiceResponse =
    await createPropertyService(ownerProviderId);

  expect(propertyServiceResponse.status).toBe(201);

  const propertyServiceId =
    propertyServiceResponse.body.service?.PropertyServiceId ??
    propertyServiceResponse.body.service?.propertyServiceId;

  if (!propertyServiceId) {
    throw new Error("Property Service ID was not returned.");
  }

  createdPropertyServiceIds.push(propertyServiceId);

  // Create a second provider as Administrator.
  const administratorResponse = await createProvider(
    accounts.administrator.userId,
    "PropertyIQ Administrator Test Provider"
  );

  expect(administratorResponse.status).toBe(201);

  administratorProviderId = getServiceProviderId(
    administratorResponse.body.data
  );

  createdProviderIds.push(administratorProviderId);
});

afterAll(async () => {
  const pool = await getDatabase();

  // Delete only Property Services created by this test.
  // This must happen before deleting their provider.
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

  // Delete only providers created by this test.
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
// SERVICE PROVIDERS AUTHORIZATION TESTS
// =====================================================

describe("PropertyIQ Service Providers authorization", () => {
  // ===================================================
  // OWNER ACCESS
  // ===================================================

  it("allows Owner to view service providers", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .get("/api/v1/service-providers")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const providerIds = response.body.data.map(
      (provider: any) =>
        getServiceProviderId(provider).toUpperCase()
    );

    expect(providerIds).toContain(ownerProviderId?.toUpperCase());
    expect(providerIds).toContain(
      administratorProviderId?.toUpperCase()
    );
  });

  // ===================================================
  // ADMINISTRATOR ACCESS
  // ===================================================

  it("allows Administrator to view service providers", async () => {
    const { token } = authenticatedRequest(
      accounts.administrator.userId
    );

    const response = await request(app)
      .get("/api/v1/service-providers")
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.data.length).toBeGreaterThanOrEqual(2);
  });

  // ===================================================
  // MEMBER ACCESS
  // ===================================================

  it("allows Member to view service providers", async () => {
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

  // ===================================================
  // VIEWER ACCESS
  // ===================================================

  it("allows Viewer to view service providers", async () => {
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
  // GET PROVIDER BY ID
  // ===================================================

  it("allows organization members to view an individual provider", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .get(`/api/v1/service-providers/${ownerProviderId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(
      getServiceProviderId(response.body.data).toUpperCase()
    ).toBe(ownerProviderId?.toUpperCase());
  });

  // ===================================================
  // OWNER CAN CREATE
  // ===================================================

  it("allows Owner to create a service provider", async () => {
    const response = await createProvider(
      accounts.owner.userId,
      "PropertyIQ Owner Creation Test"
    );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    expect(response.body.data.companyName).toBe(
      "PropertyIQ Owner Creation Test"
    );

    const providerId = getServiceProviderId(response.body.data);
    createdProviderIds.push(providerId);
  });

  // ===================================================
  // ADMINISTRATOR CAN CREATE
  // ===================================================

  it("allows Administrator to create a service provider", async () => {
    const response = await createProvider(
      accounts.administrator.userId,
      "PropertyIQ Admin Creation Test"
    );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    const providerId = getServiceProviderId(response.body.data);
    createdProviderIds.push(providerId);
  });

  // ===================================================
  // MEMBER CANNOT CREATE
  // ===================================================

  it("prevents Member from creating service providers", async () => {
    const response = await createProvider(
      accounts.member.userId,
      "Unauthorized Member Provider"
    );

    expect(response.status).toBe(403);
  });

  // ===================================================
  // VIEWER CANNOT CREATE
  // ===================================================

  it("prevents Viewer from creating service providers", async () => {
    const response = await createProvider(
      accounts.viewer.userId,
      "Unauthorized Viewer Provider"
    );

    expect(response.status).toBe(403);
  });

  // ===================================================
  // OWNER CAN UPDATE
  // ===================================================

  it("allows Owner to update service provider details", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .put(`/api/v1/service-providers/${ownerProviderId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send(updateProviderData);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.data.companyName).toBe(
      updateProviderData.companyName
    );
  });

  // ===================================================
  // ADMINISTRATOR CAN UPDATE
  // ===================================================

  it("allows Administrator to update service provider details", async () => {
    const { token } = authenticatedRequest(
      accounts.administrator.userId
    );

    const response = await request(app)
      .put(`/api/v1/service-providers/${administratorProviderId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send(updateProviderData);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  // ===================================================
  // MEMBER CANNOT UPDATE
  // ===================================================

  it("prevents Member from updating service providers", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .put(`/api/v1/service-providers/${ownerProviderId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send(updateProviderData);

    expect(response.status).toBe(403);
  });

  // ===================================================
  // VIEWER CANNOT UPDATE
  // ===================================================

  it("prevents Viewer from updating service providers", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .put(`/api/v1/service-providers/${ownerProviderId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send(updateProviderData);

    expect(response.status).toBe(403);
  });

  // ===================================================
  // OWNER CAN DEACTIVATE PROVIDER
  // ===================================================

  it("allows Owner to deactivate a service provider", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .patch(`/api/v1/service-providers/${ownerProviderId}/status`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "inactive" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("inactive");
  });

  // ===================================================
  // OWNER CAN REACTIVATE PROVIDER
  // ===================================================

  it("allows Owner to reactivate a service provider", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .patch(`/api/v1/service-providers/${ownerProviderId}/status`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "active" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("active");
  });

  // ===================================================
  // MEMBER CANNOT CHANGE STATUS
  // ===================================================

  it("prevents Member from changing provider status", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .patch(`/api/v1/service-providers/${ownerProviderId}/status`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "inactive" });

    expect(response.status).toBe(403);
  });

  // ===================================================
  // VIEWER CANNOT CHANGE STATUS
  // ===================================================

  it("prevents Viewer from changing provider status", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .patch(`/api/v1/service-providers/${ownerProviderId}/status`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "inactive" });

    expect(response.status).toBe(403);
  });

  // ===================================================
  // INVALID STATUS
  // ===================================================

  it("rejects an invalid provider status", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .patch(`/api/v1/service-providers/${ownerProviderId}/status`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "deleted" });

    expect(response.status).toBe(400);
  });

  // ===================================================
  // DEACTIVATION PRESERVES PROPERTY SERVICE ASSIGNMENT
  // ===================================================

  it("preserves existing Property Services assignments when a provider is deactivated", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const deactivateResponse = await request(app)
      .patch(`/api/v1/service-providers/${ownerProviderId}/status`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "inactive" });

    expect(deactivateResponse.status).toBe(200);

    const pool = await getDatabase();

    const result = await pool
      .request()
      .input(
        "PropertyServiceId",
        sql.UniqueIdentifier,
        createdPropertyServiceIds[0]
      )
      .input(
        "ServiceProviderId",
        sql.UniqueIdentifier,
        ownerProviderId
      )
      .query(`
        SELECT
          ps.PropertyServiceId,
          ps.ServiceProviderId,
          ps.Status AS propertyServiceStatus,
          sp.Status AS providerStatus

        FROM dbo.PropertyServices ps

        INNER JOIN dbo.ServiceProviders sp
          ON sp.ServiceProviderId = ps.ServiceProviderId
         AND sp.OrganizationId = ps.OrganizationId

        WHERE ps.PropertyServiceId = @PropertyServiceId
          AND ps.ServiceProviderId = @ServiceProviderId;
      `);

    expect(result.recordset).toHaveLength(1);

    expect(
      result.recordset[0].ServiceProviderId.toUpperCase()
    ).toBe(ownerProviderId?.toUpperCase());

    expect(result.recordset[0].providerStatus).toBe("inactive");
    expect(result.recordset[0].propertyServiceStatus).toBe("active");
  });
});
