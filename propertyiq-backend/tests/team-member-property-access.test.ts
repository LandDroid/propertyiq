
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

// =====================================================
// TEST ORGANIZATIONS AND PROPERTIES
// =====================================================

const organizationId =
  "4587318B-7DA1-482E-B0B7-587B9A26C7D8";

const otherOrganizationId =
  "290FE9A8-C8A3-40D7-9592-97E1BEDB04C4";

const propertyAId =
  "2BA345BB-3864-4E83-A0BE-E3B2CC915623";

const propertyBId =
  "AC02E56C-E610-4D54-A274-FC3413F8A9C7";

// =====================================================
// TEST ACCOUNTS
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
// ORIGINAL PROPERTY ASSIGNMENTS
// =====================================================

type PropertyAssignmentSnapshot = {
  membershipId: string;
  propertyId: string;
  grantedByUserId: string;
  createdAt: Date;
};

let originalAssignments: PropertyAssignmentSnapshot[] = [];

let otherOrganizationPropertyId: string | null = null;

// =====================================================
// ACCESS TOKEN
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
// UPDATE PROPERTY ACCESS
// =====================================================

function updatePropertyAccess(
  userId: string,
  membershipId: string,
  propertyIds: string[]
) {
  return request(app)
    .put(`/api/v1/teams/members/${membershipId}/properties`)
    .query({ organizationId })
    .set(
      "Authorization",
      `Bearer ${createAccessToken(userId)}`
    )
    .send({ propertyIds });
}

// =====================================================
// GET PROPERTY ACCESS
// =====================================================

function getPropertyAccess(
  userId: string,
  membershipId: string
) {
  return request(app)
    .get(`/api/v1/teams/members/${membershipId}/properties`)
    .query({ organizationId })
    .set(
      "Authorization",
      `Bearer ${createAccessToken(userId)}`
    );
}

// =====================================================
// RESTORE ORIGINAL ASSIGNMENTS
// =====================================================

async function restoreOriginalAssignments() {
  const pool = await getDatabase();

  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const deleteRequest = new sql.Request(transaction);

    deleteRequest
      .input(
        "MemberMembershipId",
        sql.UniqueIdentifier,
        accounts.member.membershipId
      )
      .input(
        "ViewerMembershipId",
        sql.UniqueIdentifier,
        accounts.viewer.membershipId
      );

    await deleteRequest.query(`
      DELETE FROM dbo.UserPropertyAccess
      WHERE MembershipId IN (
        @MemberMembershipId,
        @ViewerMembershipId
      );
    `);

    for (const assignment of originalAssignments) {
      const insertRequest = new sql.Request(transaction);

      insertRequest
        .input(
          "MembershipId",
          sql.UniqueIdentifier,
          assignment.membershipId
        )
        .input(
          "PropertyId",
          sql.UniqueIdentifier,
          assignment.propertyId
        )
        .input(
          "GrantedByUserId",
          sql.UniqueIdentifier,
          assignment.grantedByUserId
        )
        .input(
          "CreatedAt",
          sql.DateTime2,
          assignment.createdAt
        );

      await insertRequest.query(`
        INSERT INTO dbo.UserPropertyAccess (
          MembershipId,
          PropertyId,
          GrantedByUserId,
          CreatedAt
        )
        VALUES (
          @MembershipId,
          @PropertyId,
          @GrantedByUserId,
          @CreatedAt
        );
      `);
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// =====================================================
// SETUP AND CLEANUP
// =====================================================

beforeAll(async () => {
  const pool = await getDatabase();

  const assignmentsResult = await pool
    .request()
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
    .query(`
      SELECT
        MembershipId AS membershipId,
        PropertyId AS propertyId,
        GrantedByUserId AS grantedByUserId,
        CreatedAt AS createdAt
      FROM dbo.UserPropertyAccess
      WHERE MembershipId IN (
        @MemberMembershipId,
        @ViewerMembershipId
      );
    `);

  originalAssignments = assignmentsResult.recordset;

  const otherPropertyResult = await pool
    .request()
    .input(
      "OrganizationId",
      sql.UniqueIdentifier,
      otherOrganizationId
    )
    .query(`
      SELECT TOP 1 PropertyId AS propertyId
      FROM dbo.Properties
      WHERE OrganizationId = @OrganizationId;
    `);

  otherOrganizationPropertyId =
    otherPropertyResult.recordset[0]?.propertyId ?? null;
});

beforeEach(async () => {
  await restoreOriginalAssignments();
});

afterAll(async () => {
  await restoreOriginalAssignments();
});

// =====================================================
// TEAM MEMBER PROPERTY ACCESS TESTS
// =====================================================

describe("PropertyIQ Team Management property access", () => {

  // ===================================================
  // OWNER PERMISSIONS
  // ===================================================

  it("allows Owner to assign properties to a Member", async () => {
    const response = await updatePropertyAccess(
      accounts.owner.userId,
      accounts.member.membershipId,
      [propertyAId, propertyBId]
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(
      response.body.data.map(
        (assignment: { propertyId: string }) =>
          assignment.propertyId.toUpperCase()
      ).sort()
    ).toEqual(
      [propertyAId, propertyBId].map((id) => id.toUpperCase()).sort()
    );
  });

  it("allows Owner to assign properties to a Viewer", async () => {
    const response = await updatePropertyAccess(
      accounts.owner.userId,
      accounts.viewer.membershipId,
      [propertyAId]
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.data).toHaveLength(1);
    expect(
      response.body.data[0].propertyId.toUpperCase()
    ).toBe(propertyAId.toUpperCase());
  });

  // ===================================================
  // ADMINISTRATOR PERMISSIONS
  // ===================================================

  it("allows Administrator to assign properties to a Member", async () => {
    const response = await updatePropertyAccess(
      accounts.administrator.userId,
      accounts.member.membershipId,
      [propertyAId]
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.data).toHaveLength(1);
    expect(
      response.body.data[0].propertyId.toUpperCase()
    ).toBe(propertyAId.toUpperCase());
  });

  it("allows Administrator to assign properties to a Viewer", async () => {
    const response = await updatePropertyAccess(
      accounts.administrator.userId,
      accounts.viewer.membershipId,
      [propertyBId]
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.data).toHaveLength(1);
    expect(
      response.body.data[0].propertyId.toUpperCase()
    ).toBe(propertyBId.toUpperCase());
  });

  it("prevents Administrator from changing another Administrator's assignments", async () => {
    const response = await updatePropertyAccess(
      accounts.administrator.userId,
      accounts.administrator.membershipId,
      [propertyAId]
    );

   expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  // ===================================================
  // MEMBER AND VIEWER RESTRICTIONS
  // ===================================================

  it("prevents Member from changing property assignments", async () => {
    const response = await updatePropertyAccess(
      accounts.member.userId,
      accounts.viewer.membershipId,
      [propertyAId]
    );

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("prevents Viewer from changing property assignments", async () => {
    const response = await updatePropertyAccess(
      accounts.viewer.userId,
      accounts.member.membershipId,
      [propertyBId]
    );

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  // ===================================================
  // PROPERTY ORGANIZATION VALIDATION
  // ===================================================

  it("rejects properties belonging to another organization", async () => {
    if (!otherOrganizationPropertyId) {
      throw new Error(
        "The other test organization needs at least one property for this test."
      );
    }

    const response = await updatePropertyAccess(
      accounts.owner.userId,
      accounts.member.membershipId,
      [otherOrganizationPropertyId]
    );

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("rejects invalid property IDs", async () => {
    const response = await updatePropertyAccess(
      accounts.owner.userId,
      accounts.member.membershipId,
      ["invalid-property-id"]
    );

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  // ===================================================
  // REPLACEMENT BEHAVIOR
  // ===================================================

  it("replaces existing assignments instead of appending", async () => {
    const firstResponse = await updatePropertyAccess(
      accounts.owner.userId,
      accounts.member.membershipId,
      [propertyAId, propertyBId]
    );

    expect(firstResponse.status).toBe(200);

    const secondResponse = await updatePropertyAccess(
      accounts.owner.userId,
      accounts.member.membershipId,
      [propertyBId]
    );

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.success).toBe(true);

    expect(secondResponse.body.data).toHaveLength(1);
    expect(
      secondResponse.body.data[0].propertyId.toUpperCase()
    ).toBe(propertyBId.toUpperCase());
  });

  it("allows an empty property list to remove all assignments", async () => {
    const firstResponse = await updatePropertyAccess(
      accounts.owner.userId,
      accounts.member.membershipId,
      [propertyAId, propertyBId]
    );

    expect(firstResponse.status).toBe(200);

    const secondResponse = await updatePropertyAccess(
      accounts.owner.userId,
      accounts.member.membershipId,
      []
    );

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.success).toBe(true);
    expect(secondResponse.body.data).toHaveLength(0);

    const getResponse = await getPropertyAccess(
      accounts.owner.userId,
      accounts.member.membershipId
    );

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.data).toHaveLength(0);
  });

  // ===================================================
  // ORGANIZATION ISOLATION
  // ===================================================

  it("does not return assignments for a membership in another organization", async () => {
    const response = await request(app)
      .get(
        `/api/v1/teams/members/${accounts.member.membershipId}/properties`
      )
      .query({ organizationId: otherOrganizationId })
      .set(
        "Authorization",
        `Bearer ${createAccessToken(accounts.owner.userId)}`
      );

 expect(response.status).toBe(403);
expect(response.body.success).toBe(false);
  });
});
