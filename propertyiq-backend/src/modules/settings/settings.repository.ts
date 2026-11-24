
import { getDatabase, sql } from "../../config/database";

export class SettingsRepository {
  // =====================================================
  // GET ACCOUNT AND ORGANIZATION SETTINGS
  // =====================================================

  async getSettings(userId: string) {
    const pool = await getDatabase();

    const userResult = await pool
      .request()
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        SELECT
          UserId AS userId,
          Email AS email,
          FirstName AS firstName,
          LastName AS lastName,
          Status AS status,
          CreatedAt AS createdAt
        FROM dbo.Users
        WHERE UserId = @userId
      `);

    if (userResult.recordset.length === 0) {
      return null;
    }

    const membershipResult = await pool
      .request()
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        SELECT
          m.MembershipId AS membershipId,
          m.OrganizationId AS organizationId,
          o.OrganizationName AS organizationName,
          m.Role AS role,
          o.Email AS organizationEmail,
          o.Phone AS organizationPhone,
          o.Status AS organizationStatus
        FROM dbo.Memberships m
        INNER JOIN dbo.Organizations o
          ON o.OrganizationId = m.OrganizationId
        WHERE
          m.UserId = @userId
          AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
        ORDER BY o.OrganizationName
      `);

    return {
      user: userResult.recordset[0],
      memberships: membershipResult.recordset,
    };
  }

  // =====================================================
  // UPDATE ORGANIZATION NAME
  // Only active Owners and Administrators may update.
  // =====================================================

  async updateOrganizationName(
    userId: string,
    organizationId: string,
    organizationName: string
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("userId", sql.UniqueIdentifier, userId)
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .input("organizationName", sql.NVarChar(150), organizationName)
      .query(`
        UPDATE o
        SET
          o.OrganizationName = @organizationName

        OUTPUT
          INSERTED.OrganizationId AS organizationId,
          INSERTED.OrganizationName AS organizationName

        FROM dbo.Organizations o

        WHERE
          o.OrganizationId = @organizationId
          AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'

          AND EXISTS (
            SELECT 1
            FROM dbo.Memberships m
            WHERE
              m.OrganizationId = o.OrganizationId
              AND m.UserId = @userId
              AND LOWER(LTRIM(RTRIM(m.Role))) IN (
                'owner',
                'administrator'
              )
          )
      `);

    if (result.recordset.length === 0) {
      return null;
    }

    return result.recordset[0];
  }
}
