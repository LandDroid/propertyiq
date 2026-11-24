
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

const alertA =
  "6C577538-A35D-410E-8532-D8AC498E47A9";

const alertB =
  "6A042882-DC13-4621-989A-8B294E1B8597";

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

describe("PropertyIQ alert authorization", () => {
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

  it("allows Owner to view alerts from both properties", async () => {
    const response = await getAlerts(tokens.owner);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);

    const ids = response.body.data.map(
      (alert: { alertId: string }) => alert.alertId.toUpperCase()
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
    expect(response.body.data[0].alertId.toUpperCase()).toBe(alertA);
  });

  it("restricts Viewer to alerts on assigned Property A", async () => {
    const response = await getAlerts(tokens.viewer);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].alertId.toUpperCase()).toBe(alertA);
  });

  it("prevents Member from retrieving Property B alert directly", async () => {
    const response = await getAlert(tokens.member, alertB);

    expect(response.status).toBe(404);
  });

  it("prevents Viewer from retrieving Property B alert directly", async () => {
    const response = await getAlert(tokens.viewer, alertB);

    expect(response.status).toBe(404);
  });

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
