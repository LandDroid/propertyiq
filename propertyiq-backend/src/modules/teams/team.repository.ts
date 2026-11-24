
import { getDatabase, sql } from "../../config/database";

// =====================================================
// TYPES
// =====================================================

export type TeamAccessContext = {
  organizationId: string;
  membershipId: string;
  role: string;
  userId?: string;
};

export type CreateInvitationInput = {
  email: string;
  role: "Administrator" | "Member" | "Viewer";
  tokenHash: string;
  expiresAt: Date;
};

export type AcceptInvitationInput = {
  tokenHash: string;
  firstName?: string;
  lastName?: string | null;
  passwordHash?: string;
};

// =====================================================
// ROLE HELPERS
// =====================================================

function normalizeRole(role: string): string {
  return role.trim().toLowerCase();
}

function isOwner(role: string): boolean {
  return normalizeRole(role) === "owner";
}

function isAdministrator(role: string): boolean {
  return normalizeRole(role) === "administrator";
}

function isTeamManager(role: string): boolean {
  return isOwner(role) || isAdministrator(role);
}

function canManageTarget(
  actorRole: string,
  targetRole: string
): boolean {
  if (isOwner(actorRole)) {
    return normalizeRole(targetRole) !== "owner";
  }

  if (isAdministrator(actorRole)) {
    return (
      normalizeRole(targetRole) === "member" ||
      normalizeRole(targetRole) === "viewer"
    );
  }

  return false;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// =====================================================
// GET ORGANIZATION TEAM
// =====================================================

export async function getTeamMembers(
  context: TeamAccessContext
) {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      context.organizationId
    )
    .query(`
      SELECT
        m.MembershipId AS membershipId,
        m.OrganizationId AS organizationId,
        m.UserId AS userId,
        u.Email AS email,
        u.FirstName AS firstName,
        u.LastName AS lastName,
        u.Status AS userStatus,
        m.Role AS role,
        m.CreatedAt AS joinedAt,

        (
          SELECT COUNT(*)
          FROM dbo.UserPropertyAccess upa
          WHERE upa.MembershipId = m.MembershipId
        ) AS assignedPropertyCount

      FROM dbo.Memberships m

      INNER JOIN dbo.Users u
        ON u.UserId = m.UserId

      INNER JOIN dbo.Organizations o
        ON o.OrganizationId = m.OrganizationId

      WHERE m.OrganizationId = @organizationId
        AND o.Status = 'active'

      ORDER BY
        CASE LOWER(LTRIM(RTRIM(m.Role)))
          WHEN 'owner' THEN 1
          WHEN 'administrator' THEN 2
          WHEN 'member' THEN 3
          ELSE 4
        END,
        u.FirstName,
        u.LastName;
    `);

  return result.recordset;
}

// =====================================================
// GET MEMBER PROPERTY ASSIGNMENTS
// =====================================================

export async function getMemberProperties(
  context: TeamAccessContext,
  targetMembershipId: string
) {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      context.organizationId
    )
    .input(
      "membershipId",
      sql.UniqueIdentifier,
      targetMembershipId
    )
    .query(`
      SELECT
        p.PropertyId AS propertyId,
        p.PropertyName AS propertyName,
        p.Address AS address,
        p.City AS city,
        p.Province AS province,
        p.Status AS status,
        upa.CreatedAt AS assignedAt,
        upa.GrantedByUserId AS grantedByUserId

      FROM dbo.UserPropertyAccess upa

      INNER JOIN dbo.Memberships m
        ON m.MembershipId = upa.MembershipId

      INNER JOIN dbo.Properties p
        ON p.PropertyId = upa.PropertyId

      WHERE m.MembershipId = @membershipId
        AND m.OrganizationId = @organizationId
        AND p.OrganizationId = @organizationId

      ORDER BY p.PropertyName;
    `);

  return result.recordset;
}

// =====================================================
// CREATE TEAM INVITATION
// =====================================================

export async function createTeamInvitation(
  context: TeamAccessContext,
  data: CreateInvitationInput
) {
  const actorRole = normalizeRole(context.role);
  const invitedRole = normalizeRole(data.role);

  if (!isTeamManager(actorRole)) {
    throw new Error(
      "You do not have permission to invite team members."
    );
  }

  if (
    !["administrator", "member", "viewer"].includes(invitedRole)
  ) {
    throw new Error("Invalid invitation role.");
  }

  if (
    isAdministrator(actorRole) &&
    invitedRole !== "member" &&
    invitedRole !== "viewer"
  ) {
    throw new Error(
      "Administrators can only invite Members and Viewers."
    );
  }

  const pool = await getDatabase();
  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const request = new sql.Request(transaction);

    request.input(
      "organizationId",
      sql.UniqueIdentifier,
      context.organizationId
    );

    request.input(
      "membershipId",
      sql.UniqueIdentifier,
      context.membershipId
    );

    request.input(
      "email",
      sql.NVarChar(255),
      normalizeEmail(data.email)
    );

    request.input(
      "role",
      sql.NVarChar(100),
      data.role
    );

    request.input(
      "tokenHash",
      sql.Char(64),
      data.tokenHash
    );

    request.input(
      "expiresAt",
      sql.DateTime2,
      data.expiresAt
    );

    const result = await request.query(`
      DECLARE @InviterUserId UNIQUEIDENTIFIER;

      SELECT
        @InviterUserId = m.UserId
      FROM dbo.Memberships m
      INNER JOIN dbo.Organizations o
        ON o.OrganizationId = m.OrganizationId
      INNER JOIN dbo.Users u
        ON u.UserId = m.UserId
      WHERE m.MembershipId = @membershipId
        AND m.OrganizationId = @organizationId
        AND o.Status = 'active'
        AND u.Status = 'active'
        AND LOWER(LTRIM(RTRIM(m.Role))) IN (
          'owner',
          'administrator'
        );

      IF @InviterUserId IS NULL
        THROW 51001, 'Invalid team manager.', 1;

      IF EXISTS (
        SELECT 1
        FROM dbo.Memberships m
        INNER JOIN dbo.Users u
          ON u.UserId = m.UserId
        WHERE m.OrganizationId = @organizationId
          AND LOWER(LTRIM(RTRIM(u.Email))) = @email
      )
        THROW 51002, 'This user is already a team member.', 1;

      IF EXISTS (
        SELECT 1
        FROM dbo.TeamInvitations WITH (UPDLOCK, HOLDLOCK)
        WHERE OrganizationId = @organizationId
          AND LOWER(LTRIM(RTRIM(Email))) = @email
          AND AcceptedAt IS NULL
          AND RevokedAt IS NULL
          AND ExpiresAt > SYSUTCDATETIME()
      )
        THROW 51003, 'A pending invitation already exists.', 1;

      INSERT INTO dbo.TeamInvitations (
        OrganizationId,
        Email,
        Role,
        TokenHash,
        InvitedByUserId,
        ExpiresAt
      )
      OUTPUT
        INSERTED.TeamInvitationId AS invitationId,
        INSERTED.OrganizationId AS organizationId,
        INSERTED.Email AS email,
        INSERTED.Role AS role,
        INSERTED.ExpiresAt AS expiresAt,
        INSERTED.CreatedAt AS createdAt
      VALUES (
        @organizationId,
        @email,
        @role,
        @tokenHash,
        @InviterUserId,
        @expiresAt
      );
    `);

    await transaction.commit();

    return result.recordset[0];
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// =====================================================
// LIST TEAM INVITATIONS
// =====================================================

export async function getTeamInvitations(
  context: TeamAccessContext
) {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      context.organizationId
    )
    .query(`
      SELECT
        ti.TeamInvitationId AS invitationId,
        ti.Email AS email,
        ti.Role AS role,
        ti.ExpiresAt AS expiresAt,
        ti.AcceptedAt AS acceptedAt,
        ti.RevokedAt AS revokedAt,
        ti.CreatedAt AS createdAt,

        u.FirstName AS invitedByFirstName,
        u.LastName AS invitedByLastName

      FROM dbo.TeamInvitations ti

      INNER JOIN dbo.Organizations o
        ON o.OrganizationId = ti.OrganizationId

      INNER JOIN dbo.Users u
        ON u.UserId = ti.InvitedByUserId

      WHERE ti.OrganizationId = @organizationId
        AND o.Status = 'active'

      ORDER BY ti.CreatedAt DESC;
    `);

  return result.recordset;
}

// =====================================================
// FIND INVITATION BY TOKEN HASH
// =====================================================

export async function findInvitationByTokenHash(
  tokenHash: string
) {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input("tokenHash", sql.Char(64), tokenHash)
    .query(`
      SELECT
        ti.TeamInvitationId AS invitationId,
        ti.OrganizationId AS organizationId,
        ti.Email AS email,
        ti.Role AS role,
        ti.ExpiresAt AS expiresAt,
        o.OrganizationName AS organizationName,
        o.Status AS organizationStatus

      FROM dbo.TeamInvitations ti

      INNER JOIN dbo.Organizations o
        ON o.OrganizationId = ti.OrganizationId

      WHERE ti.TokenHash = @tokenHash
        AND ti.AcceptedAt IS NULL
        AND ti.RevokedAt IS NULL
        AND ti.ExpiresAt > SYSUTCDATETIME()
        AND o.Status = 'active';
    `);

  return result.recordset[0] ?? null;
}

// =====================================================
// ACCEPT INVITATION
// Supports existing and new users.
// =====================================================

export async function acceptTeamInvitation(
  data: AcceptInvitationInput
) {
  const pool = await getDatabase();
  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const request = new sql.Request(transaction);

    request.input(
      "tokenHash",
      sql.Char(64),
      data.tokenHash
    );

    request.input(
      "firstName",
      sql.NVarChar(100),
      data.firstName ?? null
    );

    request.input(
      "lastName",
      sql.NVarChar(100),
      data.lastName ?? null
    );

    request.input(
      "passwordHash",
      sql.NVarChar(500),
      data.passwordHash ?? null
    );

    const result = await request.query(`
      DECLARE @InvitationId UNIQUEIDENTIFIER;
      DECLARE @OrganizationId UNIQUEIDENTIFIER;
      DECLARE @Email NVARCHAR(255);
      DECLARE @Role NVARCHAR(100);
      DECLARE @UserId UNIQUEIDENTIFIER;
      DECLARE @MembershipId UNIQUEIDENTIFIER;

      DECLARE @CreatedUsers TABLE (
        UserId UNIQUEIDENTIFIER
      );

      DECLARE @CreatedMemberships TABLE (
        MembershipId UNIQUEIDENTIFIER
      );

      SELECT
        @InvitationId = ti.TeamInvitationId,
        @OrganizationId = ti.OrganizationId,
        @Email = ti.Email,
        @Role = ti.Role
      FROM dbo.TeamInvitations ti WITH (UPDLOCK, HOLDLOCK)
      INNER JOIN dbo.Organizations o
        ON o.OrganizationId = ti.OrganizationId
      WHERE ti.TokenHash = @tokenHash
        AND ti.AcceptedAt IS NULL
        AND ti.RevokedAt IS NULL
        AND ti.ExpiresAt > SYSUTCDATETIME()
        AND o.Status = 'active';

      IF @InvitationId IS NULL
        THROW 51010, 'Invitation is invalid, expired, or revoked.', 1;

      IF LOWER(LTRIM(RTRIM(@Role))) NOT IN (
        'administrator',
        'member',
        'viewer'
      )
        THROW 51011, 'Invalid invitation role.', 1;

      SELECT
        @UserId = UserId
      FROM dbo.Users WITH (UPDLOCK, HOLDLOCK)
      WHERE LOWER(LTRIM(RTRIM(Email))) =
        LOWER(LTRIM(RTRIM(@Email)));

      IF @UserId IS NOT NULL
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM dbo.Users
          WHERE UserId = @UserId
            AND Status = 'active'
        )
          THROW 51012, 'This user account is inactive.', 1;
      END
      ELSE
      BEGIN
        IF @firstName IS NULL
          THROW 51013, 'First name is required.', 1;

        IF @passwordHash IS NULL
          THROW 51014, 'Password is required for a new account.', 1;

        INSERT INTO dbo.Users (
          Email,
          FirstName,
          LastName,
          PasswordHash,
          Status
        )
        OUTPUT INSERTED.UserId
          INTO @CreatedUsers (UserId)
        VALUES (
          @Email,
          @firstName,
          @lastName,
          @passwordHash,
          'active'
        );

        SELECT @UserId = UserId
        FROM @CreatedUsers;

        IF @UserId IS NULL
          THROW 51017, 'Unable to create user account.', 1;
      END;

      IF EXISTS (
        SELECT 1
        FROM dbo.Memberships WITH (UPDLOCK, HOLDLOCK)
        WHERE OrganizationId = @OrganizationId
          AND UserId = @UserId
      )
        THROW 51015, 'This user is already a member of the organization.', 1;

      INSERT INTO dbo.Memberships (
        OrganizationId,
        UserId,
        Role
      )
      OUTPUT INSERTED.MembershipId
        INTO @CreatedMemberships (MembershipId)
      VALUES (
        @OrganizationId,
        @UserId,
        @Role
      );

      SELECT @MembershipId = MembershipId
      FROM @CreatedMemberships;

      IF @MembershipId IS NULL
        THROW 51018, 'Unable to create organization membership.', 1;

      UPDATE dbo.TeamInvitations
      SET AcceptedAt = SYSUTCDATETIME()
      WHERE TeamInvitationId = @InvitationId
        AND AcceptedAt IS NULL
        AND RevokedAt IS NULL;

      IF @@ROWCOUNT <> 1
        THROW 51016, 'Invitation could not be accepted.', 1;

      SELECT
        @UserId AS userId,
        @MembershipId AS membershipId,
        @OrganizationId AS organizationId,
        @Role AS role,
        @Email AS email;
    `);

    await transaction.commit();

    return result.recordset[0];
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// =====================================================
// REVOKE INVITATION
// =====================================================

export async function revokeTeamInvitation(
  context: TeamAccessContext,
  invitationId: string
) {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      context.organizationId
    )
    .input(
      "invitationId",
      sql.UniqueIdentifier,
      invitationId
    )
    .input(
      "actorRole",
      sql.NVarChar(50),
      context.role
    )
    .query(`
      UPDATE ti
      SET RevokedAt = SYSUTCDATETIME()

      FROM dbo.TeamInvitations ti

      WHERE ti.TeamInvitationId = @invitationId
        AND ti.OrganizationId = @organizationId
        AND ti.AcceptedAt IS NULL
        AND ti.RevokedAt IS NULL
        AND ti.ExpiresAt > SYSUTCDATETIME()

        AND (
          LOWER(LTRIM(RTRIM(@actorRole))) = 'owner'
          OR (
            LOWER(LTRIM(RTRIM(@actorRole))) = 'administrator'
            AND LOWER(LTRIM(RTRIM(ti.Role))) IN (
              'member',
              'viewer'
            )
          )
        );

      SELECT @@ROWCOUNT AS affectedRows;
    `);

  return result.recordset[0]?.affectedRows > 0;
}

// =====================================================
// CHANGE MEMBER ROLE
// Owner can manage Administrator, Member, Viewer.
// Administrator can manage Member and Viewer.
// Owner assignment is reserved for ownership transfer.
// =====================================================

export async function updateMemberRole(
  context: TeamAccessContext,
  targetMembershipId: string,
  newRole: string
) {
  const normalizedNewRole = normalizeRole(newRole);

  if (
    !["administrator", "member", "viewer"].includes(
      normalizedNewRole
    )
  ) {
    throw new Error("Invalid role.");
  }

  if (
    isAdministrator(context.role) &&
    normalizedNewRole === "administrator"
  ) {
    throw new Error(
      "Administrators cannot assign the Administrator role."
    );
  }

  if (!isTeamManager(context.role)) {
    throw new Error("You cannot manage team roles.");
  }

  const pool = await getDatabase();

  const result = await pool
    .request()
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      context.organizationId
    )
    .input(
      "membershipId",
      sql.UniqueIdentifier,
      targetMembershipId
    )
    .input(
      "actorMembershipId",
      sql.UniqueIdentifier,
      context.membershipId
    )
    .input(
      "newRole",
      sql.NVarChar(50),
      newRole
    )
    .input(
      "actorRole",
      sql.NVarChar(50),
      context.role
    )
    .query(`
      UPDATE target
      SET Role = @newRole

      FROM dbo.Memberships target

      WHERE target.MembershipId = @membershipId
        AND target.OrganizationId = @organizationId
        AND target.MembershipId <> @actorMembershipId

        AND LOWER(LTRIM(RTRIM(target.Role))) <> 'owner'

        AND (
          LOWER(LTRIM(RTRIM(@actorRole))) = 'owner'
          OR (
            LOWER(LTRIM(RTRIM(@actorRole))) = 'administrator'
            AND LOWER(LTRIM(RTRIM(target.Role))) IN (
              'member',
              'viewer'
            )
            AND LOWER(LTRIM(RTRIM(@newRole))) IN (
              'member',
              'viewer'
            )
          )
        );

      SELECT @@ROWCOUNT AS affectedRows;
    `);

  return result.recordset[0]?.affectedRows > 0;
}

// =====================================================
// REPLACE MEMBER PROPERTY ASSIGNMENTS
// =====================================================

export async function replaceMemberPropertyAccess(
  context: TeamAccessContext,
  targetMembershipId: string,
  propertyIds: string[]
) {
  if (!isTeamManager(context.role)) {
    throw new Error("You cannot manage property assignments.");
  }

  const uniquePropertyIds = [...new Set(propertyIds)];

  const pool = await getDatabase();
  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const request = new sql.Request(transaction);

    request.input(
      "organizationId",
      sql.UniqueIdentifier,
      context.organizationId
    );

    request.input(
      "membershipId",
      sql.UniqueIdentifier,
      targetMembershipId
    );

    request.input(
      "actorRole",
      sql.NVarChar(50),
      context.role
    );

    request.input(
      "actorUserId",
      sql.UniqueIdentifier,
      context.userId ?? null
    );

    const membershipResult = await request.query(`
      SELECT
        m.MembershipId,
        m.UserId,
        m.Role
      FROM dbo.Memberships m
      INNER JOIN dbo.Organizations o
        ON o.OrganizationId = m.OrganizationId
      WHERE m.MembershipId = @membershipId
        AND m.OrganizationId = @organizationId
        AND o.Status = 'active';
    `);

    const target = membershipResult.recordset[0];

    if (!target) {
      throw new Error("Team member was not found.");
    }

    if (
      !canManageTarget(context.role, target.Role) ||
      !["member", "viewer"].includes(normalizeRole(target.Role))
    ) {
      throw new Error(
        "You cannot change property assignments for this team member."
      );
    }

    const actorUserId = context.userId ??
      (
        await new sql.Request(transaction)
          .input(
            "actorMembershipId",
            sql.UniqueIdentifier,
            context.membershipId
          )
          .input(
            "organizationId",
            sql.UniqueIdentifier,
            context.organizationId
          )
          .query(`
            SELECT UserId
            FROM dbo.Memberships
            WHERE MembershipId = @actorMembershipId
              AND OrganizationId = @organizationId;
          `)
      ).recordset[0]?.UserId;

    if (!actorUserId) {
      throw new Error("Unable to verify the acting team member.");
    }

    if (uniquePropertyIds.length > 0) {
      const propertyRequest = new sql.Request(transaction);

      propertyRequest.input(
        "organizationId",
        sql.UniqueIdentifier,
        context.organizationId
      );

      const placeholders = uniquePropertyIds.map((id, index) => {
        const parameterName = `property${index}`;

        propertyRequest.input(
          parameterName,
          sql.UniqueIdentifier,
          id
        );

        return `@${parameterName}`;
      });

      const propertyResult = await propertyRequest.query(`
        SELECT PropertyId
        FROM dbo.Properties
        WHERE OrganizationId = @organizationId
          AND PropertyId IN (${placeholders.join(", ")});
      `);

      if (
        propertyResult.recordset.length !== uniquePropertyIds.length
      ) {
        throw new Error(
          "One or more properties do not belong to this organization."
        );
      }
    }

    const deleteRequest = new sql.Request(transaction);

    deleteRequest.input(
      "membershipId",
      sql.UniqueIdentifier,
      targetMembershipId
    );

    await deleteRequest.query(`
      DELETE FROM dbo.UserPropertyAccess
      WHERE MembershipId = @membershipId;
    `);

    for (const propertyId of uniquePropertyIds) {
      const insertRequest = new sql.Request(transaction);

      insertRequest
        .input(
          "membershipId",
          sql.UniqueIdentifier,
          targetMembershipId
        )
        .input(
          "propertyId",
          sql.UniqueIdentifier,
          propertyId
        )
        .input(
          "grantedByUserId",
          sql.UniqueIdentifier,
          actorUserId
        );

      await insertRequest.query(`
        INSERT INTO dbo.UserPropertyAccess (
          MembershipId,
          PropertyId,
          GrantedByUserId
        )
        VALUES (
          @membershipId,
          @propertyId,
          @grantedByUserId
        );
      `);
    }

    await transaction.commit();

    return getMemberProperties(context, targetMembershipId);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// =====================================================
// REMOVE TEAM MEMBER
// Owners cannot be removed through this endpoint.
// Ownership transfer must be a separate operation.
// =====================================================

export async function removeTeamMember(
  context: TeamAccessContext,
  targetMembershipId: string
) {
  if (!isTeamManager(context.role)) {
    throw new Error("You cannot remove team members.");
  }

  if (targetMembershipId === context.membershipId) {
    throw new Error(
      "You cannot remove your own membership through this endpoint."
    );
  }

  const pool = await getDatabase();
  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const request = new sql.Request(transaction);

    request.input(
      "organizationId",
      sql.UniqueIdentifier,
      context.organizationId
    );

    request.input(
      "membershipId",
      sql.UniqueIdentifier,
      targetMembershipId
    );

    request.input(
      "actorRole",
      sql.NVarChar(50),
      context.role
    );

    const result = await request.query(`
      DECLARE @TargetRole NVARCHAR(50);

      SELECT
        @TargetRole = Role
      FROM dbo.Memberships WITH (UPDLOCK, HOLDLOCK)
      WHERE MembershipId = @membershipId
        AND OrganizationId = @organizationId;

      IF @TargetRole IS NULL
        THROW 51020, 'Team member was not found.', 1;

      IF LOWER(LTRIM(RTRIM(@TargetRole))) = 'owner'
        THROW 51021, 'Owner memberships cannot be removed through this endpoint.', 1;

      IF LOWER(LTRIM(RTRIM(@actorRole))) = 'administrator'
        AND LOWER(LTRIM(RTRIM(@TargetRole))) NOT IN (
          'member',
          'viewer'
        )
        THROW 51022, 'Administrators can only remove Members and Viewers.', 1;

      IF LOWER(LTRIM(RTRIM(@actorRole))) NOT IN (
        'owner',
        'administrator'
      )
        THROW 51023, 'Unauthorized team management operation.', 1;

      DELETE FROM dbo.UserPropertyAccess
      WHERE MembershipId = @membershipId;

      DELETE FROM dbo.Memberships
      WHERE MembershipId = @membershipId
        AND OrganizationId = @organizationId;

      SELECT @@ROWCOUNT AS affectedRows;
    `);

    await transaction.commit();

    return result.recordset[0]?.affectedRows > 0;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// =====================================================
// UPDATE TEAM MEMBER PROFILE
// Owner can edit Administrator, Member, Viewer.
// Administrator can edit Member and Viewer.
// Names are stored on dbo.Users and are account-wide.
// =====================================================

export async function updateMemberProfile(
  context: TeamAccessContext,
  targetMembershipId: string,
  data: {
    firstName: string;
    lastName: string | null;
  }
): Promise<boolean> {
  if (!isTeamManager(context.role)) {
    throw new Error(
      "You do not have permission to update team member profiles."
    );
  }

  const firstName = data.firstName.trim();
  const lastName = data.lastName?.trim() || null;

  if (!firstName) {
    throw new Error("First name is required.");
  }

  if (firstName.length > 100) {
    throw new Error("First name cannot exceed 100 characters.");
  }

  if (lastName && lastName.length > 100) {
    throw new Error("Last name cannot exceed 100 characters.");
  }

  const pool = await getDatabase();

  const result = await pool
    .request()
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      context.organizationId
    )
    .input(
      "membershipId",
      sql.UniqueIdentifier,
      targetMembershipId
    )
    .input(
      "firstName",
      sql.NVarChar(100),
      firstName
    )
    .input(
      "lastName",
      sql.NVarChar(100),
      lastName
    )
    .input(
      "actorRole",
      sql.NVarChar(50),
      context.role
    )
    .query(`
      DECLARE @TargetRole NVARCHAR(50);
      DECLARE @TargetUserId UNIQUEIDENTIFIER;

      -- Find the target membership inside the active organization.
      SELECT
        @TargetRole = m.Role,
        @TargetUserId = m.UserId
      FROM dbo.Memberships m
      INNER JOIN dbo.Organizations o
        ON o.OrganizationId = m.OrganizationId
      INNER JOIN dbo.Users u
        ON u.UserId = m.UserId
      WHERE m.MembershipId = @membershipId
        AND m.OrganizationId = @organizationId
        AND o.Status = 'active'
        AND u.Status = 'active';

      IF @TargetUserId IS NULL
        THROW 51030, 'Team member was not found or is inactive.', 1;

      -- Enforce the existing team-management hierarchy.
      IF LOWER(LTRIM(RTRIM(@TargetRole))) = 'owner'
        THROW 51031, 'Owner profiles cannot be edited through this endpoint.', 1;

      IF LOWER(LTRIM(RTRIM(@actorRole))) = 'administrator'
        AND LOWER(LTRIM(RTRIM(@TargetRole))) NOT IN (
          'member',
          'viewer'
        )
        THROW 51032, 'Administrators can only edit Members and Viewers.', 1;

      IF LOWER(LTRIM(RTRIM(@actorRole))) NOT IN (
        'owner',
        'administrator'
      )
        THROW 51033, 'Unauthorized team management operation.', 1;

      -- Update only the name fields.
      UPDATE dbo.Users
      SET
        FirstName = @firstName,
        LastName = @lastName
      WHERE UserId = @TargetUserId
        AND Status = 'active';

      SELECT @@ROWCOUNT AS affectedRows;
    `);

  return result.recordset[0]?.affectedRows > 0;
}
