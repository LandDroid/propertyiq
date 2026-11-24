
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

const providerBody = {
  organizationId,
  companyName: `Contact Test Provider ${uniqueSuffix}`,
  contactName: "Original Provider Contact",
  email: `provider-${uniqueSuffix}@example.com`,
  phone: "555-0100",
  website: "https://example.com",
  address: "100 Test Street",
  city: "Hamilton",
  province: "Ontario",
  postalCode: "L8P 1A1",
  country: "Canada",
  notes: "Provider for contact integration tests.",
};

const createContactBody = {
  organizationId,
  contactName: "Test Contact",
  jobTitle: "Service Manager",
  email: "contact-test@example.com",
  phone: "555-0200",
  isPrimary: false,
  notes: "Created by automated integration tests.",
};

const updateContactBody = {
  contactName: "Updated Test Contact",
  jobTitle: "Operations Manager",
  email: "updated-contact@example.com",
  phone: "555-0300",
  isPrimary: false,
  notes: "Updated by automated integration tests.",
};

// =====================================================
// CREATED RECORD TRACKING
// =====================================================

let serviceProviderId: string | null = null;

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

function providerContactsPath() {
  if (!serviceProviderId) {
    throw new Error("Test service provider has not been created");
  }

  return `/api/v1/service-provider-contacts/provider/${serviceProviderId}`;
}

function contactPath(contactId: string) {
  return `/api/v1/service-provider-contacts/${contactId}`;
}

async function createContact(
  userId = accounts.owner.userId,
  overrides: Record<string, unknown> = {}
) {
  const { token } = authenticatedRequest(userId);

  const response = await request(app)
    .post(providerContactsPath())
    .set("Authorization", `Bearer ${token}`)
    .send({
      ...createContactBody,
      ...overrides,
    });

  return response;
}

// =====================================================
// SETUP
// =====================================================

beforeAll(async () => {
  const { token } = authenticatedRequest(
    accounts.owner.userId
  );

  const response = await request(app)
    .post("/api/v1/service-providers")
    .set("Authorization", `Bearer ${token}`)
    .send(providerBody);

  expect(response.status).toBe(201);
  expect(response.body.data.serviceProviderId).toBeDefined();

  serviceProviderId =
    response.body.data.serviceProviderId;
});

// =====================================================
// CLEANUP
// =====================================================

afterAll(async () => {
  if (!serviceProviderId) {
    return;
  }

  const pool = await getDatabase();

  // Delete contacts before deleting their provider.

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
      DELETE FROM dbo.ServiceProviderContacts
      WHERE ServiceProviderId = @serviceProviderId
        AND OrganizationId = @organizationId;
    `);

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
// SERVICE PROVIDER CONTACT TESTS
// =====================================================

describe("PropertyIQ service provider contacts integration", () => {
  // ===================================================
  // AUTHENTICATION
  // ===================================================

  it("rejects unauthenticated requests", async () => {
    const response = await request(app)
      .get(providerContactsPath())
      .query({ organizationId });

    expect(response.status).toBe(401);
  });

  // ===================================================
  // READ ACCESS
  // ===================================================

  it("allows the Owner to list provider contacts", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .get(providerContactsPath())
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it("allows the Administrator to list provider contacts", async () => {
    const { token } = authenticatedRequest(
      accounts.administrator.userId
    );

    const response = await request(app)
      .get(providerContactsPath())
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it("allows a Member to list provider contacts", async () => {
    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .get(providerContactsPath())
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it("allows a Viewer to list provider contacts", async () => {
    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .get(providerContactsPath())
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  // ===================================================
  // CREATE PERMISSIONS
  // ===================================================

  it("allows the Owner to create a provider contact", async () => {
    const response = await createContact(
      accounts.owner.userId,
      {
        contactName: `Owner Contact ${uniqueSuffix}`,
      }
    );

    expect(response.status).toBe(201);
    expect(response.body.contact).toBeDefined();
    expect(response.body.contact.providerContactId).toBeDefined();
    expect(response.body.contact.contactName).toBe(
      `Owner Contact ${uniqueSuffix}`
    );
  });

  it("allows an Administrator to create a provider contact", async () => {
    const response = await createContact(
      accounts.administrator.userId,
      {
        contactName: `Administrator Contact ${uniqueSuffix}`,
      }
    );

    expect(response.status).toBe(201);
    expect(response.body.contact).toBeDefined();
  });

  it("prevents a Member from creating provider contacts", async () => {
    const response = await createContact(
      accounts.member.userId
    );

    expect(response.status).toBe(403);
  });

  it("prevents a Viewer from creating provider contacts", async () => {
    const response = await createContact(
      accounts.viewer.userId
    );

    expect(response.status).toBe(403);
  });

  // ===================================================
  // VALIDATION
  // ===================================================

  it("rejects contact creation without a contact name", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .post(providerContactsPath())
      .set("Authorization", `Bearer ${token}`)
      .send({
        organizationId,
        email: "missing-name@example.com",
      });

    expect(response.status).toBe(400);
  });

  it("rejects an invalid contact email", async () => {
    const response = await createContact(
      accounts.owner.userId,
      {
        email: "not-an-email",
      }
    );

    expect(response.status).toBe(400);
  });

  it("rejects an invalid organization ID", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .post(providerContactsPath())
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...createContactBody,
        organizationId: "invalid-organization-id",
      });

    expect(response.status).toBe(400);
  });

  // ===================================================
  // RETRIEVE CONTACT
  // ===================================================

  it("creates and retrieves a provider contact by ID", async () => {
    const createResponse = await createContact(
      accounts.owner.userId,
      {
        contactName: `Retrieval Contact ${uniqueSuffix}`,
      }
    );

    expect(createResponse.status).toBe(201);

    const contactId =
      createResponse.body.contact.providerContactId;

    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const getResponse = await request(app)
      .get(contactPath(contactId))
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(getResponse.status).toBe(200);
    expect(
      getResponse.body.providerContactId.toUpperCase()
    ).toBe(contactId.toUpperCase());
  });

  it("returns 404 for a nonexistent contact", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .get(
        contactPath("A1000001-0000-4000-8000-000000000002")
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  it("rejects an invalid contact ID", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .get(contactPath("invalid-contact-id"))
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(400);
  });

  // ===================================================
  // UPDATE CONTACT
  // ===================================================

  it("allows the Owner to update a provider contact", async () => {
    const createResponse = await createContact(
      accounts.owner.userId,
      {
        contactName: `Update Contact ${uniqueSuffix}`,
      }
    );

    expect(createResponse.status).toBe(201);

    const contactId =
      createResponse.body.contact.providerContactId;

    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .put(contactPath(contactId))
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...updateContactBody,
        contactName: `Updated Contact ${uniqueSuffix}`,
      });

    expect(response.status).toBe(200);
    expect(response.body.contact.contactName).toBe(
      `Updated Contact ${uniqueSuffix}`
    );
  });

  it("allows an Administrator to update a provider contact", async () => {
    const createResponse = await createContact(
      accounts.owner.userId,
      {
        contactName: `Admin Update Contact ${uniqueSuffix}`,
      }
    );

    expect(createResponse.status).toBe(201);

    const contactId =
      createResponse.body.contact.providerContactId;

    const { token } = authenticatedRequest(
      accounts.administrator.userId
    );

    const response = await request(app)
      .put(contactPath(contactId))
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...updateContactBody,
        contactName: `Admin Updated Contact ${uniqueSuffix}`,
      });

    expect(response.status).toBe(200);
  });

  // ===================================================
  // PRIMARY CONTACT
  // ===================================================

  it("allows only one active primary contact per provider", async () => {
    const firstResponse = await createContact(
      accounts.owner.userId,
      {
        contactName: `First Primary ${uniqueSuffix}`,
        isPrimary: true,
      }
    );

    expect(firstResponse.status).toBe(201);
    expect(firstResponse.body.contact.isPrimary).toBe(true);

    const firstContactId =
      firstResponse.body.contact.providerContactId;

    const secondResponse = await createContact(
      accounts.owner.userId,
      {
        contactName: `Second Primary ${uniqueSuffix}`,
        isPrimary: true,
      }
    );

    expect(secondResponse.status).toBe(201);
    expect(secondResponse.body.contact.isPrimary).toBe(true);

    const secondContactId =
      secondResponse.body.contact.providerContactId;

    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const firstGet = await request(app)
      .get(contactPath(firstContactId))
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    const secondGet = await request(app)
      .get(contactPath(secondContactId))
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(firstGet.status).toBe(200);
    expect(secondGet.status).toBe(200);

    expect(firstGet.body.isPrimary).toBe(false);
    expect(secondGet.body.isPrimary).toBe(true);
  });

  it("replaces the primary contact when another contact is promoted", async () => {
    const firstResponse = await createContact(
      accounts.owner.userId,
      {
        contactName: `Original Primary ${uniqueSuffix}`,
        isPrimary: true,
      }
    );

    expect(firstResponse.status).toBe(201);

    const firstContactId =
      firstResponse.body.contact.providerContactId;

    const secondResponse = await createContact(
      accounts.owner.userId,
      {
        contactName: `New Primary ${uniqueSuffix}`,
        isPrimary: false,
      }
    );

    expect(secondResponse.status).toBe(201);

    const secondContactId =
      secondResponse.body.contact.providerContactId;

    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const updateResponse = await request(app)
      .put(contactPath(secondContactId))
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...updateContactBody,
        contactName: `New Primary ${uniqueSuffix}`,
        isPrimary: true,
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.contact.isPrimary).toBe(true);

    const firstGet = await request(app)
      .get(contactPath(firstContactId))
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(firstGet.status).toBe(200);
    expect(firstGet.body.isPrimary).toBe(false);
  });

  // ===================================================
  // CONTACT STATUS
  // ===================================================

  it("deactivates and reactivates a provider contact", async () => {
    const createResponse = await createContact(
      accounts.owner.userId,
      {
        contactName: `Status Contact ${uniqueSuffix}`,
        isPrimary: true,
      }
    );

    expect(createResponse.status).toBe(201);

    const contactId =
      createResponse.body.contact.providerContactId;

    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    // DEACTIVATE

    const deactivateResponse = await request(app)
      .patch(`${contactPath(contactId)}/status`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ isActive: false });

    expect(deactivateResponse.status).toBe(200);
    expect(deactivateResponse.body.contact.isActive).toBe(false);
    expect(deactivateResponse.body.contact.isPrimary).toBe(false);

    // VERIFY INACTIVE CONTACT REMAINS RETRIEVABLE

    const inactiveGet = await request(app)
      .get(contactPath(contactId))
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`);

    expect(inactiveGet.status).toBe(200);
    expect(inactiveGet.body.isActive).toBe(false);

    // REACTIVATE

    const reactivateResponse = await request(app)
      .patch(`${contactPath(contactId)}/status`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ isActive: true });

    expect(reactivateResponse.status).toBe(200);
    expect(reactivateResponse.body.contact.isActive).toBe(true);

    // Reactivation must not automatically restore primary status.

    expect(reactivateResponse.body.contact.isPrimary).toBe(false);
  });

  it("rejects an invalid contact status value", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .patch(
        `${contactPath("A1000001-0000-4000-8000-000000000002")}/status`
      )
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ isActive: "yes" });

    expect(response.status).toBe(400);
  });

  // ===================================================
  // STATUS PERMISSIONS
  // ===================================================

  it("prevents a Member from changing contact status", async () => {
    const createResponse = await createContact(
      accounts.owner.userId
    );

    expect(createResponse.status).toBe(201);

    const contactId =
      createResponse.body.contact.providerContactId;

    const { token } = authenticatedRequest(
      accounts.member.userId
    );

    const response = await request(app)
      .patch(`${contactPath(contactId)}/status`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ isActive: false });

    // The repository rejects the write and the controller
    // currently maps a null result to 404.
    expect(response.status).toBe(404);
  });

  it("prevents a Viewer from changing contact status", async () => {
    const createResponse = await createContact(
      accounts.owner.userId
    );

    expect(createResponse.status).toBe(201);

    const contactId =
      createResponse.body.contact.providerContactId;

    const { token } = authenticatedRequest(
      accounts.viewer.userId
    );

    const response = await request(app)
      .patch(`${contactPath(contactId)}/status`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${token}`)
      .send({ isActive: false });

    expect(response.status).toBe(404);
  });

  // ===================================================
  // ORGANIZATION ISOLATION
  // ===================================================

  it("does not expose provider contacts through another organization", async () => {
    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .get(providerContactsPath())
      .query({
        organizationId: otherOrganizationId,
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("does not expose a contact through another organization", async () => {
    const createResponse = await createContact(
      accounts.owner.userId
    );

    expect(createResponse.status).toBe(201);

    const contactId =
      createResponse.body.contact.providerContactId;

    const { token } = authenticatedRequest(
      accounts.owner.userId
    );

    const response = await request(app)
      .get(contactPath(contactId))
      .query({
        organizationId: otherOrganizationId,
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});
