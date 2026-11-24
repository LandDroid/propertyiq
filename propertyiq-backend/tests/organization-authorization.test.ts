
import { describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

import app from "../src/app";
import { authConfig } from "../src/config/auth";

const accounts = {
  demoOwner: {
    userId: "0D8651D6-6B16-4F67-B9E7-8236D46C6A41",
    organizationId: "290FE9A8-C8A3-40D7-9592-97E1BEDB04C4",
  },
  totalPropertyCareOwner: {
    userId: "9F1BACD4-DE03-440E-94AA-E9D3F53089DB",
    organizationId: "3DE17D6F-A061-429F-9700-C2D51C8D29E3",
  },
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

describe("PropertyIQ organization isolation", () => {
  it("prevents the Demo Owner from accessing Total Property Care", async () => {
    const token = createAccessToken(accounts.demoOwner.userId);

    const response = await request(app)
      .get("/api/v1/assets")
      .query({
        organizationId: accounts.totalPropertyCareOwner.organizationId,
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("prevents the Total Property Care Owner from accessing PropertyIQ Demo", async () => {
    const token = createAccessToken(
      accounts.totalPropertyCareOwner.userId
    );

    const response = await request(app)
      .get("/api/v1/assets")
      .query({
        organizationId: accounts.demoOwner.organizationId,
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });
});
