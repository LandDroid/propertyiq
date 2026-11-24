
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

import app from "../src/app";
import { authConfig } from "../src/config/auth";
import { getDatabase, sql } from "../src/config/database";

const organizationId =
  "4587318B-7DA1-482E-B0B7-587B9A26C7D8";

const propertyA =
  "2BA345BB-3864-4E83-A0BE-E3B2CC915623";

const propertyB =
  "AC02E56C-E610-4D54-A274-FC3413F8A9C7";

const assetA =
  "02C989A6-370E-470F-AAEF-DEDE3A888140";

const assetB =
  "580731D7-A89E-4F8D-9268-2BA9E4FCBE60";

const warrantyA =
  "959D9A56-600D-4623-940E-31DF28B8A749";

const warrantyB =
  "8F1FF0F3-C26A-474E-9173-DF5A34060911";

const users = {
  owner: "08281964-BFA4-4B29-86AC-65FE96A8AECE",
  administrator: "62026EEE-8D8E-477A-A33E-A057D8F505F0",
  member: "53A8EC9B-EE87-4577-A59B-985CA1B252E8",
  viewer: "3E2BF33C-A551-4371-974A-B31F4DF838A1",
};

function token(userId: string) {
  return jwt.sign(
    { type: "access" },
    authConfig.accessTokenSecret,
    {
      subject: userId,
      expiresIn: "5m",
    }
  );
}

const tokens = {
  owner: token(users.owner),
  administrator: token(users.administrator),
  member: token(users.member),
  viewer: token(users.viewer),
};

function getWarranties(userToken: string) {
  return request(app)
    .get("/api/v1/warranties")
    .query({ organizationId })
    .set("Authorization", `Bearer ${userToken}`);
}

function getWarranty(userToken: string, warrantyId: string) {
  return request(app)
    .get(`/api/v1/warranties/${warrantyId}`)
    .query({ organizationId })
    .set("Authorization", `Bearer ${userToken}`);
}

function createWarranty(
  userToken: string,
  data: Record<string, unknown>
) {
  return request(app)
    .post("/api/v1/warranties")
    .send({
      organizationId,
      ...data,
    })
    .set("Authorization", `Bearer ${userToken}`);
}

function updateWarranty(
  userToken: string,
  warrantyId: string,
  data: Record<string, unknown>
) {
  return request(app)
    .put(`/api/v1/warranties/${warrantyId}`)
    .query({ organizationId })
    .send(data)
    .set("Authorization", `Bearer ${userToken}`);
}

function deleteWarranty(userToken: string, warrantyId: string) {
  return request(app)
    .delete(`/api/v1/warranties/${warrantyId}`)
    .query({ organizationId })
    .set("Authorization", `Bearer ${userToken}`);
}

describe("PropertyIQ warranty authorization", () => {
  beforeEach(async () => {
    const pool = await getDatabase();

    await pool
      .request()
      .input("warrantyA", sql.UniqueIdentifier, warrantyA)
      .input("warrantyB", sql.UniqueIdentifier, warrantyB)
      .query(`
        UPDATE dbo.AssetWarranties
        SET
          WarrantyName = CASE
            WHEN WarrantyId = @warrantyA
              THEN 'Security Test Warranty A'
            ELSE 'Security Test Warranty B'
          END,
          Status = 'active'
        WHERE WarrantyId IN (@warrantyA, @warrantyB);
      `);
  });

  it("allows Owner to view warranties from both properties", async () => {
    const response = await getWarranties(tokens.owner);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);

    const ids = response.body.data.map(
      (warranty: { warrantyId: string }) =>
        warranty.warrantyId.toUpperCase()
    );

    expect(ids).toContain(warrantyA);
    expect(ids).toContain(warrantyB);
  });

  it("allows Administrator to view warranties from both properties", async () => {
    const response = await getWarranties(tokens.administrator);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
  });

  it("restricts Member to warranties on assigned Property A", async () => {
    const response = await getWarranties(tokens.member);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].warrantyId.toUpperCase()).toBe(warrantyA);
  });

  it("restricts Viewer to warranties on assigned Property A", async () => {
    const response = await getWarranties(tokens.viewer);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].warrantyId.toUpperCase()).toBe(warrantyA);
  });

  it("prevents Member from retrieving Property B warranty directly", async () => {
    const response = await getWarranty(tokens.member, warrantyB);

    expect(response.status).toBe(404);
  });

  it("prevents Viewer from retrieving Property B warranty directly", async () => {
    const response = await getWarranty(tokens.viewer, warrantyB);

    expect(response.status).toBe(404);
  });

  it("allows Owner to retrieve Property B warranty directly", async () => {
    const response = await getWarranty(tokens.owner, warrantyB);

    expect(response.status).toBe(200);
  });

  it("allows Administrator to retrieve Property B warranty directly", async () => {
    const response = await getWarranty(tokens.administrator, warrantyB);

    expect(response.status).toBe(200);
  });

  it("prevents Member from creating warranties", async () => {
    const response = await createWarranty(tokens.member, {
      assetId: assetA,
      warrantyName: "Member Must Not Create",
    });

    expect(response.status).toBe(403);
  });

  it("prevents Viewer from creating warranties", async () => {
    const response = await createWarranty(tokens.viewer, {
      assetId: assetA,
      warrantyName: "Viewer Must Not Create",
    });

    expect(response.status).toBe(403);
  });

  it("allows Owner to create a warranty on Property A", async () => {
    const response = await createWarranty(tokens.owner, {
      assetId: assetA,
      warrantyName: "Owner Created Test Warranty",
      warrantyType: "manufacturer",
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.warrantyName).toBe(
      "Owner Created Test Warranty"
    );

    const createdId = response.body.data.warrantyId;

    expect(createdId).toBeDefined();

    const pool = await getDatabase();

    await pool
      .request()
      .input("warrantyId", sql.UniqueIdentifier, createdId)
      .query(`
        DELETE FROM dbo.AssetWarranties
        WHERE WarrantyId = @warrantyId;
      `);
  });

  it("allows Administrator to create a warranty on Property B", async () => {
    const response = await createWarranty(tokens.administrator, {
      assetId: assetB,
      warrantyName: "Administrator Created Test Warranty",
      warrantyType: "manufacturer",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.warrantyName).toBe(
      "Administrator Created Test Warranty"
    );

    const createdId = response.body.data.warrantyId;

    const pool = await getDatabase();

    await pool
      .request()
      .input("warrantyId", sql.UniqueIdentifier, createdId)
      .query(`
        DELETE FROM dbo.AssetWarranties
        WHERE WarrantyId = @warrantyId;
      `);
  });

  it("prevents Owner from creating a warranty using an asset from another organization", async () => {
    const response = await createWarranty(tokens.owner, {
      assetId: "00000000-0000-0000-0000-000000000001",
      warrantyName: "Invalid Cross Organization Warranty",
    });

    expect([400, 404]).toContain(response.status);
  });

  it("prevents Member from updating warranties", async () => {
    const response = await updateWarranty(
      tokens.member,
      warrantyA,
      { warrantyName: "Member Unauthorized Update" }
    );

    expect(response.status).toBe(403);
  });

  it("prevents Viewer from updating warranties", async () => {
    const response = await updateWarranty(
      tokens.viewer,
      warrantyA,
      { warrantyName: "Viewer Unauthorized Update" }
    );

    expect(response.status).toBe(403);
  });

  it("allows Owner to update a warranty", async () => {
    const response = await updateWarranty(
      tokens.owner,
      warrantyA,
      { warrantyName: "Security Test Warranty A Updated" }
    );

    expect(response.status).toBe(200);
    expect(response.body.data.warrantyName).toBe(
      "Security Test Warranty A Updated"
    );
  });

  it("allows Administrator to update a warranty", async () => {
    const response = await updateWarranty(
      tokens.administrator,
      warrantyB,
      { warrantyName: "Security Test Warranty B Updated" }
    );

    expect(response.status).toBe(200);
    expect(response.body.data.warrantyName).toBe(
      "Security Test Warranty B Updated"
    );
  });

  it("prevents Member from deleting warranties", async () => {
    const response = await deleteWarranty(tokens.member, warrantyA);

    expect(response.status).toBe(403);
  });

  it("prevents Viewer from deleting warranties", async () => {
    const response = await deleteWarranty(tokens.viewer, warrantyA);

    expect(response.status).toBe(403);
  });

  it("allows Owner to delete a warranty", async () => {
    const pool = await getDatabase();

    const insertResult = await pool
      .request()
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .input("assetId", sql.UniqueIdentifier, assetA)
      .query(`
        INSERT INTO dbo.AssetWarranties (
          OrganizationId,
          AssetId,
          WarrantyName,
          WarrantyType,
          Status
        )
        OUTPUT INSERTED.WarrantyId AS warrantyId
        VALUES (
          @organizationId,
          @assetId,
          'Owner Delete Test Warranty',
          'manufacturer',
          'active'
        );
      `);

    const testWarrantyId = insertResult.recordset[0].warrantyId;

    const response = await deleteWarranty(
      tokens.owner,
      testWarrantyId
    );

    expect(response.status).toBe(200);
  });

  it("allows Administrator to delete a warranty", async () => {
    const pool = await getDatabase();

    const insertResult = await pool
      .request()
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .input("assetId", sql.UniqueIdentifier, assetB)
      .query(`
        INSERT INTO dbo.AssetWarranties (
          OrganizationId,
          AssetId,
          WarrantyName,
          WarrantyType,
          Status
        )
        OUTPUT INSERTED.WarrantyId AS warrantyId
        VALUES (
          @organizationId,
          @assetId,
          'Administrator Delete Test Warranty',
          'manufacturer',
          'active'
        );
      `);

    const testWarrantyId = insertResult.recordset[0].warrantyId;

    const response = await deleteWarranty(
      tokens.administrator,
      testWarrantyId
    );

    expect(response.status).toBe(200);
  });

  it("prevents Member from updating a Property B warranty", async () => {
    const response = await updateWarranty(
      tokens.member,
      warrantyB,
      { warrantyName: "Unauthorized Property B Update" }
    );

    expect(response.status).toBe(403);
  });

  it("prevents Member from deleting a Property B warranty", async () => {
    const response = await deleteWarranty(tokens.member, warrantyB);

    expect(response.status).toBe(403);
  });

  it("rejects a warranty end date earlier than its start date", async () => {
    const response = await createWarranty(tokens.owner, {
      assetId: assetA,
      warrantyName: "Invalid Date Warranty",
      warrantyStartDate: "2027-01-01",
      warrantyEndDate: "2026-01-01",
    });

    expect(response.status).toBe(400);
  });
});
