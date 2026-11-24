
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

const createdContractIds: string[] = [];

let propertyServiceId: string | null = null;

const baseContractBody = {
  organizationId,
  propertyId: propertyAId,
  propertyServiceId: null as string | null,

  contractName: `Test HVAC Contract ${uniqueSuffix}`,
  contractNumber: `CONTRACT-${uniqueSuffix}`,

  description: "Provider contract integration test.",

  contractValue: 12500.50,
  currencyCode: "CAD",

  startDate: "2026-01-01",
  endDate: "2027-12-31",
  renewalDate: "2027-01-01",

  autoRenew: true,
  noticePeriodDays: 60,

  status: "draft",

  notes: "Created by automated integration tests.",
};

const updateContractBody = {
  propertyId: propertyAId,
  propertyServiceId: null as string | null,

  contractName: `Updated HVAC Contract ${uniqueSuffix}`,
  contractNumber: `UPDATED-${uniqueSuffix}`,

  description: "Updated provider contract integration test.",

  contractValue: 15000,
  currencyCode: "CAD",

  startDate: "2026-02-01",
  endDate: "2028-12-31",
  renewalDate: "2028-01-01",

  autoRenew: false,
  noticePeriodDays: 90,

  notes: "Updated automated integration test.",
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
// ROUTE HELPERS
// =====================================================

function providerContractsPath() {
  return `/api/v1/service-provider-contracts/provider/${serviceProviderId}`;
}

function contractPath(contractId: string) {
  return `/api/v1/service-provider-contracts/${contractId}`;
}

async function createContract(
  userId = accounts.owner.userId,
  overrides: Record<string, unknown> = {}
) {
  const { token } = authenticatedRequest(userId);

  const response = await request(app)
    .post(providerContractsPath())
    .set("Authorization", `Bearer ${token}`)
    .send({
      ...baseContractBody,
      propertyServiceId,
      ...overrides,
    });

  if (response.status === 201) {
    const contractId =
      response.body.contract?.contractId;

    if (contractId) {
      createdContractIds.push(contractId);
    }
  }

  return response;
}

async function createPropertyService(
  token: string
) {
  const response = await request(app)
    .post("/api/v1/property-services")
    .set("Authorization", `Bearer ${token}`)
    .send({
      organizationId,
      propertyId: propertyAId,

      serviceProviderId,
      assignedMembershipId: null,

      serviceName: `Contract Test HVAC Service ${uniqueSuffix}`,
      serviceCategory: "HVAC",

      description: "Service for contract integration tests.",

      serviceFrequency: "Monthly",

      contractReference: `SERVICE-${uniqueSuffix}`,

      contractStartDate: "2026-01-01",
      contractEndDate: "2027-12-31",

      nextServiceDate: "2026-12-15T10:00:00Z",

      notes: "Created for provider contract tests.",

      status: "active",
    });

  return response;
}

// =====================================================
// DATABASE FIXTURE
// =====================================================

beforeAll(async () => {
  const pool = await getDatabase();

  await pool
    .request()
    .input(
      "serviceProviderId",
      sql.UniqueIdentifier,
      serviceProviderId
    )
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      organizationId
    )
    .input(
      "companyName",
      sql.NVarChar(200),
      `Contract Test Provider ${uniqueSuffix}`
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
        @serviceProviderId,
        @organizationId,
        @companyName,
        'active',
        SYSUTCDATETIME()
      );
    `);

  const { token } = authenticatedRequest(
    accounts.owner.userId
  );

  const serviceResponse = await createPropertyService(token);

  expect(serviceResponse.status).toBe(201);

  expect(
    serviceResponse.body.service.PropertyServiceId
  ).toBeDefined();

  propertyServiceId =
    serviceResponse.body.service.PropertyServiceId;
});

// =====================================================
// CLEANUP
// =====================================================

afterAll(async () => {
  const pool = await getDatabase();

  // Delete contracts before their referenced property service.

  await pool
    .request()
    .input(
      "serviceProviderId",
      sql.UniqueIdentifier,
      serviceProviderId
    )
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      organizationId
    )
    .query(`
      DELETE FROM dbo.ServiceProviderContracts
      WHERE ServiceProviderId = @serviceProviderId
        AND OrganizationId = @organizationId;
    `);

  if (propertyServiceId) {
    await pool
      .request()
      .input(
        "propertyServiceId",
        sql.UniqueIdentifier,
        propertyServiceId
      )
      .input(
        "organizationId",
        sql.UniqueIdentifier,
        organizationId
      )
      .query(`
        DELETE FROM dbo.PropertyServices
        WHERE PropertyServiceId = @propertyServiceId
          AND OrganizationId = @organizationId;
      `);
  }

  await pool
    .request()
    .input(
      "serviceProviderId",
      sql.UniqueIdentifier,
      serviceProviderId
    )
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      organizationId
    )
    .query(`
      DELETE FROM dbo.ServiceProviders
      WHERE ServiceProviderId = @serviceProviderId
        AND OrganizationId = @organizationId;
    `);
});

// =====================================================
// SERVICE PROVIDER CONTRACT TESTS
// =====================================================

describe("PropertyIQ service provider contracts integration", () => {
  // ===================================================
  // AUTHENTICATION
  // ===================================================

  it("rejects unauthenticated requests", async () => {
    const response = await request(app)
      .get(providerContractsPath())
      .query({ organizationId });

    expect(response.status).toBe(401);
  });

  // ===================================================
  // READ ACCESS
  // ===================================================

  it("allows the Owner to list provider contracts", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .get(providerContractsPath())
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it("allows the Administrator to list provider contracts", async () => {
    const { token } = authenticatedRequest(
      accounts.administrator.userId
    );

    const response = await request(app)
      .get(providerContractsPath())
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it("allows a Member to list provider contracts", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .get(providerContractsPath())
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it("allows a Viewer to list provider contracts", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .get(providerContractsPath())
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  // ===================================================
  // CREATE PERMISSIONS
  // ===================================================

  it("allows the Owner to create a provider contract", async () => {
    const response = await createContract(
      accounts.owner.userId,
      {
        contractName: `Owner Contract ${uniqueSuffix}`,
      }
    );

    expect(response.status).toBe(201);
    expect(response.body.contract).toBeDefined();

    expect(
      response.body.contract.contractId
    ).toBeDefined();

    expect(
      response.body.contract.contractName
    ).toBe(`Owner Contract ${uniqueSuffix}`);

    expect(
      response.body.contract.status
    ).toBe("draft");
  });

  it("allows an Administrator to create a provider contract", async () => {
    const response = await createContract(
      accounts.administrator.userId,
      {
        contractName: `Administrator Contract ${uniqueSuffix}`,
      }
    );

    expect(response.status).toBe(201);
    expect(response.body.contract).toBeDefined();
  });

  it("prevents a Member from creating provider contracts", async () => {
    const response = await createContract(
      accounts.member.userId
    );

    expect(response.status).toBe(403);
  });

  it("prevents a Viewer from creating provider contracts", async () => {
    const response = await createContract(
      accounts.viewer.userId
    );

    expect(response.status).toBe(403);
  });

  // ===================================================
  // VALIDATION
  // ===================================================

  it("rejects contract creation without a contract name", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .post(providerContractsPath())
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...baseContractBody,
        propertyServiceId,
        contractName: "",
      });

    expect(response.status).toBe(400);
  });

  it("rejects an invalid contract date", async () => {
    const response = await createContract(
      accounts.owner.userId,
      {
        startDate: "2026-02-30",
      }
    );

    expect(response.status).toBe(400);
  });

  it("rejects an end date before the start date", async () => {
    const response = await createContract(
      accounts.owner.userId,
      {
        startDate: "2026-12-31",
        endDate: "2026-01-01",
      }
    );

    expect(response.status).toBe(400);
  });

  it("rejects a renewal date before the start date", async () => {
    const response = await createContract(
      accounts.owner.userId,
      {
        startDate: "2026-06-01",
        renewalDate: "2026-01-01",
      }
    );

    expect(response.status).toBe(400);
  });

  it("rejects a renewal date after the contract end date", async () => {
    const response = await createContract(
      accounts.owner.userId,
      {
        startDate: "2026-01-01",
        endDate: "2026-06-01",
        renewalDate: "2026-12-01",
      }
    );

    expect(response.status).toBe(400);
  });

  it("rejects a negative contract value", async () => {
    const response = await createContract(
      accounts.owner.userId,
      {
        contractValue: -100,
      }
    );

    expect(response.status).toBe(400);
  });

  it("rejects an invalid currency code", async () => {
    const response = await createContract(
      accounts.owner.userId,
      {
        currencyCode: "US",
      }
    );

    expect(response.status).toBe(400);
  });

  it("normalizes currency codes to uppercase", async () => {
    const response = await createContract(
      accounts.owner.userId,
      {
        currencyCode: "cad",
      }
    );

    expect(response.status).toBe(201);
    expect(response.body.contract.currencyCode).toBe("CAD");
  });

  it("rejects an invalid contract status", async () => {
    const response = await createContract(
      accounts.owner.userId,
      {
        status: "suspended",
      }
    );

    expect(response.status).toBe(400);
  });

  it("rejects an invalid provider ID in the route", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .post(
        "/api/v1/service-provider-contracts/provider/invalid-provider-id"
      )
      .set("Authorization", `Bearer ${token}`)
      .send(baseContractBody);

    expect(response.status).toBe(400);
  });

  // ===================================================
  // PROPERTY AND SERVICE RELATIONSHIPS
  // ===================================================

  it("creates a contract linked to a provider and property service", async () => {
    const response = await createContract(
      accounts.owner.userId,
      {
        propertyId: propertyAId,
        propertyServiceId,
      }
    );

    expect(response.status).toBe(201);

    expect(
      response.body.contract.propertyId.toUpperCase()
    ).toBe(propertyAId.toUpperCase());

    expect(
      response.body.contract.propertyServiceId.toUpperCase()
    ).toBe(propertyServiceId?.toUpperCase());
  });

  it("rejects a property service linked to a different property", async () => {
    const response = await createContract(
      accounts.owner.userId,
      {
        propertyId: propertyBId,
        propertyServiceId,
      }
    );

    expect(response.status).toBe(403);
  });

  it("rejects a nonexistent property", async () => {
    const response = await createContract(
      accounts.owner.userId,
      {
        propertyId: "A1000001-0000-4000-8000-000000000002",
        propertyServiceId: null,
      }
    );

    expect(response.status).toBe(403);
  });

  it("rejects a nonexistent property service", async () => {
    const response = await createContract(
      accounts.owner.userId,
      {
        propertyId: propertyAId,
        propertyServiceId:
          "A1000001-0000-4000-8000-000000000002",
      }
    );

    expect(response.status).toBe(403);
  });

  // ===================================================
  // RETRIEVE CONTRACT
  // ===================================================

  it("creates and retrieves a provider contract by ID", async () => {
    const createResponse = await createContract(
      accounts.owner.userId,
      {
        contractName: `Retrieval Contract ${uniqueSuffix}`,
      }
    );

    expect(createResponse.status).toBe(201);

    const contractId =
      createResponse.body.contract.contractId;

    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const getResponse = await request(app)
      .get(contractPath(contractId))
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(getResponse.status).toBe(200);

    expect(
      getResponse.body.contractId.toUpperCase()
    ).toBe(contractId.toUpperCase());

    expect(getResponse.body.contractName).toBe(
      `Retrieval Contract ${uniqueSuffix}`
    );
  });

  it("returns 404 for a nonexistent contract", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .get(
        contractPath("A1000001-0000-4000-8000-000000000002")
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  it("rejects an invalid contract ID", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .get(contractPath("invalid-contract-id"))
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(400);
  });

  // ===================================================
  // UPDATE CONTRACT
  // ===================================================

  it("allows the Owner to update contract details", async () => {
    const createResponse = await createContract(
      accounts.owner.userId
    );

    expect(createResponse.status).toBe(201);

    const contractId =
      createResponse.body.contract.contractId;

    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .put(contractPath(contractId))
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...updateContractBody,
        propertyServiceId,
      });

    expect(response.status).toBe(200);

    expect(response.body.contract.contractName).toBe(
      `Updated HVAC Contract ${uniqueSuffix}`
    );

    expect(response.body.contract.contractValue).toBe(15000);
  });

  it("allows an Administrator to update contract details", async () => {
    const createResponse = await createContract(
      accounts.owner.userId
    );

    expect(createResponse.status).toBe(201);

    const contractId =
      createResponse.body.contract.contractId;

    const { token } = authenticatedRequest(
      accounts.administrator.userId
    );

    const response = await request(app)
      .put(contractPath(contractId))
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...updateContractBody,
        propertyServiceId,
      });

    expect(response.status).toBe(200);
  });

  it("prevents a Member from updating contract details", async () => {
    const createResponse = await createContract(
      accounts.owner.userId
    );

    expect(createResponse.status).toBe(201);

    const contractId =
      createResponse.body.contract.contractId;

    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .put(contractPath(contractId))
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...updateContractBody,
        propertyServiceId,
      });

    expect(response.status).toBe(404);
  });

  it("prevents a Viewer from updating contract details", async () => {
    const createResponse = await createContract(
      accounts.owner.userId
    );

    expect(createResponse.status).toBe(201);

    const contractId =
      createResponse.body.contract.contractId;

    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .put(contractPath(contractId))
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...updateContractBody,
        propertyServiceId,
      });

    expect(response.status).toBe(404);
  });

  // ===================================================
  // CONTRACT STATUS
  // ===================================================

  it("updates a contract through its status lifecycle", async () => {
    const createResponse = await createContract(
      accounts.owner.userId
    );

    expect(createResponse.status).toBe(201);

    const contractId =
      createResponse.body.contract.contractId;

    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const statuses = [
      "active",
      "expired",
      "terminated",
    ];

    for (const status of statuses) {
      const response = await request(app)
        .patch(`${contractPath(contractId)}/status`)
        .query({ organizationId })
        .set("Authorization", `Bearer ${token}`)
        .send({ status });

      expect(response.status).toBe(200);
      expect(response.body.contract.status).toBe(status);
    }
  });

  it("rejects an unsupported contract status", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .patch(
        `${contractPath("A1000001-0000-4000-8000-000000000002")}/status`
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "suspended" });

    expect(response.status).toBe(400);
  });

  it("prevents a Member from changing contract status", async () => {
    const createResponse = await createContract(
      accounts.owner.userId
    );

    expect(createResponse.status).toBe(201);

    const contractId =
      createResponse.body.contract.contractId;

    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .patch(`${contractPath(contractId)}/status`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "active" });

    expect(response.status).toBe(404);
  });

  it("prevents a Viewer from changing contract status", async () => {
    const createResponse = await createContract(
      accounts.owner.userId
    );

    expect(createResponse.status).toBe(201);

    const contractId =
      createResponse.body.contract.contractId;

    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .patch(`${contractPath(contractId)}/status`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "active" });

    expect(response.status).toBe(404);
  });

  // ===================================================
  // ORGANIZATION ISOLATION
  // ===================================================

  it("does not expose provider contracts through another organization", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .get(providerContractsPath())
      .query({
        organizationId: otherOrganizationId,
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("does not expose a contract through another organization", async () => {
    const createResponse = await createContract(
      accounts.owner.userId
    );

    expect(createResponse.status).toBe(201);

    const contractId =
      createResponse.body.contract.contractId;

    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .get(contractPath(contractId))
      .query({
        organizationId: otherOrganizationId,
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});
