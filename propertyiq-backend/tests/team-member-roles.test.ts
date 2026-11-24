
import {
  afterAll,
  describe,
  expect,
  it,
} from "vitest";

import request from "supertest";
import jwt from "jsonwebtoken";

import app from "../src/app";
import { authConfig } from "../src/config/auth";
import { getDatabase, sql } from "../src/config/database";

// =====================================================
// TEST ORGANIZATION
// =====================================================

const organizationId =
  "4587318B-7DA1-482E-B0B7-587B9A26C7D8";

// =====================================================
// TEST MEMBERSHIPS
// =====================================================

const accounts = {
  owner: {
    userId: "08281964-BFA4-4B29-86AC-65FE96A8AECE",
    membershipId: "FEF9B2ED-6C14-4716-8C0A-EFD7720F960E",
  },

  administrator: {
    userId: "62026EEE-8D8E-477A-A33E-A057D8F505F0",
    membershipId: "D38E23A2-72DD-4CBA-AAF7-1C60D77D0650",
  },

  member: {
    userId: "53A8EC9B-EE87-4577-A59B-985CA1B252E8",
    membershipId: "A17328BB-02BD-4A2A-A9CF-D79F180B65BA",
  },

  viewer: {
    userId: "3E2BF33C-A551-4371-974A-B31F4DF838A1",
    membershipId: "DE1E339C-3F5F-41C0-83BF-76FB18E2FFF8",
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
// UPDATE MEMBER ROLE
// =====================================================

function updateMemberRole(
  userId: string,
  membershipId: string,
  role: string
) {
  return request(app)
    .patch(
      `/api/v1/teams/members/${membershipId}/role`
    )
    .query({ organizationId })
    .set(
      "Authorization",
      `Bearer ${createAccessToken(userId)}`
    )
    .send({ role });
}

// =====================================================
// CLEANUP
// Restore original roles regardless of test outcome.
// =====================================================

afterAll(async () => {
  const pool = await getDatabase();

  await pool
    .request()
    .input(
      "OwnerMembershipId",
      sql.UniqueIdentifier,
      accounts.owner.membershipId
    )
    .input(
      "AdministratorMembershipId",
      sql.UniqueIdentifier,
      accounts.administrator.membershipId
    )
    .input(
      "MemberMembershipId",
      sql.UniqueIdentifier,
      accounts.member.membershipId
    )
    .input(
      "ViewerMembershipId",
      sql.UniqueIdentifier,
      accounts.viewer.membershipId
    )
    .input(
      "OrganizationId",
      sql.UniqueIdentifier,
      organizationId
    )
    .query(`
      UPDATE dbo.Memberships
      SET Role = 'Owner'
      WHERE MembershipId = @OwnerMembershipId
        AND OrganizationId = @OrganizationId;

      UPDATE dbo.Memberships
      SET Role = 'Administrator'
      WHERE MembershipId = @AdministratorMembershipId
        AND OrganizationId = @OrganizationId;

      UPDATE dbo.Memberships
      SET Role = 'Member'
      WHERE MembershipId = @MemberMembershipId
        AND OrganizationId = @OrganizationId;

      UPDATE dbo.Memberships
      SET Role = 'Viewer'
      WHERE MembershipId = @ViewerMembershipId
        AND OrganizationId = @OrganizationId;
    `);
});

// =====================================================
// TEAM MEMBER ROLE TESTS
// =====================================================

describe("PropertyIQ Team Management member roles", () => {

  // ===================================================
  // OWNER PERMISSIONS
  // ===================================================

  it("allows Owner to promote a Member to Administrator", async () => {
    const response = await updateMemberRole(
      accounts.owner.userId,
      accounts.member.membershipId,
      "Administrator"
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const restoreResponse = await updateMemberRole(
      accounts.owner.userId,
      accounts.member.membershipId,
      "Member"
    );

    expect(restoreResponse.status).toBe(200);
  });

  it("allows Owner to change a Member to Viewer", async () => {
    const response = await updateMemberRole(
      accounts.owner.userId,
      accounts.member.membershipId,
      "Viewer"
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const restoreResponse = await updateMemberRole(
      accounts.owner.userId,
      accounts.member.membershipId,
      "Member"
    );

    expect(restoreResponse.status).toBe(200);
  });

  it("allows Owner to change an Administrator to Member", async () => {
    const response = await updateMemberRole(
      accounts.owner.userId,
      accounts.administrator.membershipId,
      "Member"
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const restoreResponse = await updateMemberRole(
      accounts.owner.userId,
      accounts.administrator.membershipId,
      "Administrator"
    );

    expect(restoreResponse.status).toBe(200);
  });

  // ===================================================
  // ADMINISTRATOR PERMISSIONS
  // ===================================================

  it("allows Administrator to change a Member to Viewer", async () => {
    const response = await updateMemberRole(
      accounts.administrator.userId,
      accounts.member.membershipId,
      "Viewer"
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const restoreResponse = await updateMemberRole(
      accounts.owner.userId,
      accounts.member.membershipId,
      "Member"
    );

    expect(restoreResponse.status).toBe(200);
  });

  it("allows Administrator to change a Viewer to Member", async () => {
    const response = await updateMemberRole(
      accounts.administrator.userId,
      accounts.viewer.membershipId,
      "Member"
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const restoreResponse = await updateMemberRole(
      accounts.owner.userId,
      accounts.viewer.membershipId,
      "Viewer"
    );

    expect(restoreResponse.status).toBe(200);
  });

  it("prevents Administrator from promoting a Member to Administrator", async () => {
    const response = await updateMemberRole(
      accounts.administrator.userId,
      accounts.member.membershipId,
      "Administrator"
    );

   expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  // ===================================================
  // MEMBER AND VIEWER RESTRICTIONS
  // ===================================================

  it("prevents Member from changing another member's role", async () => {
    const response = await updateMemberRole(
      accounts.member.userId,
      accounts.viewer.membershipId,
      "Member"
    );

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("prevents Viewer from changing another member's role", async () => {
    const response = await updateMemberRole(
      accounts.viewer.userId,
      accounts.member.membershipId,
      "Viewer"
    );

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  // ===================================================
  // PROTECTED MEMBERSHIPS
  // ===================================================

  it("prevents Owner from changing their own role", async () => {
    const response = await updateMemberRole(
      accounts.owner.userId,
      accounts.owner.membershipId,
      "Member"
    );

   expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("prevents Administrator from changing their own role", async () => {
    const response = await updateMemberRole(
      accounts.administrator.userId,
      accounts.administrator.membershipId,
      "Member"
    );

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("prevents Owner from assigning the Owner role", async () => {
    const response = await updateMemberRole(
      accounts.owner.userId,
      accounts.member.membershipId,
      "Owner"
    );

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  // ===================================================
  // VALIDATION
  // ===================================================

  it("rejects an invalid role", async () => {
    const response = await updateMemberRole(
      accounts.owner.userId,
      accounts.member.membershipId,
      "SuperAdministrator"
    );

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("rejects an invalid membership ID", async () => {
    const response = await updateMemberRole(
      accounts.owner.userId,
      "invalid-membership-id",
      "Member"
    );

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("does not update a nonexistent membership", async () => {
    const response = await updateMemberRole(
      accounts.owner.userId,
      "11111111-1111-4111-8111-111111111111",
      "Member"
    );

  expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });
});
