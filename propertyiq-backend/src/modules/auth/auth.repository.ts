import { getDatabase, sql } from "../../config/database";

// =====================================================
// TYPES
// =====================================================

export interface UserRecord {
  userId: string;
  email: string;
  firstName: string;
  lastName: string | null;
  passwordHash: string | null;
  status: string;
}

export interface MembershipRecord {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  role: string;
}

export interface RefreshTokenRecord {
  refreshTokenId: string;
  userId: string;
  expiresAt: Date;
}

// =====================================================
// FIND USER BY EMAIL
// =====================================================

export async function findUserByEmail(
  email: string
): Promise<UserRecord | null> {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input(
      "email",
      sql.NVarChar(255),
      email.trim().toLowerCase()
    )
    .query(`
      SELECT
          UserId AS userId,
          Email AS email,
          FirstName AS firstName,
          LastName AS lastName,
          PasswordHash AS passwordHash,
          Status AS status
      FROM dbo.Users
      WHERE LOWER(Email) = @email;
    `);

  return result.recordset[0] ?? null;
}

// =====================================================
// FIND USER BY ID
// =====================================================

export async function findUserById(
  userId: string
): Promise<UserRecord | null> {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input(
      "userId",
      sql.UniqueIdentifier,
      userId
    )
    .query(`
      SELECT
          UserId AS userId,
          Email AS email,
          FirstName AS firstName,
          LastName AS lastName,
          PasswordHash AS passwordHash,
          Status AS status
      FROM dbo.Users
      WHERE UserId = @userId;
    `);

  return result.recordset[0] ?? null;
}

// =====================================================
// GET USER MEMBERSHIPS
// =====================================================

export async function getUserMemberships(
  userId: string
): Promise<MembershipRecord[]> {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input(
      "userId",
      sql.UniqueIdentifier,
      userId
    )
    .query(`
      SELECT
          m.MembershipId AS membershipId,
          m.OrganizationId AS organizationId,
          o.OrganizationName AS organizationName,
          m.Role AS role
      FROM dbo.Memberships m
      INNER JOIN dbo.Organizations o
          ON o.OrganizationId = m.OrganizationId
      WHERE
          m.UserId = @userId
          AND LOWER(o.Status) = 'active'
      ORDER BY
          o.OrganizationName;
    `);

  return result.recordset;
}

// =====================================================
// CREATE CUSTOMER ACCOUNT
// =====================================================

export async function createCustomerAccount(
  data: {
    organizationName: string;
    firstName: string;
    lastName?: string | null;
    email: string;
    passwordHash: string;
  }
) {
  const pool = await getDatabase();

  const transaction =
    new sql.Transaction(pool);

  await transaction.begin();

  try {
    const request =
      new sql.Request(transaction);

    const result = await request
      .input(
        "organizationName",
        sql.NVarChar(150),
        data.organizationName
      )
      .input(
        "firstName",
        sql.NVarChar(100),
        data.firstName
      )
      .input(
        "lastName",
        sql.NVarChar(100),
        data.lastName ?? null
      )
      .input(
        "email",
        sql.NVarChar(255),
        data.email.trim().toLowerCase()
      )
      .input(
        "passwordHash",
        sql.NVarChar(500),
        data.passwordHash
      )
      .query(`
        DECLARE @OrganizationId UNIQUEIDENTIFIER;
        DECLARE @UserId UNIQUEIDENTIFIER;

        DECLARE @NewOrganization TABLE
        (
            OrganizationId UNIQUEIDENTIFIER
        );

        DECLARE @NewUser TABLE
        (
            UserId UNIQUEIDENTIFIER
        );

        INSERT INTO dbo.Organizations
        (
            OrganizationName,
            OrganizationType,
            Status
        )
        OUTPUT INSERTED.OrganizationId
            INTO @NewOrganization
        VALUES
        (
            @organizationName,
            'business',
            'active'
        );

        SELECT
            @OrganizationId =
                OrganizationId
        FROM @NewOrganization;

        INSERT INTO dbo.Users
        (
            Email,
            FirstName,
            LastName,
            PasswordHash,
            Status
        )
        OUTPUT INSERTED.UserId
            INTO @NewUser
        VALUES
        (
            @email,
            @firstName,
            @lastName,
            @passwordHash,
            'active'
        );

        SELECT
            @UserId = UserId
        FROM @NewUser;

        INSERT INTO dbo.Memberships
        (
            OrganizationId,
            UserId,
            Role
        )
        VALUES
        (
            @OrganizationId,
            @UserId,
            'Owner'
        );

        SELECT
            @OrganizationId AS organizationId,
            @UserId AS userId;
      `);

    const account =
      result.recordset[0];

    await transaction.commit();

    return account;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// =====================================================
// SAVE REFRESH TOKEN
// =====================================================

export async function saveRefreshToken(
  data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }
): Promise<void> {
  const pool = await getDatabase();

  await pool
    .request()
    .input(
      "userId",
      sql.UniqueIdentifier,
      data.userId
    )
    .input(
      "tokenHash",
      sql.Char(64),
      data.tokenHash
    )
    .input(
      "expiresAt",
      sql.DateTime2,
      data.expiresAt
    )
    .query(`
      INSERT INTO dbo.RefreshTokens
      (
          UserId,
          TokenHash,
          ExpiresAt
      )
      VALUES
      (
          @userId,
          @tokenHash,
          @expiresAt
      );
    `);
}

// =====================================================
// FIND REFRESH TOKEN
// =====================================================

export async function findRefreshToken(
  tokenHash: string
): Promise<RefreshTokenRecord | null> {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input(
      "tokenHash",
      sql.Char(64),
      tokenHash
    )
    .query(`
      SELECT
          RefreshTokenId
              AS refreshTokenId,
          UserId
              AS userId,
          ExpiresAt
              AS expiresAt
      FROM dbo.RefreshTokens
      WHERE
          TokenHash = @tokenHash
          AND RevokedAt IS NULL
          AND ExpiresAt >
              SYSUTCDATETIME();
    `);

  return result.recordset[0] ?? null;
}

// =====================================================
// REVOKE REFRESH TOKEN
// =====================================================

export async function revokeRefreshToken(
  tokenHash: string
): Promise<boolean> {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input(
      "tokenHash",
      sql.Char(64),
      tokenHash
    )
    .query(`
      UPDATE dbo.RefreshTokens
      SET RevokedAt =
          SYSUTCDATETIME()
      WHERE
          TokenHash = @tokenHash
          AND RevokedAt IS NULL;

      SELECT
          @@ROWCOUNT
              AS affectedRows;
    `);

  return (
    result.recordset[0]
      ?.affectedRows > 0
  );
}

// =====================================================
// CLEANUP EXPIRED TOKENS
// =====================================================

export async function cleanupExpiredTokens(): Promise<number> {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .query(`
      DELETE FROM dbo.RefreshTokens
      WHERE
          ExpiresAt <
          SYSUTCDATETIME();

      SELECT
          @@ROWCOUNT
              AS affectedRows;
    `);

  return (
    result.recordset[0]
      ?.affectedRows ?? 0
  );
}

// =====================================================
// AUDIT LOGGING
// =====================================================

export async function createAuditLog(
  data: {
    organizationId?: string | null;
    userId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: string | null;
    ipAddress?: string | null;
  }
): Promise<void> {
  const pool = await getDatabase();

  await pool
    .request()
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      data.organizationId ?? null
    )
    .input(
      "userId",
      sql.UniqueIdentifier,
      data.userId ?? null
    )
    .input(
      "action",
      sql.NVarChar(100),
      data.action
    )
    .input(
      "entityType",
      sql.NVarChar(100),
      data.entityType
    )
    .input(
      "entityId",
      sql.NVarChar(255),
      data.entityId ?? null
    )
    .input(
      "details",
      sql.NVarChar(sql.MAX),
      data.details ?? null
    )
    .input(
      "ipAddress",
      sql.NVarChar(100),
      data.ipAddress ?? null
    )
    .query(`
      INSERT INTO dbo.AuditLogs
      (
          OrganizationId,
          UserId,
          Action,
          EntityType,
          EntityId,
          Details,
          IpAddress
      )
      VALUES
      (
          @organizationId,
          @userId,
          @action,
          @entityType,
          @entityId,
          @details,
          @ipAddress
      );
    `);
}