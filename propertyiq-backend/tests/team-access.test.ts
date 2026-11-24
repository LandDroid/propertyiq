
import {
  describe,
  expect,
  it,
} from "vitest";

import request from "supertest";
import jwt from "jsonwebtoken";

import app from "../src/app";
import { authConfig } from "../src/config/auth";

// =====================================================
// TEST ORGANIZATIONS
// =====================================================

const organizationId =
  "4587318B-7DA1-482E-B0B7-587B9A26C7D8";

const otherOrganizationId =
  "290FE9A8-C8A3-40D7-9592-97E1BEDB04C4";

// =====================================================
// TEST ACCOUNTS
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

  otherOrganizationOwner: {
    userId: "0D8651D6-6B16-4F67-B9E7-8236D46C6A41",
  },
};

// =====================================================
// CREATE ACCESS TOKEN
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

// =====================================================
// AUTHENTICATED REQUEST HELPERS
// =====================================================

function getAuthorizationHeader(userId: string) {
  return `Bearer ${createAccessToken(userId)}`;
}

function getTeamMembers(userId: string, targetOrganizationId = organizationId) {
  return request(app)
    .get("/api/v1/teams/members")
    .query({
      organizationId: targetOrganizationId,
    })
    .set(
      "Authorization",
      getAuthorizationHeader(userId)
    );
}

function getTeamInvitations(userId: string, targetOrganizationId = organizationId) {
  return request(app)
    .get("/api/v1/teams/invitations")
    .query({
      organizationId: targetOrganizationId,
    })
    .set(
      "Authorization",
      getAuthorizationHeader(userId)
    );
}

// =====================================================
// TEAM MANAGEMENT AUTHORIZATION TESTS
// =====================================================

describe("PropertyIQ Team Management authorization", () => {

  // ===================================================
  // TEAM MEMBER ACCESS
  // ===================================================

  it("allows Owner to view organization team members", async () => {
    const response = await getTeamMembers(
      accounts.owner.userId
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it("allows Administrator to view organization team members", async () => {
    const response = await getTeamMembers(
      accounts.administrator.userId
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it("allows Member to view organization team members", async () => {
    const response = await getTeamMembers(
      accounts.member.userId
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it("allows Viewer to view organization team members", async () => {
    const response = await getTeamMembers(
      accounts.viewer.userId
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  // ===================================================
  // ORGANIZATION ISOLATION
  // ===================================================

  it("prevents users from accessing another organization's team", async () => {
    const response = await getTeamMembers(
      accounts.otherOrganizationOwner.userId,
      organizationId
    );

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("prevents Owner from accessing another organization's team", async () => {
    const response = await getTeamMembers(
      accounts.owner.userId,
      otherOrganizationId
    );

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  // ===================================================
  // INVITATION MANAGEMENT AUTHORIZATION
  // ===================================================

  it("allows Owner to view team invitations", async () => {
    const response = await getTeamInvitations(
      accounts.owner.userId
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it("allows Administrator to view team invitations", async () => {
    const response = await getTeamInvitations(
      accounts.administrator.userId
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it("prevents Member from viewing team invitations", async () => {
    const response = await getTeamInvitations(
      accounts.member.userId
    );

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("prevents Viewer from viewing team invitations", async () => {
    const response = await getTeamInvitations(
      accounts.viewer.userId
    );

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  // ===================================================
  // AUTHENTICATION
  // ===================================================

  it("rejects unauthenticated requests to team members", async () => {
    const response = await request(app)
      .get("/api/v1/teams/members")
      .query({ organizationId });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("rejects unauthenticated requests to team invitations", async () => {
    const response = await request(app)
      .get("/api/v1/teams/invitations")
      .query({ organizationId });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });
});
