
import {
  afterAll,
  beforeAll,
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

let maintenanceA: string;
let maintenanceB: string;

const createdMaintenanceIds: string[] = [];

function getMaintenance(userToken: string) {
  return request(app)
    .get("/api/v1/maintenance")
    .query({ organizationId })
    .set("Authorization", `Bearer ${userToken}`);
}

function getMaintenanceById(
  userToken: string,
  maintenanceId: string
) {
  return request(app)
    .get(`/api/v1/maintenance/${maintenanceId}`)
    .query({ organizationId })
    .set("Authorization", `Bearer ${userToken}`);
}

function createMaintenance(
  userToken: string,
  data: Record<string, unknown>
) {
  return request(app)
    .post("/api/v1/maintenance")
    .query({ organizationId })
    .send(data)
    .set("Authorization", `Bearer ${userToken}`);
}

function updateMaintenance(
  userToken: string,
  maintenanceId: string,
  data: Record<string, unknown>
) {
  return request(app)
    .put(`/api/v1/maintenance/${maintenanceId}`)
    .query({ organizationId })
    .send(data)
    .set("Authorization", `Bearer ${userToken}`);
}

function completeMaintenance(
  userToken: string,
  maintenanceId: string
) {
  return request(app)
    .patch(`/api/v1/maintenance/${maintenanceId}/complete`)
    .query({ organizationId })
    .set("Authorization", `Bearer ${userToken}`);
}

function deleteMaintenance(
  userToken: string,
  maintenanceId: string
) {
  return request(app)
    .delete(`/api/v1/maintenance/${maintenanceId}`)
    .query({ organizationId })
    .set("Authorization", `Bearer ${userToken}`);
}

async function createFixture(
  assetId: string,
  title: string
): Promise<string> {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input("organizationId", sql.UniqueIdentifier, organizationId)
    .input("assetId", sql.UniqueIdentifier, assetId)
    .input("title", sql.NVarChar(150), title)
    .query(`
      INSERT INTO dbo.AssetMaintenance (
        OrganizationId,
        AssetId,
        MaintenanceTitle,
        MaintenanceType,
        Status
      )
      OUTPUT INSERTED.MaintenanceId AS maintenanceId
      VALUES (
        @organizationId,
        @assetId,
        @title,
        'scheduled',
        'scheduled'
      );
    `);

  return result.recordset[0].maintenanceId;
}

async function resetFixtures() {
  const pool = await getDatabase();

  await pool
    .request()
    .input("maintenanceA", sql.UniqueIdentifier, maintenanceA)
    .input("maintenanceB", sql.UniqueIdentifier, maintenanceB)
    .query(`
      UPDATE dbo.AssetMaintenance
      SET
        Status = 'scheduled',
        CompletedDate = NULL,
        MaintenanceTitle = CASE
          WHEN MaintenanceId = @maintenanceA
            THEN 'Security Test Maintenance A'
          ELSE 'Security Test Maintenance B'
        END
      WHERE MaintenanceId IN (@maintenanceA, @maintenanceB);
    `);
}

describe("PropertyIQ maintenance authorization", () => {
  beforeAll(async () => {
    maintenanceA = await createFixture(
      assetA,
      "Security Test Maintenance A"
    );

    maintenanceB = await createFixture(
      assetB,
      "Security Test Maintenance B"
    );
  });

  beforeEach(async () => {
    await resetFixtures();
  });

  afterAll(async () => {
    const pool = await getDatabase();

    const ids = [
      maintenanceA,
      maintenanceB,
      ...createdMaintenanceIds,
    ].filter(Boolean);

    if (ids.length > 0) {
      const cleanupRequest = pool.request();

      const parameters = ids.map((id, index) => {
        const name = `maintenance${index}`;

        cleanupRequest.input(
          name,
          sql.UniqueIdentifier,
          id
        );

        return `@${name}`;
      });

      await cleanupRequest.query(`
        DELETE FROM dbo.AssetMaintenance
        WHERE MaintenanceId IN (${parameters.join(", ")});
      `);
    }
  });

  it("allows Owner to view maintenance from both properties", async () => {
    const response = await getMaintenance(tokens.owner);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);

    const ids = response.body.data.map(
      (item: { maintenanceId: string }) =>
        item.maintenanceId.toUpperCase()
    );

    expect(ids).toContain(maintenanceA.toUpperCase());
    expect(ids).toContain(maintenanceB.toUpperCase());
  });

  it("allows Administrator to view maintenance from both properties", async () => {
    const response = await getMaintenance(tokens.administrator);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
  });

  it("restricts Member to assigned Property A maintenance", async () => {
    const response = await getMaintenance(tokens.member);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);

    expect(
      response.body.data[0].maintenanceId.toUpperCase()
    ).toBe(maintenanceA.toUpperCase());
  });

  it("restricts Viewer to assigned Property A maintenance", async () => {
    const response = await getMaintenance(tokens.viewer);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);

    expect(
      response.body.data[0].maintenanceId.toUpperCase()
    ).toBe(maintenanceA.toUpperCase());
  });

  it("prevents Member from retrieving Property B maintenance directly", async () => {
    const response = await getMaintenanceById(
      tokens.member,
      maintenanceB
    );

    expect(response.status).toBe(404);
  });

  it("prevents Viewer from retrieving Property B maintenance directly", async () => {
    const response = await getMaintenanceById(
      tokens.viewer,
      maintenanceB
    );

    expect(response.status).toBe(404);
  });

  it("allows Owner to retrieve Property B maintenance directly", async () => {
    const response = await getMaintenanceById(
      tokens.owner,
      maintenanceB
    );

    expect(response.status).toBe(200);
  });

  it("allows Administrator to retrieve Property B maintenance directly", async () => {
    const response = await getMaintenanceById(
      tokens.administrator,
      maintenanceB
    );

    expect(response.status).toBe(200);
  });

  it("allows Member to create maintenance on assigned Property A", async () => {
    const response = await createMaintenance(tokens.member, {
      assetId: assetA,
      maintenanceTitle: "Member Created Maintenance",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.maintenanceTitle)
      .toBe("Member Created Maintenance");

    createdMaintenanceIds.push(
      response.body.data.maintenanceId
    );
  });

  it("prevents Member from creating maintenance on Property B", async () => {
    const response = await createMaintenance(tokens.member, {
      assetId: assetB,
      maintenanceTitle: "Unauthorized Property B Maintenance",
    });

    expect(response.status).toBe(400);
  });

  it("prevents Viewer from creating maintenance", async () => {
    const response = await createMaintenance(tokens.viewer, {
      assetId: assetA,
      maintenanceTitle: "Viewer Unauthorized Maintenance",
    });

    expect(response.status).toBe(403);
  });

  it("allows Owner to create maintenance", async () => {
    const response = await createMaintenance(tokens.owner, {
      assetId: assetB,
      maintenanceTitle: "Owner Created Maintenance",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.maintenanceTitle)
      .toBe("Owner Created Maintenance");

    createdMaintenanceIds.push(
      response.body.data.maintenanceId
    );
  });

  it("allows Administrator to create maintenance", async () => {
    const response = await createMaintenance(tokens.administrator, {
      assetId: assetB,
      maintenanceTitle: "Administrator Created Maintenance",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.maintenanceTitle)
      .toBe("Administrator Created Maintenance");

    createdMaintenanceIds.push(
      response.body.data.maintenanceId
    );
  });

  it("prevents Member from updating maintenance on Property B", async () => {
    const response = await updateMaintenance(
      tokens.member,
      maintenanceB,
      {
        assetId: assetB,
        maintenanceTitle: "Unauthorized Update",
      }
    );

    expect(response.status).toBe(404);
  });

  it("prevents Viewer from updating maintenance", async () => {
    const response = await updateMaintenance(
      tokens.viewer,
      maintenanceA,
      {
        assetId: assetA,
        maintenanceTitle: "Viewer Unauthorized Update",
      }
    );

    expect(response.status).toBe(403);
  });

  it("allows Member to update maintenance on assigned Property A", async () => {
    const response = await updateMaintenance(
      tokens.member,
      maintenanceA,
      {
        assetId: assetA,
        maintenanceTitle: "Member Updated Maintenance",
      }
    );

    expect(response.status).toBe(200);
    expect(response.body.data.maintenanceTitle)
      .toBe("Member Updated Maintenance");
  });

  it("allows Owner to update maintenance", async () => {
    const response = await updateMaintenance(
      tokens.owner,
      maintenanceB,
      {
        assetId: assetB,
        maintenanceTitle: "Owner Updated Maintenance",
      }
    );

    expect(response.status).toBe(200);
    expect(response.body.data.maintenanceTitle)
      .toBe("Owner Updated Maintenance");
  });

  it("allows Administrator to update maintenance", async () => {
    const response = await updateMaintenance(
      tokens.administrator,
      maintenanceB,
      {
        assetId: assetB,
        maintenanceTitle: "Administrator Updated Maintenance",
      }
    );

    expect(response.status).toBe(200);
    expect(response.body.data.maintenanceTitle)
      .toBe("Administrator Updated Maintenance");
  });

  it("allows Member to complete maintenance on assigned Property A", async () => {
    const response = await completeMaintenance(
      tokens.member,
      maintenanceA
    );

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("completed");
  });

  it("prevents Member from completing Property B maintenance", async () => {
    const response = await completeMaintenance(
      tokens.member,
      maintenanceB
    );

    expect(response.status).toBe(404);
  });

  it("prevents Viewer from completing maintenance", async () => {
    const response = await completeMaintenance(
      tokens.viewer,
      maintenanceA
    );

    expect(response.status).toBe(403);
  });

  it("allows Owner to complete maintenance", async () => {
    const response = await completeMaintenance(
      tokens.owner,
      maintenanceB
    );

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("completed");
  });

  it("allows Administrator to complete maintenance", async () => {
    const response = await completeMaintenance(
      tokens.administrator,
      maintenanceB
    );

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("completed");
  });

  it("prevents Member from deleting maintenance", async () => {
    const response = await deleteMaintenance(
      tokens.member,
      maintenanceA
    );

    expect(response.status).toBe(403);
  });

  it("prevents Viewer from deleting maintenance", async () => {
    const response = await deleteMaintenance(
      tokens.viewer,
      maintenanceA
    );

    expect(response.status).toBe(403);
  });

  it("allows Owner to delete maintenance", async () => {
    const testId = await createFixture(
      assetA,
      "Owner Delete Test Maintenance"
    );

    const response = await deleteMaintenance(
      tokens.owner,
      testId
    );

    expect(response.status).toBe(200);
  });

  it("allows Administrator to delete maintenance", async () => {
    const testId = await createFixture(
      assetB,
      "Administrator Delete Test Maintenance"
    );

    const response = await deleteMaintenance(
      tokens.administrator,
      testId
    );

    expect(response.status).toBe(200);
  });
});
