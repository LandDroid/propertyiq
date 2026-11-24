
import {
  afterAll,
  beforeAll,
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

  externalUser: {
    userId: "0D8651D6-6B16-4F67-B9E7-8236D46C6A41",
  },
};

// =====================================================
// UNIQUE TEST EMAILS
// =====================================================

const testRunId = Date.now();

const emails = {
  ownerAdministrator:
    `team-owner-admin-${testRunId}@example.com`,

  ownerMember:
    `team-owner-member-${testRunId}@example.com`,

  ownerViewer:
    `team-owner-viewer-${testRunId}@example.com`,

  administratorMember:
    `team-admin-member-${testRunId}@example.com`,

  administratorViewer:
    `team-admin-viewer-${testRunId}@example.com`,

  administratorAdmin:
    `team-admin-admin-${testRunId}@example.com`,

  ownerRevocation:
    `team-owner-revoke-${testRunId}@example.com`,

  administratorRevocation:
    `team-admin-revoke-${testRunId}@example.com`,

  protectedInvitation:
    `team-protected-invite-${testRunId}@example.com`,

  duplicateInvitation:
    `team-duplicate-invite-${testRunId}@example.com`,

  expiredAcceptance:
    `team-expired-${testRunId}@example.com`,

  revokedAcceptance:
    `team-revoked-${testRunId}@example.com`,

  newUserAcceptance:
    `team-new-user-${testRunId}@example.com`,

  authenticatedRegistration:
    `team-auth-registration-${testRunId}@example.com`,

  singleUseAcceptance:
    `team-single-use-${testRunId}@example.com`,
};

const testEmails = Object.values(emails);

// =====================================================
// TEST STATE
// =====================================================

let externalUserEmail = "";

const createdMembershipIds: string[] = [];
const createdUserIds: string[] = [];

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

function authorizationHeader(userId: string) {
  return `Bearer ${createAccessToken(userId)}`;
}

// =====================================================
// CREATE INVITATION
// =====================================================

function createInvitation(
  userId: string,
  email: string,
  role: string
) {
  return request(app)
    .post("/api/v1/teams/invitations")
    .set(
      "Authorization",
      authorizationHeader(userId)
    )
    .send({
      organizationId,
      email,
      role,
    });
}

// =====================================================
// ACCEPT INVITATION
// =====================================================

function acceptInvitation(
  token: string,
  options?: {
    userId?: string;
    firstName?: string;
    lastName?: string;
    password?: string;
  }
) {
  const req = request(app)
    .post("/api/v1/teams/invitations/accept");

  if (options?.userId) {
    req.set(
      "Authorization",
      authorizationHeader(options.userId)
    );
  }

  return req.send({
    token,
    firstName: options?.firstName,
    lastName: options?.lastName,
    password: options?.password,
  });
}

// =====================================================
// REVOKE INVITATION
// =====================================================

function revokeInvitation(
  userId: string,
  invitationId: string
) {
  return request(app)
    .post(
      `/api/v1/teams/invitations/${invitationId}/revoke`
    )
    .query({ organizationId })
    .set(
      "Authorization",
      authorizationHeader(userId)
    );
}

// =====================================================
// DELETE TEST INVITATION
//
// Removes historical invitation records between
// existing-user acceptance scenarios so each test
// starts with a clean invitation state.
// =====================================================

async function deleteInvitation(invitationId: string) {
  const pool = await getDatabase();

  await pool
    .request()
    .input(
      "InvitationId",
      sql.UniqueIdentifier,
      invitationId
    )
    .input(
      "OrganizationId",
      sql.UniqueIdentifier,
      organizationId
    )
    .query(`
      DELETE FROM dbo.TeamInvitations
      WHERE TeamInvitationId = @InvitationId
        AND OrganizationId = @OrganizationId;
    `);
}

// =====================================================
// REMOVE TEST MEMBERSHIP
// =====================================================

async function removeMembership(membershipId: string) {
  const pool = await getDatabase();

  await pool
    .request()
    .input(
      "MembershipId",
      sql.UniqueIdentifier,
      membershipId
    )
    .query(`
      DELETE FROM dbo.UserPropertyAccess
      WHERE MembershipId = @MembershipId;

      DELETE FROM dbo.Memberships
      WHERE MembershipId = @MembershipId;
    `);
}

// =====================================================
// SETUP
// =====================================================

beforeAll(async () => {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input(
      "UserId",
      sql.UniqueIdentifier,
      accounts.externalUser.userId
    )
    .query(`
      SELECT Email
      FROM dbo.Users
      WHERE UserId = @UserId
        AND LOWER(LTRIM(RTRIM(Status))) = 'active';
    `);

  if (result.recordset.length === 0) {
    throw new Error(
      "The external test account was not found or is inactive."
    );
  }

  externalUserEmail = result.recordset[0].Email;
});

// =====================================================
// CLEANUP
// =====================================================

afterAll(async () => {
  const pool = await getDatabase();

  // Remove memberships created by successful
  // invitation acceptance tests.
  for (const membershipId of createdMembershipIds) {
    await pool
      .request()
      .input(
        "MembershipId",
        sql.UniqueIdentifier,
        membershipId
      )
      .query(`
        DELETE FROM dbo.UserPropertyAccess
        WHERE MembershipId = @MembershipId;

        DELETE FROM dbo.Memberships
        WHERE MembershipId = @MembershipId;
      `);
  }

  // Remove invitations created by this test run.
  const invitationCleanup = pool.request();

  invitationCleanup.input(
    "OrganizationId",
    sql.UniqueIdentifier,
    organizationId
  );

  const cleanupEmails = [
    ...testEmails,
    externalUserEmail,
  ];

  const placeholders = cleanupEmails.map((email, index) => {
    const parameterName = `Email${index}`;

    invitationCleanup.input(
      parameterName,
      sql.NVarChar(255),
      email
    );

    return `@${parameterName}`;
  });

  await invitationCleanup.query(`
    DELETE FROM dbo.TeamInvitations
    WHERE OrganizationId = @OrganizationId
      AND Email IN (${placeholders.join(", ")});
  `);

  // Remove newly registered test users.
  for (const userId of createdUserIds) {
    await pool
      .request()
      .input(
        "UserId",
        sql.UniqueIdentifier,
        userId
      )
      .query(`
        DELETE FROM dbo.Users
        WHERE UserId = @UserId;
      `);
  }
});

// =====================================================
// INVITATION TESTS
// =====================================================

describe("PropertyIQ Team Management invitations", () => {

  // ===================================================
  // OWNER INVITATIONS
  // ===================================================

  it("allows Owner to invite an Administrator", async () => {
    const response = await createInvitation(
      accounts.owner.userId,
      emails.ownerAdministrator,
      "Administrator"
    );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    expect(
      response.body.data.invitation.invitationId
    ).toBeTruthy();

    expect(
      response.body.data.invitation.role
    ).toBe("Administrator");

    expect(
      response.body.data.invitationToken
    ).toMatch(/^[a-f0-9]{64}$/);
  });

  it("allows Owner to invite a Member", async () => {
    const response = await createInvitation(
      accounts.owner.userId,
      emails.ownerMember,
      "Member"
    );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.invitation.role).toBe("Member");
  });

  it("allows Owner to invite a Viewer", async () => {
    const response = await createInvitation(
      accounts.owner.userId,
      emails.ownerViewer,
      "Viewer"
    );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.invitation.role).toBe("Viewer");
  });

  // ===================================================
  // ADMINISTRATOR INVITATIONS
  // ===================================================

  it("allows Administrator to invite a Member", async () => {
    const response = await createInvitation(
      accounts.administrator.userId,
      emails.administratorMember,
      "Member"
    );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.invitation.role).toBe("Member");
  });

  it("allows Administrator to invite a Viewer", async () => {
    const response = await createInvitation(
      accounts.administrator.userId,
      emails.administratorViewer,
      "Viewer"
    );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.invitation.role).toBe("Viewer");
  });

  it("prevents Administrator from inviting another Administrator", async () => {
    const response = await createInvitation(
      accounts.administrator.userId,
      emails.administratorAdmin,
      "Administrator"
    );

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  // ===================================================
  // MEMBER AND VIEWER RESTRICTIONS
  // ===================================================

  it("prevents Member from creating invitations", async () => {
    const response = await createInvitation(
      accounts.member.userId,
      emails.administratorAdmin,
      "Member"
    );

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("prevents Viewer from creating invitations", async () => {
    const response = await createInvitation(
      accounts.viewer.userId,
      emails.administratorAdmin,
      "Member"
    );

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  // ===================================================
  // VALIDATION
  // ===================================================

  it("rejects an invalid email address", async () => {
    const response = await createInvitation(
      accounts.owner.userId,
      "not-an-email",
      "Member"
    );

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("rejects an invalid invitation role", async () => {
    const response = await createInvitation(
      accounts.owner.userId,
      `invalid-role-${testRunId}@example.com`,
      "Owner"
    );

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("prevents duplicate pending invitations", async () => {
    const firstResponse = await createInvitation(
      accounts.owner.userId,
      emails.duplicateInvitation,
      "Member"
    );

    expect(firstResponse.status).toBe(201);

    const secondResponse = await createInvitation(
      accounts.owner.userId,
      emails.duplicateInvitation,
      "Member"
    );

    expect(secondResponse.status).toBe(400);
    expect(secondResponse.body.success).toBe(false);
  });

  // ===================================================
  // INVITATION LISTING
  // ===================================================

  it("allows Owner to list organization invitations", async () => {
    const response = await request(app)
      .get("/api/v1/teams/invitations")
      .query({ organizationId })
      .set(
        "Authorization",
        authorizationHeader(accounts.owner.userId)
      );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);

    expect(
      response.body.data.some(
        (invitation: any) =>
          invitation.email === emails.ownerMember
      )
    ).toBe(true);
  });

  // ===================================================
  // INVITATION REVOCATION
  // ===================================================

  it("allows Owner to revoke an Administrator invitation", async () => {
    const createResponse = await createInvitation(
      accounts.owner.userId,
      emails.ownerRevocation,
      "Administrator"
    );

    expect(createResponse.status).toBe(201);

    const invitationId =
      createResponse.body.data.invitation.invitationId;

    const response = await revokeInvitation(
      accounts.owner.userId,
      invitationId
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("allows Administrator to revoke a Member invitation", async () => {
    const createResponse = await createInvitation(
      accounts.administrator.userId,
      emails.administratorRevocation,
      "Member"
    );

    expect(createResponse.status).toBe(201);

    const invitationId =
      createResponse.body.data.invitation.invitationId;

    const response = await revokeInvitation(
      accounts.administrator.userId,
      invitationId
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("prevents Administrator from revoking an Administrator invitation", async () => {
    const createResponse = await createInvitation(
      accounts.owner.userId,
      emails.protectedInvitation,
      "Administrator"
    );

    expect(createResponse.status).toBe(201);

    const invitationId =
      createResponse.body.data.invitation.invitationId;

    const response = await revokeInvitation(
      accounts.administrator.userId,
      invitationId
    );

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("prevents Member from revoking invitations", async () => {
    const createResponse = await createInvitation(
      accounts.owner.userId,
      emails.ownerRevocation,
      "Member"
    );

    expect(createResponse.status).toBe(201);

    const invitationId =
      createResponse.body.data.invitation.invitationId;

    const response = await revokeInvitation(
      accounts.member.userId,
      invitationId
    );

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  // ===================================================
  // INVITATION ACCEPTANCE SECURITY
  // ===================================================

  it("prevents an existing user from accepting without authentication", async () => {
    const createResponse = await createInvitation(
      accounts.owner.userId,
      externalUserEmail,
      "Member"
    );

    expect(createResponse.status).toBe(201);

    const invitationId =
      createResponse.body.data.invitation.invitationId;

    const token =
      createResponse.body.data.invitationToken;

    const response = await acceptInvitation(token);

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain("sign in");

    const revokeResponse = await revokeInvitation(
      accounts.owner.userId,
      invitationId
    );

    expect(revokeResponse.status).toBe(200);

    // Remove the revoked record before the next scenario.
    await deleteInvitation(invitationId);
  });

  it("allows the invited existing user to accept when authenticated", async () => {
    const createResponse = await createInvitation(
      accounts.owner.userId,
      externalUserEmail,
      "Member"
    );

    expect(createResponse.status).toBe(201);

    const invitationId =
      createResponse.body.data.invitation.invitationId;

    const token =
      createResponse.body.data.invitationToken;

    const response = await acceptInvitation(token, {
      userId: accounts.externalUser.userId,
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.data.userId).toBe(
      accounts.externalUser.userId
    );

    expect(response.body.data.organizationId).toBe(
      organizationId
    );

    // Restore the original test account state.
    await removeMembership(
      response.body.data.membershipId
    );

    // Remove the accepted invitation before the next scenario.
    await deleteInvitation(invitationId);
  });

  it("prevents a different authenticated user from accepting an invitation", async () => {
    const createResponse = await createInvitation(
      accounts.owner.userId,
      externalUserEmail,
      "Member"
    );

    expect(createResponse.status).toBe(201);

    const invitationId =
      createResponse.body.data.invitation.invitationId;

    const token =
      createResponse.body.data.invitationToken;

    const response = await acceptInvitation(token, {
      userId: accounts.owner.userId,
    });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain("account");

    // Remove the still-pending invitation after the test.
    await deleteInvitation(invitationId);
  });

  // ===================================================
  // NEW USER REGISTRATION
  // ===================================================

  it("allows a new user to register and accept an invitation without authentication", async () => {
    const createResponse = await createInvitation(
      accounts.owner.userId,
      emails.newUserAcceptance,
      "Member"
    );

    expect(createResponse.status).toBe(201);

    const token =
      createResponse.body.data.invitationToken;

    const response = await acceptInvitation(token, {
      firstName: "Invitation",
      lastName: "Test",
      password: "SecureTestPassword123!",
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.data.email).toBe(
      emails.newUserAcceptance
    );

    expect(response.body.data.organizationId).toBe(
      organizationId
    );

    expect(response.body.data.userId).toBeTruthy();
    expect(response.body.data.membershipId).toBeTruthy();

    createdUserIds.push(response.body.data.userId);

    createdMembershipIds.push(
      response.body.data.membershipId
    );
  });

  it("prevents an authenticated user from creating a new account through an invitation", async () => {
    const createResponse = await createInvitation(
      accounts.owner.userId,
      emails.authenticatedRegistration,
      "Member"
    );

    expect(createResponse.status).toBe(201);

    const token =
      createResponse.body.data.invitationToken;

    const response = await acceptInvitation(token, {
      userId: accounts.owner.userId,
      firstName: "Should",
      lastName: "NotRegister",
      password: "SecureTestPassword123!",
    });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain("Sign out");
  });

  // ===================================================
  // INVITATION EXPIRATION
  // ===================================================

  it("prevents an expired invitation from being accepted", async () => {
    const createResponse = await createInvitation(
      accounts.owner.userId,
      emails.expiredAcceptance,
      "Member"
    );

    expect(createResponse.status).toBe(201);

    const invitationId =
      createResponse.body.data.invitation.invitationId;

    const pool = await getDatabase();

    await pool
      .request()
      .input(
        "InvitationId",
        sql.UniqueIdentifier,
        invitationId
      )
      .query(`
        UPDATE dbo.TeamInvitations
        SET ExpiresAt = DATEADD(DAY, -1, SYSUTCDATETIME())
        WHERE TeamInvitationId = @InvitationId;
      `);

    const response = await acceptInvitation(
      createResponse.body.data.invitationToken,
      {
        firstName: "Expired",
        password: "SecureTestPassword123!",
      }
    );

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("prevents a revoked invitation from being accepted", async () => {
    const createResponse = await createInvitation(
      accounts.owner.userId,
      emails.revokedAcceptance,
      "Member"
    );

    expect(createResponse.status).toBe(201);

    const invitationId =
      createResponse.body.data.invitation.invitationId;

    const token =
      createResponse.body.data.invitationToken;

    const revokeResponse = await revokeInvitation(
      accounts.owner.userId,
      invitationId
    );

    expect(revokeResponse.status).toBe(200);

    const response = await acceptInvitation(token, {
      firstName: "Revoked",
      password: "SecureTestPassword123!",
    });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  // ===================================================
  // SINGLE-USE INVITATION
  // ===================================================

  it("prevents an invitation from being accepted more than once", async () => {
    const createResponse = await createInvitation(
      accounts.owner.userId,
      emails.singleUseAcceptance,
      "Member"
    );

    expect(createResponse.status).toBe(201);

    const token =
      createResponse.body.data.invitationToken;

    const firstResponse = await acceptInvitation(token, {
      firstName: "Single",
      lastName: "Use",
      password: "SecureTestPassword123!",
    });

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.success).toBe(true);

    createdUserIds.push(firstResponse.body.data.userId);

    createdMembershipIds.push(
      firstResponse.body.data.membershipId
    );

    const secondResponse = await acceptInvitation(token, {
      firstName: "Single",
      lastName: "Use",
      password: "SecureTestPassword123!",
    });

    expect(secondResponse.status).toBe(400);
    expect(secondResponse.body.success).toBe(false);
  });
});
