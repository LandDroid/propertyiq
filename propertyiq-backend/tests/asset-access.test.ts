
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
} from "vitest";

import request from "supertest";
import jwt from "jsonwebtoken";

import app from "../src/app";
import { authConfig } from "../src/config/auth";

// =====================================================
// TEST ORGANIZATION AND PROPERTIES
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
    role: "Owner",
  },
  administrator: {
    userId: "62026EEE-8D8E-477A-A33E-A057D8F505F0",
    role: "Administrator",
  },
  member: {
    userId: "53A8EC9B-EE87-4577-A59B-985CA1B252E8",
    role: "Member",
  },
  viewer: {
    userId: "3E2BF33C-A551-4371-974A-B31F4DF838A1",
    role: "Viewer",
  },
};

// =====================================================
// AUTHENTICATION HELPERS
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
  const token = createAccessToken(userId);

  return {
    get: (url: string) =>
      request(app)
        .get(url)
        .query({ organizationId })
        .set("Authorization", `Bearer ${token}`),

    post: (url: string) =>
      request(app)
        .post(url)
        .set("Authorization", `Bearer ${token}`),

    put: (url: string) =>
      request(app)
        .put(url)
        .query({ organizationId })
        .set("Authorization", `Bearer ${token}`),

    delete: (url: string) =>
      request(app)
        .delete(url)
        .query({ organizationId })
        .set("Authorization", `Bearer ${token}`),
  };
}

// =====================================================
// TEST ASSET HELPERS
// =====================================================

const createdAssetIds: string[] = [];

async function createTestAsset(
  userId: string,
  propertyId: string,
  assetName: string
): Promise<string> {
  const response = await authenticatedRequest(userId)
    .post("/api/v1/assets")
    .send({
      organizationId,
      propertyId,
      assetName,
      category: "Other",
      manufacturer: "PropertyIQ Test",
      model: "Security Test Model",
      status: "active",
    });

  expect(response.status).toBe(201);
  expect(response.body.success).toBe(true);
  expect(response.body.data.assetId).toBeDefined();

  const assetId = response.body.data.assetId;

  createdAssetIds.push(assetId);

  return assetId;
}

// =====================================================
// TEST FIXTURES
// =====================================================

let propertyAAssetId: string;
let propertyBAssetId: string;

beforeAll(async () => {
  propertyAAssetId = await createTestAsset(
    accounts.owner.userId,
    propertyAId,
    "TEMP SECURITY TEST ASSET A"
  );

  propertyBAssetId = await createTestAsset(
    accounts.owner.userId,
    propertyBId,
    "TEMP SECURITY TEST ASSET B"
  );
});

afterAll(async () => {
  // Remove all assets created by this test suite.
  for (const assetId of createdAssetIds) {
    try {
      await authenticatedRequest(accounts.owner.userId)
        .delete(`/api/v1/assets/${assetId}`);
    } catch (error) {
      console.error(
        `Could not clean up test asset ${assetId}:`,
        error
      );
    }
  }
});

// =====================================================
// PROPERTYIQ ASSET VISIBILITY
// =====================================================

describe("PropertyIQ asset visibility", () => {
  it("allows the Owner to view assets across the organization", async () => {
    const response = await authenticatedRequest(
      accounts.owner.userId
    ).get("/api/v1/assets");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const assetIds = response.body.data.map(
      (asset: { assetId: string }) =>
        asset.assetId.toUpperCase()
    );

    expect(assetIds).toContain(propertyAAssetId.toUpperCase());
    expect(assetIds).toContain(propertyBAssetId.toUpperCase());
  });

  it("allows the Administrator to view assets across the organization", async () => {
    const response = await authenticatedRequest(
      accounts.administrator.userId
    ).get("/api/v1/assets");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const assetIds = response.body.data.map(
      (asset: { assetId: string }) =>
        asset.assetId.toUpperCase()
    );

    expect(assetIds).toContain(propertyAAssetId.toUpperCase());
    expect(assetIds).toContain(propertyBAssetId.toUpperCase());
  });

  it("limits the Member to assets on assigned Property A", async () => {
    const response = await authenticatedRequest(
      accounts.member.userId
    ).get("/api/v1/assets");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const assetIds = response.body.data.map(
      (asset: { assetId: string }) =>
        asset.assetId.toUpperCase()
    );

    expect(assetIds).toContain(propertyAAssetId.toUpperCase());
    expect(assetIds).not.toContain(propertyBAssetId.toUpperCase());
  });

  it("limits the Viewer to assets on assigned Property A", async () => {
    const response = await authenticatedRequest(
      accounts.viewer.userId
    ).get("/api/v1/assets");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const assetIds = response.body.data.map(
      (asset: { assetId: string }) =>
        asset.assetId.toUpperCase()
    );

    expect(assetIds).toContain(propertyAAssetId.toUpperCase());
    expect(assetIds).not.toContain(propertyBAssetId.toUpperCase());
  });

  it("prevents the Member from viewing an asset on Property B", async () => {
    const response = await authenticatedRequest(
      accounts.member.userId
    ).get(`/api/v1/assets/${propertyBAssetId}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });

  it("prevents the Viewer from viewing an asset on Property B", async () => {
    const response = await authenticatedRequest(
      accounts.viewer.userId
    ).get(`/api/v1/assets/${propertyBAssetId}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});

// =====================================================
// PROPERTYIQ ASSET WRITE RESTRICTIONS
// =====================================================

describe("PropertyIQ asset write restrictions", () => {
  it.each([
    ["Member", accounts.member.userId],
    ["Viewer", accounts.viewer.userId],
  ])("%s cannot create assets", async (_role, userId) => {
    const response = await authenticatedRequest(userId)
      .post("/api/v1/assets")
      .send({
        organizationId,
        propertyId: propertyAId,
        assetName: "UNAUTHORIZED TEST ASSET",
        category: "Other",
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it.each([
    ["Member", accounts.member.userId],
    ["Viewer", accounts.viewer.userId],
  ])("%s cannot update assets", async (_role, userId) => {
    const response = await authenticatedRequest(userId)
      .put(`/api/v1/assets/${propertyAAssetId}`)
      .send({
        assetName: "UNAUTHORIZED UPDATED ASSET",
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it.each([
    ["Member", accounts.member.userId],
    ["Viewer", accounts.viewer.userId],
  ])("%s cannot delete assets", async (_role, userId) => {
    const response = await authenticatedRequest(userId)
      .delete(`/api/v1/assets/${propertyAAssetId}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });
});

// =====================================================
// PRIVILEGED ASSET MANAGEMENT
// =====================================================

describe("PropertyIQ privileged asset management", () => {
  it.each([
    ["Owner", accounts.owner.userId],
    ["Administrator", accounts.administrator.userId],
  ])(
    "%s can create, update, and delete an asset",
    async (role, userId) => {
      // CREATE
      const assetId = await createTestAsset(
        userId,
        propertyAId,
        `TEMP CRUD TEST ${role}`
      );

      // UPDATE
      const updateResponse = await authenticatedRequest(userId)
        .put(`/api/v1/assets/${assetId}`)
        .send({
          assetName: `UPDATED CRUD TEST ${role}`,
        });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.success).toBe(true);

      // DELETE
      const deleteResponse = await authenticatedRequest(userId)
        .delete(`/api/v1/assets/${assetId}`);

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.success).toBe(true);
    }
  );
});
