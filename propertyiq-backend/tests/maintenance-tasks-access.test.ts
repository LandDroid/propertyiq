
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
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

const createdTaskIds: string[] = [];
const createdDeviceIds: string[] = [];

function taskPayload(
  propertyId: string,
  options?: {
    deviceId?: string | null;
    assignedToUserId?: string | null;
    title?: string;
    priority?: string;
    status?: string;
  }
) {
  return {
    propertyId,
    deviceId: options?.deviceId ?? null,
    assignedToUserId: options?.assignedToUserId ?? null,
    title: options?.title ?? `Test Maintenance Task ${randomUUID()}`,
    description: "PropertyIQ maintenance task integration test",
    priority: options?.priority ?? "normal",
    status: options?.status ?? "open",
    scheduledDate: null,
  };
}

function devicePayload(propertyId: string) {
  return {
    organizationId,
    propertyId,
    zoneId: null,
    gatewayId: null,
    deviceName: `Maintenance Test Device ${randomUUID().slice(0, 8)}`,
    serialNumber: `PIQ-MT-${randomUUID()}`,
    manufacturer: "PropertyIQ Test",
    model: "Test Model",
    deviceType: "sensor",
    firmwareVersion: "1.0.0",
    status: "offline",
    installedAt: null,
  };
}

async function createTask(
  token: string,
  propertyId: string,
  options?: Parameters<typeof taskPayload>[1]
) {
  const response = await request(app)
    .post("/api/v1/maintenance-tasks")
    .query({ organizationId })
    .set("Authorization", `Bearer ${token}`)
    .send(taskPayload(propertyId, options));

  const taskId = response.body.data?.MaintenanceTaskId;

  if (taskId) {
    createdTaskIds.push(taskId);
  }

  return response;
}

async function createDevice(
  token: string,
  propertyId: string
) {
  const response = await request(app)
    .post("/api/v1/devices")
    .set("Authorization", `Bearer ${token}`)
    .send(devicePayload(propertyId));

  const deviceId = response.body.data?.deviceId;

  if (deviceId) {
    createdDeviceIds.push(deviceId);
  }

  return response;
}

describe("PropertyIQ maintenance task authorization", () => {
  afterAll(async () => {
    const pool = await getDatabase();

    // Remove any assignments created for test tasks first.
    for (const taskId of createdTaskIds) {
      await pool.request()
        .input("organizationId", sql.UniqueIdentifier, organizationId)
        .input("taskId", sql.UniqueIdentifier, taskId)
        .query(`
          DELETE FROM dbo.MaintenanceTaskAssignments
          WHERE OrganizationId = @organizationId
            AND MaintenanceTaskId = @taskId;
        `);
    }

    // Remove test maintenance tasks.
    for (const taskId of createdTaskIds) {
      await pool.request()
        .input("organizationId", sql.UniqueIdentifier, organizationId)
        .input("taskId", sql.UniqueIdentifier, taskId)
        .query(`
          DELETE FROM dbo.MaintenanceTasks
          WHERE OrganizationId = @organizationId
            AND MaintenanceTaskId = @taskId;
        `);
    }

    // Remove test devices.
    for (const deviceId of createdDeviceIds) {
      await pool.request()
        .input("deviceId", sql.UniqueIdentifier, deviceId)
        .query(`
          DELETE FROM dbo.Devices
          WHERE DeviceId = @deviceId;
        `);
    }
  });

  // =====================================================
  // READ ACCESS
  // =====================================================

  it("allows Owner to view tasks across both properties", async () => {
    const taskA = await createTask(tokens.owner, propertyA);
    const taskB = await createTask(tokens.owner, propertyB);

    expect(taskA.status).toBe(201);
    expect(taskB.status).toBe(201);

    const response = await request(app)
      .get("/api/v1/maintenance-tasks")
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.owner}`);

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it("allows Administrator to view organization maintenance tasks", async () => {
    const response = await request(app)
      .get("/api/v1/maintenance-tasks")
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.administrator}`);

    expect(response.status).toBe(200);
  });

  it("restricts Member to tasks on assigned Property A", async () => {
    await createTask(tokens.owner, propertyA);
    await createTask(tokens.owner, propertyB);

    const response = await request(app)
      .get("/api/v1/maintenance-tasks")
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.member}`);

    expect(response.status).toBe(200);

    for (const task of response.body.data) {
      expect(task.PropertyId.toLowerCase()).toBe(
        propertyA.toLowerCase()
      );
    }
  });

  it("restricts Viewer to tasks on assigned Property A", async () => {
    await createTask(tokens.owner, propertyA);
    await createTask(tokens.owner, propertyB);

    const response = await request(app)
      .get("/api/v1/maintenance-tasks")
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.viewer}`);

    expect(response.status).toBe(200);

    for (const task of response.body.data) {
      expect(task.PropertyId.toLowerCase()).toBe(
        propertyA.toLowerCase()
      );
    }
  });

  it("allows an authorized user to view an individual task", async () => {
    const created = await createTask(tokens.owner, propertyA);

    expect(created.status).toBe(201);

    const taskId = created.body.data.MaintenanceTaskId;

    const response = await request(app)
      .get(`/api/v1/maintenance-tasks/${taskId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.member}`);

    expect(response.status).toBe(200);
    expect(response.body.data.MaintenanceTaskId).toBe(taskId);
  });

  it("prevents Member from viewing a task on unassigned Property B", async () => {
    const created = await createTask(tokens.owner, propertyB);

    expect(created.status).toBe(201);

    const taskId = created.body.data.MaintenanceTaskId;

    const response = await request(app)
      .get(`/api/v1/maintenance-tasks/${taskId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.member}`);

    expect(response.status).toBe(404);
  });

  // =====================================================
  // CREATE ACCESS
  // =====================================================

  it("allows Owner to create maintenance tasks", async () => {
    const response = await createTask(tokens.owner, propertyA);

    expect(response.status).toBe(201);
    expect(response.body.data.Title).toContain(
      "Test Maintenance Task"
    );
  });

  it("allows Administrator to create maintenance tasks", async () => {
    const response = await createTask(
      tokens.administrator,
      propertyA
    );

    expect(response.status).toBe(201);
  });

  it("allows Member to create tasks on accessible Property A", async () => {
    const response = await createTask(tokens.member, propertyA);

    expect(response.status).toBe(201);
  });

  it("prevents Member from creating tasks on inaccessible Property B", async () => {
    const response = await createTask(tokens.member, propertyB);

    expect(response.status).toBe(403);
  });

  it("prevents Viewer from creating maintenance tasks", async () => {
    const response = await createTask(tokens.viewer, propertyA);

    expect(response.status).toBe(403);
  });

  // =====================================================
  // DEVICE RELATIONSHIP VALIDATION
  // =====================================================

  it("allows a task to reference a device on the same property", async () => {
    const device = await createDevice(tokens.owner, propertyA);

    expect(device.status).toBe(201);

    const response = await createTask(tokens.owner, propertyA, {
      deviceId: device.body.data.deviceId,
    });

    expect(response.status).toBe(201);
    expect(response.body.data.DeviceId).toBe(
      device.body.data.deviceId
    );
  });

  it("rejects a device belonging to another property", async () => {
    const device = await createDevice(tokens.owner, propertyB);

    expect(device.status).toBe(201);

    const response = await createTask(tokens.owner, propertyA, {
      deviceId: device.body.data.deviceId,
    });

    expect(response.status).toBe(400);
  });

  // =====================================================
  // UPDATE ACCESS
  // =====================================================

  it("allows Member to update a task on accessible Property A", async () => {
    const created = await createTask(tokens.owner, propertyA);

    expect(created.status).toBe(201);

    const taskId = created.body.data.MaintenanceTaskId;

    const response = await request(app)
      .patch(`/api/v1/maintenance-tasks/${taskId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.member}`)
      .send({
        title: "Member Updated Maintenance Task",
        priority: "high",
      });

    expect(response.status).toBe(200);
    expect(response.body.data.Title).toBe(
      "Member Updated Maintenance Task"
    );
    expect(response.body.data.Priority).toBe("high");
  });

  it("prevents Member from updating a task on inaccessible Property B", async () => {
    const created = await createTask(tokens.owner, propertyB);

    expect(created.status).toBe(201);

    const taskId = created.body.data.MaintenanceTaskId;

    const response = await request(app)
      .patch(`/api/v1/maintenance-tasks/${taskId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.member}`)
      .send({
        title: "Unauthorized Update",
      });

    expect(response.status).toBe(403);
  });

  it("prevents Viewer from updating maintenance tasks", async () => {
    const created = await createTask(tokens.owner, propertyA);

    expect(created.status).toBe(201);

    const taskId = created.body.data.MaintenanceTaskId;

    const response = await request(app)
      .patch(`/api/v1/maintenance-tasks/${taskId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.viewer}`)
      .send({
        title: "Viewer Unauthorized Update",
      });

    expect(response.status).toBe(403);
  });

  it("allows an authorized user to mark a task completed", async () => {
    const created = await createTask(tokens.owner, propertyA);

    expect(created.status).toBe(201);

    const taskId = created.body.data.MaintenanceTaskId;

    const response = await request(app)
      .patch(`/api/v1/maintenance-tasks/${taskId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.member}`)
      .send({
        status: "completed",
      });

    expect(response.status).toBe(200);
    expect(response.body.data.Status).toBe("completed");
    expect(response.body.data.CompletedAt).not.toBeNull();
  });

  // =====================================================
  // DELETE ACCESS
  // =====================================================

  it("prevents Member from deleting maintenance tasks", async () => {
    const created = await createTask(tokens.owner, propertyA);

    expect(created.status).toBe(201);

    const taskId = created.body.data.MaintenanceTaskId;

    const response = await request(app)
      .delete(`/api/v1/maintenance-tasks/${taskId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.member}`);

    expect(response.status).toBe(403);
  });

  it("prevents Viewer from deleting maintenance tasks", async () => {
    const created = await createTask(tokens.owner, propertyA);

    expect(created.status).toBe(201);

    const taskId = created.body.data.MaintenanceTaskId;

    const response = await request(app)
      .delete(`/api/v1/maintenance-tasks/${taskId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.viewer}`);

    expect(response.status).toBe(403);
  });

  it("allows Owner to delete a maintenance task", async () => {
    const created = await createTask(tokens.owner, propertyA);

    expect(created.status).toBe(201);

    const taskId = created.body.data.MaintenanceTaskId;

    const response = await request(app)
      .delete(`/api/v1/maintenance-tasks/${taskId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.owner}`);

    expect(response.status).toBe(200);
  });

  it("allows Administrator to delete a maintenance task", async () => {
    const created = await createTask(
      tokens.administrator,
      propertyA
    );

    expect(created.status).toBe(201);

    const taskId = created.body.data.MaintenanceTaskId;

    const response = await request(app)
      .delete(`/api/v1/maintenance-tasks/${taskId}`)
      .query({ organizationId })
      .set("Authorization", `Bearer ${tokens.administrator}`);

    expect(response.status).toBe(200);
  });
});
