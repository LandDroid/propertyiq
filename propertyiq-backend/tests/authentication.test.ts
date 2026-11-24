
import { describe, it, expect } from "vitest";
import request from "supertest";

import app from "../src/app";

describe("PropertyIQ API authentication", () => {
  const protectedEndpoints = [
    "/api/v1/properties",
    "/api/v1/devices",
    "/api/v1/alerts",
    "/api/v1/assets",
    "/api/v1/warranties",
    "/api/v1/maintenance",
    "/api/v1/settings",
  ];

  it.each(protectedEndpoints)(
    "rejects unauthenticated access to %s",
    async (endpoint) => {
      const response = await request(app).get(endpoint);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    }
  );

  it("allows access to the public health endpoint", async () => {
    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
