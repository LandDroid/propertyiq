
import { getDatabase, sql } from "../../config/database";
import type { CreatePropertyManagerInput } from "./property-managers.validation";

export class PropertyManagersRepository {
  // =====================================================
  // GET PROPERTY MANAGER ASSIGNMENTS
  //
  // Owner / Administrator: all organization properties
  // Member / Viewer: explicitly assigned properties only
  // Only active assignments are returned
  // =====================================================

  async getAll(organizationId: string, userId: string) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("OrganizationId", sql.UniqueIdentifier, organizationId)
      .input("UserId", sql.UniqueIdentifier, userId)
      .query(`
        SELECT DISTINCT
          pm.PropertyManagerId,
          pm.OrganizationId,
          pm.PropertyId,
          p.PropertyName,
          pm.MembershipId,
          manager.UserId,
          manager.FirstName,
          manager.LastName,
          manager.Email,
          pm.AssignedByUserId,
          pm.AssignedAt,
          pm.EndedAt,
          pm.Status
        FROM dbo.PropertyManagers pm
        INNER JOIN dbo.Properties p
          ON p.PropertyId = pm.PropertyId
          AND p.OrganizationId = pm.OrganizationId
        INNER JOIN dbo.Memberships assignedMembership
          ON assignedMembership.MembershipId = pm.MembershipId
          AND assignedMembership.OrganizationId = pm.OrganizationId
        INNER JOIN dbo.Users manager
          ON manager.UserId = assignedMembership.UserId
        INNER JOIN dbo.Memberships m
          ON m.OrganizationId = pm.OrganizationId
        INNER JOIN dbo.Users u
          ON u.UserId = m.UserId
        INNER JOIN dbo.Organizations o
          ON o.OrganizationId = pm.OrganizationId
        LEFT JOIN dbo.UserPropertyAccess upa
          ON upa.MembershipId = m.MembershipId
          AND upa.PropertyId = pm.PropertyId
        WHERE pm.OrganizationId = @OrganizationId
          AND pm.Status = 'active'
          AND m.UserId = @UserId
          AND LOWER(LTRIM(RTRIM(u.Status))) = 'active'
          AND LOWER(LTRIM(RTRIM(manager.Status))) = 'active'
          AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
          AND (
            LOWER(LTRIM(RTRIM(m.Role))) IN ('owner', 'administrator')
            OR upa.AccessId IS NOT NULL
          )
        ORDER BY pm.AssignedAt DESC;
      `);

    return result.recordset;
  }

  // =====================================================
  // GET ONE PROPERTY MANAGER ASSIGNMENT
  // User must have access to the associated property
  // =====================================================

  async getById(
    propertyManagerId: string,
    organizationId: string,
    userId: string
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input(
        "PropertyManagerId",
        sql.UniqueIdentifier,
        propertyManagerId
      )
      .input("OrganizationId", sql.UniqueIdentifier, organizationId)
      .input("UserId", sql.UniqueIdentifier, userId)
      .query(`
        SELECT TOP 1
          pm.PropertyManagerId,
          pm.OrganizationId,
          pm.PropertyId,
          p.PropertyName,
          pm.MembershipId,
          manager.UserId,
          manager.FirstName,
          manager.LastName,
          manager.Email,
          pm.AssignedByUserId,
          pm.AssignedAt,
          pm.EndedAt,
          pm.Status
        FROM dbo.PropertyManagers pm
        INNER JOIN dbo.Properties p
          ON p.PropertyId = pm.PropertyId
          AND p.OrganizationId = pm.OrganizationId
        INNER JOIN dbo.Memberships assignedMembership
          ON assignedMembership.MembershipId = pm.MembershipId
          AND assignedMembership.OrganizationId = pm.OrganizationId
        INNER JOIN dbo.Users manager
          ON manager.UserId = assignedMembership.UserId
        INNER JOIN dbo.Memberships m
          ON m.OrganizationId = pm.OrganizationId
        INNER JOIN dbo.Users u
          ON u.UserId = m.UserId
        INNER JOIN dbo.Organizations o
          ON o.OrganizationId = pm.OrganizationId
        LEFT JOIN dbo.UserPropertyAccess upa
          ON upa.MembershipId = m.MembershipId
          AND upa.PropertyId = pm.PropertyId
        WHERE pm.PropertyManagerId = @PropertyManagerId
          AND pm.OrganizationId = @OrganizationId
          AND m.UserId = @UserId
          AND LOWER(LTRIM(RTRIM(u.Status))) = 'active'
          AND LOWER(LTRIM(RTRIM(manager.Status))) = 'active'
          AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
          AND (
            LOWER(LTRIM(RTRIM(m.Role))) IN ('owner', 'administrator')
            OR upa.AccessId IS NOT NULL
          );
      `);

    return result.recordset[0] ?? null;
  }

  // =====================================================
  // CREATE PROPERTY MANAGER ASSIGNMENT
  //
  // Only active Owners / Administrators
  // Property and membership must belong to same organization
  // Target user must be active
  // Prevent duplicate active assignments
  // =====================================================

  async create(data: CreatePropertyManagerInput, userId: string) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("OrganizationId", sql.UniqueIdentifier, data.organizationId)
      .input("PropertyId", sql.UniqueIdentifier, data.propertyId)
      .input("MembershipId", sql.UniqueIdentifier, data.membershipId)
      .input("UserId", sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.PropertyManagers (
          OrganizationId,
          PropertyId,
          MembershipId,
          AssignedByUserId,
          AssignedAt,
          EndedAt,
          Status
        )
        OUTPUT INSERTED.*
        SELECT
          @OrganizationId,
          @PropertyId,
          @MembershipId,
          @UserId,
          SYSDATETIME(),
          NULL,
          'active'
        WHERE EXISTS (
          SELECT 1
          FROM dbo.Properties p
          INNER JOIN dbo.Organizations o
            ON o.OrganizationId = p.OrganizationId
          WHERE p.PropertyId = @PropertyId
            AND p.OrganizationId = @OrganizationId
            AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
        )
        AND EXISTS (
          SELECT 1
          FROM dbo.Memberships requester
          INNER JOIN dbo.Users requesterUser
            ON requesterUser.UserId = requester.UserId
          WHERE requester.UserId = @UserId
            AND requester.OrganizationId = @OrganizationId
            AND LOWER(LTRIM(RTRIM(requesterUser.Status))) = 'active'
            AND LOWER(LTRIM(RTRIM(requester.Role)))
              IN ('owner', 'administrator')
        )
        AND EXISTS (
          SELECT 1
          FROM dbo.Memberships targetMembership
          INNER JOIN dbo.Users targetUser
            ON targetUser.UserId = targetMembership.UserId
          WHERE targetMembership.MembershipId = @MembershipId
            AND targetMembership.OrganizationId = @OrganizationId
            AND LOWER(LTRIM(RTRIM(targetUser.Status))) = 'active'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.PropertyManagers existing WITH (TABLOCKX, HOLDLOCK)
          WHERE existing.OrganizationId = @OrganizationId
            AND existing.PropertyId = @PropertyId
            AND existing.MembershipId = @MembershipId
            AND existing.Status = 'active'
        );
      `);

    return result.recordset[0] ?? null;
  }

  // =====================================================
  // END PROPERTY MANAGER ASSIGNMENT
  //
  // Only active Owners / Administrators
  // Preserve assignment history
  // =====================================================

  async end(
    propertyManagerId: string,
    organizationId: string,
    userId: string
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input(
        "PropertyManagerId",
        sql.UniqueIdentifier,
        propertyManagerId
      )
      .input("OrganizationId", sql.UniqueIdentifier, organizationId)
      .input("UserId", sql.UniqueIdentifier, userId)
      .query(`
        UPDATE pm
        SET
          Status = 'inactive',
          EndedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        FROM dbo.PropertyManagers pm
        WHERE pm.PropertyManagerId = @PropertyManagerId
          AND pm.OrganizationId = @OrganizationId
          AND pm.Status = 'active'
          AND EXISTS (
            SELECT 1
            FROM dbo.Memberships m
            INNER JOIN dbo.Users u
              ON u.UserId = m.UserId
            INNER JOIN dbo.Organizations o
              ON o.OrganizationId = m.OrganizationId
            WHERE m.UserId = @UserId
              AND m.OrganizationId = pm.OrganizationId
              AND LOWER(LTRIM(RTRIM(u.Status))) = 'active'
              AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
              AND LOWER(LTRIM(RTRIM(m.Role)))
                IN ('owner', 'administrator')
          );
      `);

    return result.recordset[0] ?? null;
  }
}
