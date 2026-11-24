
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

const alertA =
  "6C577538-A35D-410E-8532-D8AC498E47A9";

const alertB =
  "6A042882-DC13-4621-989A-8B294E1B8597";

// =====================================================
// DEVICE / SENSOR / RULE TEST FIXTURES
// =====================================================

const deviceA =
  "B4000001-0000-4000-8000-000000000001";

const deviceB =
  "B4000001-0000-4000-8000-000000000002";

const sensorA =
  "B5000001-0000-4000-8000-000000000001";

const sensorB =
  "B5000001-0000-4000-8000-000000000002";

const ruleA =
  "B6000001-0000-4000-8000-000000000001";

const ruleB =
  "B6000001-0000-4000-8000-000000000002";

const ruleC =
  "B6000001-0000-4000-8000-000000000003";

// =====================================================
// IDEMPOTENCY KEYS
// =====================================================

const createAlertKey =
  "alerts-integration-create-2026-11-21";

const outboxAlertKey =
  "alerts-integration-outbox-2026-11-21";

const memberAlertKey =
  "alerts-integration-member-2026-11-21";

const deniedMemberAlertKey =
  "alerts-integration-member-denied-2026-11-21";

const idempotencyAlertKey =
  "alerts-integration-idempotency-2026-11-21";

const replayAccessAlertKey =
  "alerts-integration-replay-access-2026-11-21";

const viewerAlertKey =
  "alerts-integration-viewer-2026-11-21";

const deviceSensorRuleAlertKey =
  "alerts-integration-device-sensor-rule-2026-11-21";

const cleanupKeys = [
  createAlertKey,
  outboxAlertKey,
  memberAlertKey,
  deniedMemberAlertKey,
  idempotencyAlertKey,
  replayAccessAlertKey,
  viewerAlertKey,
  deviceSensorRuleAlertKey,
];

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

// =====================================================
// HTTP HELPERS
// =====================================================

function getAlerts(userToken: string) {
  return request(app)
    .get("/api/v1/alerts")
    .query({ organizationId })
    .set("Authorization", `Bearer ${userToken}`);
}

function getAlert(userToken: string, alertId: string) {
  return request(app)
    .get(`/api/v1/alerts/${alertId}`)
    .query({ organizationId })
    .set("Authorization", `Bearer ${userToken}`);
}

function createAlert(
  userToken: string,
  data: Record<string, unknown>
) {
  return request(app)
    .post("/api/v1/alerts")
    .query({ organizationId })
    .set("Authorization", `Bearer ${userToken}`)
    .send(data);
}

function acknowledgeAlert(userToken: string, alertId: string) {
  return request(app)
    .patch(`/api/v1/alerts/${alertId}/acknowledge`)
    .query({ organizationId })
    .set("Authorization", `Bearer ${userToken}`);
}

function resolveAlert(userToken: string, alertId: string) {
  return request(app)
    .patch(`/api/v1/alerts/${alertId}/resolve`)
    .query({ organizationId })
    .set("Authorization", `Bearer ${userToken}`);
}

// =====================================================
// DATABASE FIXTURE SETUP
// =====================================================

async function createRelationshipFixtures() {
  const pool = await getDatabase();

  // Device A belongs to Property A.
  await pool
    .request()
    .input("deviceId", sql.UniqueIdentifier, deviceA)
    .input("organizationId", sql.UniqueIdentifier, organizationId)
    .input("propertyId", sql.UniqueIdentifier, propertyA)
    .input("deviceName", sql.NVarChar(150), "Alerts Test Device A")
    .input("serialNumber", sql.NVarChar(150), "PIQ-ALERT-TEST-DEVICE-A")
    .input("deviceType", sql.NVarChar(50), "water_leak")
    .query(`
      INSERT INTO dbo.Devices (
        DeviceId,
        OrganizationId,
        PropertyId,
        DeviceName,
        SerialNumber,
        DeviceType,
        Status
      )
      VALUES (
        @deviceId,
        @organizationId,
        @propertyId,
        @deviceName,
        @serialNumber,
        @deviceType,
        'online'
      );
    `);

  // Device B belongs to Property B.
  await pool
    .request()
    .input("deviceId", sql.UniqueIdentifier, deviceB)
    .input("organizationId", sql.UniqueIdentifier, organizationId)
    .input("propertyId", sql.UniqueIdentifier, propertyB)
    .input("deviceName", sql.NVarChar(150), "Alerts Test Device B")
    .input("serialNumber", sql.NVarChar(150), "PIQ-ALERT-TEST-DEVICE-B")
    .input("deviceType", sql.NVarChar(50), "temperature")
    .query(`
      INSERT INTO dbo.Devices (
        DeviceId,
        OrganizationId,
        PropertyId,
        DeviceName,
        SerialNumber,
        DeviceType,
        Status
      )
      VALUES (
        @deviceId,
        @organizationId,
        @propertyId,
        @deviceName,
        @serialNumber,
        @deviceType,
        'online'
      );
    `);

  // Sensor A belongs to Device A.
  await pool
    .request()
    .input("sensorId", sql.UniqueIdentifier, sensorA)
    .input("deviceId", sql.UniqueIdentifier, deviceA)
    .query(`
      INSERT INTO dbo.Sensors (
        SensorId,
        DeviceId,
        SensorName,
        SensorType,
        Status
      )
      VALUES (
        @sensorId,
        @deviceId,
        'Alerts Test Water Sensor A',
        'water_leak',
        'active'
      );
    `);

  // Sensor B belongs to Device B.
  await pool
    .request()
    .input("sensorId", sql.UniqueIdentifier, sensorB)
    .input("deviceId", sql.UniqueIdentifier, deviceB)
    .query(`
      INSERT INTO dbo.Sensors (
        SensorId,
        DeviceId,
        SensorName,
        SensorType,
        Status
      )
      VALUES (
        @sensorId,
        @deviceId,
        'Alerts Test Temperature Sensor B',
        'temperature',
        'active'
      );
    `);

  // Rule A: valid rule for Property A and Sensor A.
  await pool
    .request()
    .input("ruleId", sql.UniqueIdentifier, ruleA)
    .input("organizationId", sql.UniqueIdentifier, organizationId)
    .input("propertyId", sql.UniqueIdentifier, propertyA)
    .input("sensorId", sql.UniqueIdentifier, sensorA)
    .query(`
      INSERT INTO dbo.AlertRules (
        AlertRuleId,
        OrganizationId,
        PropertyId,
        SensorId,
        RuleName,
        ConditionType,
        ThresholdValue,
        Severity,
        IsEnabled
      )
      VALUES (
        @ruleId,
        @organizationId,
        @propertyId,
        @sensorId,
        'Alerts Test Valid Rule',
        'threshold',
        10,
        'warning',
        1
      );
    `);

  // Rule B: belongs to Property B and Sensor B.
  await pool
    .request()
    .input("ruleId", sql.UniqueIdentifier, ruleB)
    .input("organizationId", sql.UniqueIdentifier, organizationId)
    .input("propertyId", sql.UniqueIdentifier, propertyB)
    .input("sensorId", sql.UniqueIdentifier, sensorB)
    .query(`
      INSERT INTO dbo.AlertRules (
        AlertRuleId,
        OrganizationId,
        PropertyId,
        SensorId,
        RuleName,
        ConditionType,
        ThresholdValue,
        Severity,
        IsEnabled
      )
      VALUES (
        @ruleId,
        @organizationId,
        @propertyId,
        @sensorId,
        'Alerts Test Property B Rule',
        'threshold',
        20,
        'warning',
        1
      );
    `);

  // Rule C: belongs to Property A but references Sensor B.
  // This allows us to test a sensor/rule mismatch.
  await pool
    .request()
    .input("ruleId", sql.UniqueIdentifier, ruleC)
    .input("organizationId", sql.UniqueIdentifier, organizationId)
    .input("propertyId", sql.UniqueIdentifier, propertyA)
    .input("sensorId", sql.UniqueIdentifier, sensorB)
    .query(`
      INSERT INTO dbo.AlertRules (
        AlertRuleId,
        OrganizationId,
        PropertyId,
        SensorId,
        RuleName,
        ConditionType,
        ThresholdValue,
        Severity,
        IsEnabled
      )
      VALUES (
        @ruleId,
        @organizationId,
        @propertyId,
        @sensorId,
        'Alerts Test Sensor Mismatch Rule',
        'threshold',
        30,
        'warning',
        1
      );
    `);
}

// =====================================================
// DATABASE FIXTURE CLEANUP
// =====================================================

async function cleanupRelationshipFixtures() {
  const pool = await getDatabase();

  // Alerts must be removed before their referenced rules,
  // sensors, and devices.
  await pool
    .request()
    .input("ruleA", sql.UniqueIdentifier, ruleA)
    .input("ruleB", sql.UniqueIdentifier, ruleB)
    .input("ruleC", sql.UniqueIdentifier, ruleC)
    .input("deviceA", sql.UniqueIdentifier, deviceA)
    .input("deviceB", sql.UniqueIdentifier, deviceB)
    .input("sensorA", sql.UniqueIdentifier, sensorA)
    .input("sensorB", sql.UniqueIdentifier, sensorB)
    .query(`
      DELETE FROM dbo.Alerts
      WHERE
        AlertRuleId IN (@ruleA, @ruleB, @ruleC)
        OR DeviceId IN (@deviceA, @deviceB)
        OR SensorId IN (@sensorA, @sensorB);

      DELETE FROM dbo.AlertRules
      WHERE AlertRuleId IN (@ruleA, @ruleB, @ruleC);

      DELETE FROM dbo.Sensors
      WHERE SensorId IN (@sensorA, @sensorB);

      DELETE FROM dbo.Devices
      WHERE DeviceId IN (@deviceA, @deviceB);
    `);
}

// =====================================================
// TEST SUITE
// =====================================================

describe("PropertyIQ alert authorization", () => {
  beforeAll(async () => {
    await createRelationshipFixtures();
  });

  beforeEach(async () => {
    const pool = await getDatabase();

    await pool
      .request()
      .input("alertA", sql.UniqueIdentifier, alertA)
      .input("alertB", sql.UniqueIdentifier, alertB)
      .query(`
        UPDATE dbo.Alerts
        SET
          Status = 'open',
          AcknowledgedAt = NULL,
          ResolvedAt = NULL
        WHERE AlertId IN (@alertA, @alertB);
      `);
  });

  afterAll(async () => {
    const pool = await getDatabase();

    // Delete test alerts and their corresponding outbox events.
    await pool
      .request()
      .input(
        "organizationId",
        sql.UniqueIdentifier,
        organizationId
      )
      .input("createKey", sql.NVarChar(255), createAlertKey)
      .input("outboxKey", sql.NVarChar(255), outboxAlertKey)
      .input("memberKey", sql.NVarChar(255), memberAlertKey)
      .input("deniedMemberKey", sql.NVarChar(255), deniedMemberAlertKey)
      .input("idempotencyKey", sql.NVarChar(255), idempotencyAlertKey)
      .input("replayAccessKey", sql.NVarChar(255), replayAccessAlertKey)
      .input("viewerKey", sql.NVarChar(255), viewerAlertKey)
      .input(
        "relationshipKey",
        sql.NVarChar(255),
        deviceSensorRuleAlertKey
      )
      .query(`
        DELETE A
        FROM dbo.Alerts A
        INNER JOIN dbo.NotificationOutbox N
          ON N.AggregateId = A.AlertId
        WHERE
          N.OrganizationId = @organizationId
          AND N.IdempotencyKey IN (
            @createKey,
            @outboxKey,
            @memberKey,
            @deniedMemberKey,
            @idempotencyKey,
            @replayAccessKey,
            @viewerKey,
            @relationshipKey
          );

        DELETE FROM dbo.NotificationOutbox
        WHERE
          OrganizationId = @organizationId
          AND IdempotencyKey IN (
            @createKey,
            @outboxKey,
            @memberKey,
            @deniedMemberKey,
            @idempotencyKey,
            @replayAccessKey,
            @viewerKey,
            @relationshipKey
          );
      `);

    await cleanupRelationshipFixtures();
  });

  // =====================================================
  // ALERT LISTING
  // =====================================================

  it("allows Owner to view alerts from both properties", async () => {
    const response = await getAlerts(tokens.owner);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);

    const ids = response.body.data.map(
      (alert: { alertId: string }) =>
        alert.alertId.toUpperCase()
    );

    expect(ids).toContain(alertA);
    expect(ids).toContain(alertB);
  });

  it("allows Administrator to view alerts from both properties", async () => {
    const response = await getAlerts(tokens.administrator);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
  });

  it("restricts Member to alerts on assigned Property A", async () => {
    const response = await getAlerts(tokens.member);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(
      response.body.data[0].alertId.toUpperCase()
    ).toBe(alertA);
  });

  it("restricts Viewer to alerts on assigned Property A", async () => {
    const response = await getAlerts(tokens.viewer);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(
      response.body.data[0].alertId.toUpperCase()
    ).toBe(alertA);
  });

  // =====================================================
  // ALERT RETRIEVAL
  // =====================================================

  it("prevents Member from retrieving Property B alert directly", async () => {
    const response = await getAlert(tokens.member, alertB);

    expect(response.status).toBe(404);
  });

  it("prevents Viewer from retrieving Property B alert directly", async () => {
    const response = await getAlert(tokens.viewer, alertB);

    expect(response.status).toBe(404);
  });

  // =====================================================
  // MANUAL ALERT CREATION
  // =====================================================

  it("allows Owner to create a manual alert", async () => {
    const response = await createAlert(tokens.owner, {
      propertyId: propertyA,
      title: "Integration Test Manual Alert",
      message: "Created through the manual alert API.",
      severity: "warning",
      idempotencyKey: createAlertKey,
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.title).toBe(
      "Integration Test Manual Alert"
    );
  });

  it("creates a notification outbox event for a manual alert", async () => {
    const pool = await getDatabase();

    const response = await createAlert(tokens.owner, {
      propertyId: propertyA,
      title: "Integration Test Outbox Alert",
      message: "Verify transactional notification event creation.",
      severity: "critical",
      idempotencyKey: outboxAlertKey,
    });

    expect(response.status).toBe(201);

    const result = await pool
      .request()
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .input("idempotencyKey", sql.NVarChar(255), outboxAlertKey)
      .query(`
        SELECT
          EventType,
          AggregateType,
          AggregateId,
          IdempotencyKey
        FROM dbo.NotificationOutbox
        WHERE
          OrganizationId = @organizationId
          AND IdempotencyKey = @idempotencyKey;
      `);

    expect(result.recordset).toHaveLength(1);
    expect(result.recordset[0].EventType).toBe("alert.created");
    expect(result.recordset[0].AggregateType).toBe("alert");
    expect(
      result.recordset[0].AggregateId.toUpperCase()
    ).toBe(response.body.data.alertId.toUpperCase());
  });

  it("allows Member to create an alert on assigned Property A", async () => {
    const response = await createAlert(tokens.member, {
      propertyId: propertyA,
      title: "Member Property A Alert",
      message: "Member is assigned to this property.",
      severity: "warning",
      idempotencyKey: memberAlertKey,
    });

    expect(response.status).toBe(201);
    expect(response.body.data.propertyId.toUpperCase()).toBe(
      propertyA
    );
  });

  it("prevents Member from creating an alert on unassigned Property B", async () => {
    const response = await createAlert(tokens.member, {
      propertyId: propertyB,
      title: "Unauthorized Property B Alert",
      message: "Member should not have access to this property.",
      severity: "warning",
      idempotencyKey: deniedMemberAlertKey,
    });

    expect(response.status).toBe(403);
  });

  it("prevents Viewer from creating manual alerts", async () => {
    const response = await createAlert(tokens.viewer, {
      propertyId: propertyA,
      title: "Viewer Should Not Create This",
      message: "This request should be rejected.",
      severity: "warning",
      idempotencyKey: viewerAlertKey,
    });

    expect(response.status).toBe(403);
  });

  it("rejects manual alert creation with invalid input", async () => {
    const response = await createAlert(tokens.owner, {
      propertyId: "not-a-valid-guid",
      title: "",
      severity: "urgent",
      idempotencyKey: "",
    });

    expect(response.status).toBe(400);
  });

  // =====================================================
  // DEVICE / SENSOR / ALERT RULE VALIDATION
  // =====================================================

  it("creates an alert with a valid Device, Sensor, and Alert Rule", async () => {
    const response = await createAlert(tokens.owner, {
      propertyId: propertyA,
      deviceId: deviceA,
      sensorId: sensorA,
      alertRuleId: ruleA,
      title: "Valid Device Sensor Rule Alert",
      message: "All device relationships are valid.",
      severity: "warning",
      idempotencyKey: deviceSensorRuleAlertKey,
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.propertyId.toUpperCase()).toBe(propertyA);
    expect(response.body.data.deviceId.toUpperCase()).toBe(deviceA);
    expect(response.body.data.sensorId.toUpperCase()).toBe(sensorA);
    expect(response.body.data.alertRuleId.toUpperCase()).toBe(ruleA);
  });

  it("rejects a Device belonging to a different property", async () => {
    const response = await createAlert(tokens.owner, {
      propertyId: propertyA,
      deviceId: deviceB,
      title: "Invalid Device Property Alert",
      message: "Device B belongs to Property B.",
      severity: "warning",
      idempotencyKey: "alerts-invalid-device-property-2026-11-21",
    });

expect(response.status).toBe(400);  });

  it("rejects a Sensor that does not belong to the supplied Device", async () => {
    const response = await createAlert(tokens.owner, {
      propertyId: propertyA,
      deviceId: deviceA,
      sensorId: sensorB,
      title: "Invalid Sensor Device Alert",
      message: "Sensor B belongs to Device B.",
      severity: "warning",
      idempotencyKey: "alerts-invalid-sensor-device-2026-11-21",
    });

  expect(response.status).toBe(400);
  });

  it("rejects an Alert Rule belonging to a different property", async () => {
    const response = await createAlert(tokens.owner, {
      propertyId: propertyA,
      alertRuleId: ruleB,
      title: "Invalid Alert Rule Property",
      message: "Rule B belongs to Property B.",
      severity: "warning",
      idempotencyKey: "alerts-invalid-rule-property-2026-11-21",
    });
expect(response.status).toBe(400);
  });

  it("rejects an Alert Rule referencing a different Sensor", async () => {
    const response = await createAlert(tokens.owner, {
      propertyId: propertyA,
      deviceId: deviceA,
      sensorId: sensorA,
      alertRuleId: ruleC,
      title: "Invalid Alert Rule Sensor",
      message: "Rule C references Sensor B.",
      severity: "warning",
      idempotencyKey: "alerts-invalid-rule-sensor-2026-11-21",
    });
expect(response.status).toBe(400);
  });

  // =====================================================
  // IDEMPOTENCY
  // =====================================================

  it("does not create duplicate alerts when an idempotency key is reused", async () => {
    const data = {
      propertyId: propertyA,
      title: "Integration Test Idempotency Alert",
      message: "This alert should only be created once.",
      severity: "warning",
      idempotencyKey: idempotencyAlertKey,
    };

    const firstResponse = await createAlert(tokens.owner, data);
    const secondResponse = await createAlert(tokens.owner, data);

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);

    expect(secondResponse.body.data.alertId).toBe(
      firstResponse.body.data.alertId
    );

    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .input("idempotencyKey", sql.NVarChar(255), idempotencyAlertKey)
      .query(`
        SELECT COUNT(*) AS Total
        FROM dbo.Alerts A
        INNER JOIN dbo.NotificationOutbox N
          ON N.AggregateId = A.AlertId
        WHERE
          N.OrganizationId = @organizationId
          AND N.IdempotencyKey = @idempotencyKey;
      `);

    expect(result.recordset[0].Total).toBe(1);
  });

  it("does not allow an idempotency replay to bypass property access", async () => {
    const data = {
      propertyId: propertyB,
      title: "Owner Property B Replay Test",
      message: "Member must not replay this alert.",
      severity: "warning",
      idempotencyKey: replayAccessAlertKey,
    };

    const ownerResponse = await createAlert(tokens.owner, data);

    expect(ownerResponse.status).toBe(201);

    const memberResponse = await createAlert(tokens.member, data);

    expect(memberResponse.status).toBe(403);
  });

  // =====================================================
  // ALERT STATUS CHANGES
  // =====================================================

  it("allows Member to acknowledge an alert on assigned Property A", async () => {
    const response = await acknowledgeAlert(tokens.member, alertA);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("acknowledged");
  });

  it("allows Member to resolve an alert on assigned Property A", async () => {
    const response = await resolveAlert(tokens.member, alertA);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("resolved");
  });

  it("prevents Viewer from acknowledging alerts", async () => {
    const response = await acknowledgeAlert(tokens.viewer, alertA);

    expect(response.status).toBe(403);
  });

  it("prevents Viewer from resolving alerts", async () => {
    const response = await resolveAlert(tokens.viewer, alertA);

    expect(response.status).toBe(403);
  });

  it("prevents Member from acknowledging Property B alerts", async () => {
    const response = await acknowledgeAlert(tokens.member, alertB);

    expect(response.status).toBe(404);
  });

  it("prevents Member from resolving Property B alerts", async () => {
    const response = await resolveAlert(tokens.member, alertB);

    expect(response.status).toBe(404);
  });

  it("allows Owner to acknowledge alerts", async () => {
    const response = await acknowledgeAlert(tokens.owner, alertA);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("acknowledged");
  });

  it("allows Administrator to resolve alerts", async () => {
    const response = await resolveAlert(tokens.administrator, alertB);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("resolved");
  });
});
