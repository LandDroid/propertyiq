
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

const accounts = {
  owner: "08281964-BFA4-4B29-86AC-65FE96A8AECE",
  administrator: "62026EEE-8D8E-477A-A33E-A057D8F505F0",
  member: "53A8EC9B-EE87-4577-A59B-985CA1B252E8",
  viewer: "3E2BF33C-A551-4371-974A-B31F4DF838A1",
};

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

const tokens = {
  owner: createAccessToken(accounts.owner),
  administrator: createAccessToken(accounts.administrator),
  member: createAccessToken(accounts.member),
  viewer: createAccessToken(accounts.viewer),
};

const zoneA = randomUUID();
const zoneB = randomUUID();
const gatewayA = randomUUID();
const gatewayB = randomUUID();

const createdDeviceIds: string[] = [];

function devicePayload(propertyId: string, options?: {
  zoneId?: string | null;
  gatewayId?: string | null;
}) {
  return {
    organizationId,
    propertyId,
    zoneId: options?.zoneId ?? null,
    gatewayId: options?.gatewayId ?? null,
    deviceName: `Security Test Device ${randomUUID().slice(0, 8)}`,
    serialNumber: `PIQ-TEST-${randomUUID()}`,
    manufacturer: "PropertyIQ Test",
    model: "Test Model",
    deviceType: "sensor",
    firmwareVersion: "1.0.0",
    status: "offline",
    installedAt: null,
  };
}

async function createDevice(
  token: string,
  propertyId: string,
  options?: {
    zoneId?: string | null;
    gatewayId?: string | null;
  }
) {
  const response = await request(app)
    .post("/api/v1/devices")
    .set("Authorization", `Bearer ${token}`)
    .send(devicePayload(propertyId, options));

  if (response.body.data?.deviceId) {
    createdDeviceIds.push(response.body.data.deviceId);
  }

  return response;
}

describe("PropertyIQ device authorization", () => {
  beforeAll(async () => {
    const pool = await getDatabase();

    // Create a zone for each test property.
    await pool.request()
      .input("zoneA", sql.UniqueIdentifier, zoneA)
      .input("zoneB", sql.UniqueIdentifier, zoneB)
      .input("propertyA", sql.UniqueIdentifier, propertyA)
      .input("propertyB", sql.UniqueIdentifier, propertyB)
      .query(`
        INSERT INTO dbo.PropertyZones (
          ZoneId, PropertyId, ZoneName, ZoneType, Description
        )
        VALUES
          (@zoneA, @propertyA, 'Security Test Zone A', 'General', 'Test fixture'),
          (@zoneB, @propertyB, 'Security Test Zone B', 'General', 'Test fixture');
      `);

    // Create a gateway for each test property.
    await pool.request()
      .input("gatewayA", sql.UniqueIdentifier, gatewayA)
      .input("gatewayB", sql.UniqueIdentifier, gatewayB)
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .input("propertyA", sql.UniqueIdentifier, propertyA)
      .input("propertyB", sql.UniqueIdentifier, propertyB)
      .query(`
        INSERT INTO dbo.Gateways (
          GatewayId,
          OrganizationId,
          PropertyId,
          GatewayName,
          SerialNumber,
          Manufacturer,
          Model,
          FirmwareVersion,
          Status
        )
        VALUES
          (
            @gatewayA, @organizationId, @propertyA,
            'Security Test Gateway A', 'PIQ-GW-TEST-A',
            'PropertyIQ Test', 'Gateway Model', '1.0.0', 'offline'
          ),
          (
            @gatewayB, @organizationId, @propertyB,
            'Security Test Gateway B', 'PIQ-GW-TEST-B',
            'PropertyIQ Test', 'Gateway Model', '1.0.0', 'offline'
          );
      `);
  });

  afterAll(async () => {
    const pool = await getDatabase();

    // Remove devices created by this test file.
    for (const deviceId of createdDeviceIds) {
      await pool.request()
        .input("deviceId", sql.UniqueIdentifier, deviceId)
        .query(`
          DELETE FROM dbo.Devices
          WHERE DeviceId = @deviceId;
        `);
    }

    // Remove test gateways and zones.
    await pool.request()
      .input("gatewayA", sql.UniqueIdentifier, gatewayA)
      .input("gatewayB", sql.UniqueIdentifier, gatewayB)
      .query(`
        DELETE FROM dbo.Gateways
        WHERE GatewayId IN (@gatewayA, @gatewayB);
      `);

    await pool.request()
      .input("zoneA", sql.UniqueIdentifier, zoneA)
      .input("zoneB", sql.UniqueIdentifier, zoneB)
      .query(`
        DELETE FROM dbo.PropertyZones
        WHERE ZoneId IN (@zoneA, @zoneB);
      `);
  });

  // =====================================================
  // READ ACCESS
  // =====================================================

  it("allows Owner to view devices across both properties", async () => {
    const deviceA = await createDevice(tokens.owner, propertyA);
    const deviceB = await createDevice(tokens.owner, propertyB);

    expect(deviceA.status).toBe(201);
    expect(deviceB.status).toBe(201);

    const response = await request(app)
      .get("/api/v1/devices")
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.owner}`);

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it("allows Administrator to view devices across both properties", async () => {
    const response = await request(app)
      .get("/api/v1/devices")
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.administrator}`);

    expect(response.status).toBe(200);
  });

  it("restricts Member to devices on assigned Property A", async () => {
    const response = await request(app)
      .get("/api/v1/devices")
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.member}`);

    expect(response.status).toBe(200);

    for (const device of response.body.data) {
      expect(device.propertyId.toLowerCase()).toBe(
        propertyA.toLowerCase()
      );
    }
  });

  it("restricts Viewer to devices on assigned Property A", async () => {
    const response = await request(app)
      .get("/api/v1/devices")
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.viewer}`);

    expect(response.status).toBe(200);

    for (const device of response.body.data) {
      expect(device.propertyId.toLowerCase()).toBe(
        propertyA.toLowerCase()
      );
    }
  });

  // =====================================================
  // INDIVIDUAL DEVICE ACCESS
  // =====================================================

  it("prevents Member from viewing a device on unassigned Property B", async () => {
    const device = await createDevice(tokens.owner, propertyB);

    expect(device.status).toBe(201);

    const response = await request(app)
      .get(`/api/v1/devices/${device.body.data.deviceId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.member}`);

    expect(response.status).toBe(404);
  });

  it("prevents Viewer from viewing a device on unassigned Property B", async () => {
    const device = await createDevice(tokens.owner, propertyB);

    expect(device.status).toBe(201);

    const response = await request(app)
      .get(`/api/v1/devices/${device.body.data.deviceId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.viewer}`);

    expect(response.status).toBe(404);
  });

  // =====================================================
  // WRITE ACCESS
  // =====================================================

  it("prevents Member from creating devices", async () => {
    const response = await createDevice(tokens.member, propertyA);

    expect(response.status).toBe(403);
  });

  it("prevents Viewer from creating devices", async () => {
    const response = await createDevice(tokens.viewer, propertyA);

    expect(response.status).toBe(403);
  });

  it("prevents Member from updating devices", async () => {
    const device = await createDevice(tokens.owner, propertyA);

    expect(device.status).toBe(201);

    const response = await request(app)
      .put(`/api/v1/devices/${device.body.data.deviceId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.member}`)
      .send(devicePayload(propertyA));

    expect(response.status).toBe(403);
  });

  it("prevents Viewer from updating devices", async () => {
    const device = await createDevice(tokens.owner, propertyA);

    expect(device.status).toBe(201);

    const response = await request(app)
      .put(`/api/v1/devices/${device.body.data.deviceId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.viewer}`)
      .send(devicePayload(propertyA));

    expect(response.status).toBe(403);
  });

  it("prevents Member from deleting devices", async () => {
    const device = await createDevice(tokens.owner, propertyA);

    expect(device.status).toBe(201);

    const response = await request(app)
      .delete(`/api/v1/devices/${device.body.data.deviceId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.member}`);

    expect(response.status).toBe(403);
  });

  it("prevents Viewer from deleting devices", async () => {
    const device = await createDevice(tokens.owner, propertyA);

    expect(device.status).toBe(201);

    const response = await request(app)
      .delete(`/api/v1/devices/${device.body.data.deviceId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.viewer}`);

    expect(response.status).toBe(403);
  });

  // =====================================================
  // OWNER / ADMIN MANAGEMENT
  // =====================================================

  it("allows Owner to create, update and delete devices", async () => {
    const created = await createDevice(tokens.owner, propertyA);

    expect(created.status).toBe(201);

    const deviceId = created.body.data.deviceId;

    const updatedPayload = {
      ...devicePayload(propertyA),
      deviceName: "Owner Updated Device",
    };

    const updated = await request(app)
      .put(`/api/v1/devices/${deviceId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.owner}`)
      .send(updatedPayload);

    expect(updated.status).toBe(200);
    expect(updated.body.data.deviceName).toBe("Owner Updated Device");

    const deleted = await request(app)
      .delete(`/api/v1/devices/${deviceId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.owner}`);

    expect(deleted.status).toBe(200);
  });

  it("allows Administrator to create, update and delete devices", async () => {
    const created = await createDevice(tokens.administrator, propertyA);

    expect(created.status).toBe(201);

    const deviceId = created.body.data.deviceId;

    const updated = await request(app)
      .put(`/api/v1/devices/${deviceId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.administrator}`)
      .send({
        ...devicePayload(propertyA),
        deviceName: "Administrator Updated Device",
      });

    expect(updated.status).toBe(200);

    const deleted = await request(app)
      .delete(`/api/v1/devices/${deviceId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.administrator}`);

    expect(deleted.status).toBe(200);
  });

  // =====================================================
  // PROPERTY / ZONE / GATEWAY RELATIONSHIP SECURITY
  // =====================================================

  it("rejects creating a Property A device with Property B zone", async () => {
    const response = await createDevice(tokens.owner, propertyA, {
      zoneId: zoneB,
    });

    expect(response.status).toBe(400);
  });

  it("rejects creating a Property A device with Property B gateway", async () => {
    const response = await createDevice(tokens.owner, propertyA, {
      gatewayId: gatewayB,
    });

    expect(response.status).toBe(400);
  });

  it("rejects creating a Property A device with Property B zone and gateway", async () => {
    const response = await createDevice(tokens.owner, propertyA, {
      zoneId: zoneB,
      gatewayId: gatewayB,
    });

    expect(response.status).toBe(400);
  });

  it("allows creating a device with its matching zone and gateway", async () => {
    const response = await createDevice(tokens.owner, propertyA, {
      zoneId: zoneA,
      gatewayId: gatewayA,
    });

    expect(response.status).toBe(201);
  });

  it("rejects updating a device with another property's zone", async () => {
    const device = await createDevice(tokens.owner, propertyA);

    expect(device.status).toBe(201);

    const response = await request(app)
      .put(`/api/v1/devices/${device.body.data.deviceId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.owner}`)
      .send(devicePayload(propertyA, { zoneId: zoneB }));

    expect(response.status).toBe(404);
  });

  it("rejects updating a device with another property's gateway", async () => {
    const device = await createDevice(tokens.owner, propertyA);

    expect(device.status).toBe(201);

    const response = await request(app)
      .put(`/api/v1/devices/${device.body.data.deviceId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.owner}`)
      .send(devicePayload(propertyA, { gatewayId: gatewayB }));

    expect(response.status).toBe(404);
  });
});
