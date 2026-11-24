
import { getDatabase, sql } from "../../config/database";

import type {
  CreatePropertyServiceInput,
  UpdatePropertyServiceInput,
  UpdatePropertyServiceStatusInput,
} from "./property-services.validation";

export class PropertyServicesRepository {
  // =====================================================
  // GET ALL SERVICES USER IS ALLOWED TO SEE
  //
  // Owner / Administrator: all organization properties
  // Member / Viewer: explicitly assigned properties only
  // Active user and organization required
  // =====================================================

  async getAll(organizationId: string, userId: string) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("OrganizationId", sql.UniqueIdentifier, organizationId)
      .input("UserId", sql.UniqueIdentifier, userId)
      .query(`
        SELECT
          ps.PropertyServiceId,
          ps.OrganizationId,
          ps.PropertyId,
          p.PropertyName,
          ps.ServiceProviderId,
          sp.CompanyName AS ServiceProviderName,
          ps.AssignedMembershipId,
          assignedUser.FirstName AS AssignedFirstName,
          assignedUser.LastName AS AssignedLastName,
          assignedUser.Email AS AssignedEmail,
          ps.ServiceName,
          ps.ServiceCategory,
          ps.Description,
          ps.ServiceFrequency,
          ps.ContractReference,
          ps.ContractStartDate,
          ps.ContractEndDate,
          ps.NextServiceDate,
          ps.Notes,
          ps.Status,
          ps.CreatedAt,
          ps.CreatedByUserId
        FROM dbo.PropertyServices ps
        INNER JOIN dbo.Properties p
          ON p.PropertyId = ps.PropertyId
          AND p.OrganizationId = ps.OrganizationId
        INNER JOIN dbo.Organizations o
          ON o.OrganizationId = ps.OrganizationId
        LEFT JOIN dbo.ServiceProviders sp
          ON sp.ServiceProviderId = ps.ServiceProviderId
          AND sp.OrganizationId = ps.OrganizationId
        LEFT JOIN dbo.Memberships assignedMembership
          ON assignedMembership.MembershipId = ps.AssignedMembershipId
          AND assignedMembership.OrganizationId = ps.OrganizationId
        LEFT JOIN dbo.Users assignedUser
          ON assignedUser.UserId = assignedMembership.UserId
        WHERE ps.OrganizationId = @OrganizationId
          AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
          AND EXISTS (
            SELECT 1
            FROM dbo.Memberships requesterMembership
            INNER JOIN dbo.Users requester
              ON requester.UserId = requesterMembership.UserId
            LEFT JOIN dbo.UserPropertyAccess upa
              ON upa.MembershipId = requesterMembership.MembershipId
              AND upa.PropertyId = ps.PropertyId
            WHERE requesterMembership.OrganizationId = ps.OrganizationId
              AND requesterMembership.UserId = @UserId
              AND LOWER(LTRIM(RTRIM(requester.Status))) = 'active'
              AND (
                LOWER(LTRIM(RTRIM(requesterMembership.Role)))
                  IN ('owner', 'administrator')
                OR upa.AccessId IS NOT NULL
              )
          )
        ORDER BY ps.CreatedAt DESC;
      `);

    return result.recordset;
  }

  // =====================================================
  // GET ONE SERVICE IF USER HAS PROPERTY ACCESS
  // =====================================================

  async getById(
    propertyServiceId: string,
    organizationId: string,
    userId: string
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input(
        "PropertyServiceId",
        sql.UniqueIdentifier,
        propertyServiceId
      )
      .input("OrganizationId", sql.UniqueIdentifier, organizationId)
      .input("UserId", sql.UniqueIdentifier, userId)
      .query(`
        SELECT TOP 1
          ps.PropertyServiceId,
          ps.OrganizationId,
          ps.PropertyId,
          p.PropertyName,
          ps.ServiceProviderId,
          sp.CompanyName AS ServiceProviderName,
          ps.AssignedMembershipId,
          assignedUser.FirstName AS AssignedFirstName,
          assignedUser.LastName AS AssignedLastName,
          assignedUser.Email AS AssignedEmail,
          ps.ServiceName,
          ps.ServiceCategory,
          ps.Description,
          ps.ServiceFrequency,
          ps.ContractReference,
          ps.ContractStartDate,
          ps.ContractEndDate,
          ps.NextServiceDate,
          ps.Notes,
          ps.Status,
          ps.CreatedAt,
          ps.CreatedByUserId
        FROM dbo.PropertyServices ps
        INNER JOIN dbo.Properties p
          ON p.PropertyId = ps.PropertyId
          AND p.OrganizationId = ps.OrganizationId
        INNER JOIN dbo.Organizations o
          ON o.OrganizationId = ps.OrganizationId
        LEFT JOIN dbo.ServiceProviders sp
          ON sp.ServiceProviderId = ps.ServiceProviderId
          AND sp.OrganizationId = ps.OrganizationId
        LEFT JOIN dbo.Memberships assignedMembership
          ON assignedMembership.MembershipId = ps.AssignedMembershipId
          AND assignedMembership.OrganizationId = ps.OrganizationId
        LEFT JOIN dbo.Users assignedUser
          ON assignedUser.UserId = assignedMembership.UserId
        WHERE ps.PropertyServiceId = @PropertyServiceId
          AND ps.OrganizationId = @OrganizationId
          AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
          AND EXISTS (
            SELECT 1
            FROM dbo.Memberships requesterMembership
            INNER JOIN dbo.Users requester
              ON requester.UserId = requesterMembership.UserId
            LEFT JOIN dbo.UserPropertyAccess upa
              ON upa.MembershipId = requesterMembership.MembershipId
              AND upa.PropertyId = ps.PropertyId
            WHERE requesterMembership.OrganizationId = ps.OrganizationId
              AND requesterMembership.UserId = @UserId
              AND LOWER(LTRIM(RTRIM(requester.Status))) = 'active'
              AND (
                LOWER(LTRIM(RTRIM(requesterMembership.Role)))
                  IN ('owner', 'administrator')
                OR upa.AccessId IS NOT NULL
              )
          );
      `);

    return result.recordset[0] ?? null;
  }

  // =====================================================
  // CREATE PROPERTY SERVICE
  // Only active Owners and Administrators
  //
  // Exactly one active same-organization assignee
  // is required.
  // =====================================================

  async create(data: CreatePropertyServiceInput, userId: string) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("UserId", sql.UniqueIdentifier, userId)
      .input("OrganizationId", sql.UniqueIdentifier, data.organizationId)
      .input("PropertyId", sql.UniqueIdentifier, data.propertyId)
      .input(
        "ServiceProviderId",
        sql.UniqueIdentifier,
        data.serviceProviderId ?? null
      )
      .input(
        "AssignedMembershipId",
        sql.UniqueIdentifier,
        data.assignedMembershipId ?? null
      )
      .input("ServiceName", sql.NVarChar(150), data.serviceName)
      .input("ServiceCategory", sql.NVarChar(100), data.serviceCategory)
      .input("Description", sql.NVarChar(2000), data.description ?? null)
      .input(
        "ServiceFrequency",
        sql.NVarChar(100),
        data.serviceFrequency ?? null
      )
      .input(
        "ContractReference",
        sql.NVarChar(100),
        data.contractReference ?? null
      )
      .input(
        "ContractStartDate",
        sql.Date,
        data.contractStartDate ?? null
      )
      .input(
        "ContractEndDate",
        sql.Date,
        data.contractEndDate ?? null
      )
      .input(
        "NextServiceDate",
        sql.DateTime2,
        data.nextServiceDate ?? null
      )
      .input("Notes", sql.NVarChar(sql.MAX), data.notes ?? null)
      .input("Status", sql.NVarChar(30), data.status ?? "active")
      .query(`
        INSERT INTO dbo.PropertyServices (
          OrganizationId,
          PropertyId,
          ServiceProviderId,
          AssignedMembershipId,
          ServiceName,
          ServiceCategory,
          Description,
          ServiceFrequency,
          ContractReference,
          ContractStartDate,
          ContractEndDate,
          NextServiceDate,
          Notes,
          Status,
          CreatedAt,
          CreatedByUserId
        )
        OUTPUT INSERTED.*
        SELECT
          @OrganizationId,
          @PropertyId,
          @ServiceProviderId,
          @AssignedMembershipId,
          @ServiceName,
          @ServiceCategory,
          @Description,
          @ServiceFrequency,
          @ContractReference,
          @ContractStartDate,
          @ContractEndDate,
          @NextServiceDate,
          @Notes,
          @Status,
          SYSDATETIME(),
          @UserId
        WHERE EXISTS (
          SELECT 1
          FROM dbo.Memberships requesterMembership
          INNER JOIN dbo.Organizations o
            ON o.OrganizationId = requesterMembership.OrganizationId
          INNER JOIN dbo.Users requester
            ON requester.UserId = requesterMembership.UserId
          WHERE requesterMembership.UserId = @UserId
            AND requesterMembership.OrganizationId = @OrganizationId
            AND LOWER(LTRIM(RTRIM(requester.Status))) = 'active'
            AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
            AND LOWER(LTRIM(RTRIM(requesterMembership.Role)))
              IN ('owner', 'administrator')
        )
        AND EXISTS (
          SELECT 1
          FROM dbo.Properties p
          WHERE p.PropertyId = @PropertyId
            AND p.OrganizationId = @OrganizationId
        )
        AND (
          (
            @AssignedMembershipId IS NOT NULL
            AND @ServiceProviderId IS NULL
            AND EXISTS (
              SELECT 1
              FROM dbo.Memberships assignedMembership
              INNER JOIN dbo.Users assignedUser
                ON assignedUser.UserId = assignedMembership.UserId
              WHERE assignedMembership.MembershipId = @AssignedMembershipId
                AND assignedMembership.OrganizationId = @OrganizationId
                AND LOWER(LTRIM(RTRIM(assignedUser.Status))) = 'active'
            )
          )
          OR
          (
            @ServiceProviderId IS NOT NULL
            AND @AssignedMembershipId IS NULL
            AND EXISTS (
              SELECT 1
              FROM dbo.ServiceProviders sp
              WHERE sp.ServiceProviderId = @ServiceProviderId
                AND sp.OrganizationId = @OrganizationId
                AND LOWER(LTRIM(RTRIM(sp.Status))) = 'active'
            )
          )
        );
      `);

    return result.recordset[0] ?? null;
  }

  // =====================================================
  // UPDATE PROPERTY SERVICE
  // Only active Owners and Administrators
  // =====================================================

  async update(
    propertyServiceId: string,
    organizationId: string,
    userId: string,
    data: UpdatePropertyServiceInput
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input(
        "PropertyServiceId",
        sql.UniqueIdentifier,
        propertyServiceId
      )
      .input("OrganizationId", sql.UniqueIdentifier, organizationId)
      .input("UserId", sql.UniqueIdentifier, userId)
      .input(
        "ServiceProviderId",
        sql.UniqueIdentifier,
        data.serviceProviderId
      )
      .input(
        "AssignedMembershipId",
        sql.UniqueIdentifier,
        data.assignedMembershipId
      )
      .input("ServiceName", sql.NVarChar(150), data.serviceName)
      .input("ServiceCategory", sql.NVarChar(100), data.serviceCategory)
      .input("Description", sql.NVarChar(2000), data.description)
      .input(
        "ServiceFrequency",
        sql.NVarChar(100),
        data.serviceFrequency
      )
      .input(
        "ContractReference",
        sql.NVarChar(100),
        data.contractReference
      )
      .input("ContractStartDate", sql.Date, data.contractStartDate)
      .input("ContractEndDate", sql.Date, data.contractEndDate)
      .input("NextServiceDate", sql.DateTime2, data.nextServiceDate)
      .input("Notes", sql.NVarChar(sql.MAX), data.notes)
      .input("Status", sql.NVarChar(30), data.status)
      .query(`
        UPDATE ps
        SET
          ServiceProviderId = @ServiceProviderId,
          AssignedMembershipId = @AssignedMembershipId,
          ServiceName = @ServiceName,
          ServiceCategory = @ServiceCategory,
          Description = @Description,
          ServiceFrequency = @ServiceFrequency,
          ContractReference = @ContractReference,
          ContractStartDate = @ContractStartDate,
          ContractEndDate = @ContractEndDate,
          NextServiceDate = @NextServiceDate,
          Notes = @Notes,
          Status = @Status
        OUTPUT INSERTED.*
        FROM dbo.PropertyServices ps
        WHERE ps.PropertyServiceId = @PropertyServiceId
          AND ps.OrganizationId = @OrganizationId
          AND EXISTS (
            SELECT 1
            FROM dbo.Memberships requesterMembership
            INNER JOIN dbo.Organizations o
              ON o.OrganizationId = requesterMembership.OrganizationId
            INNER JOIN dbo.Users requester
              ON requester.UserId = requesterMembership.UserId
            WHERE requesterMembership.UserId = @UserId
              AND requesterMembership.OrganizationId = ps.OrganizationId
              AND LOWER(LTRIM(RTRIM(requester.Status))) = 'active'
              AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
              AND LOWER(LTRIM(RTRIM(requesterMembership.Role)))
                IN ('owner', 'administrator')
          )
          AND (
            (
              @AssignedMembershipId IS NOT NULL
              AND @ServiceProviderId IS NULL
              AND EXISTS (
                SELECT 1
                FROM dbo.Memberships assignedMembership
                INNER JOIN dbo.Users assignedUser
                  ON assignedUser.UserId = assignedMembership.UserId
                WHERE assignedMembership.MembershipId = @AssignedMembershipId
                  AND assignedMembership.OrganizationId = @OrganizationId
                  AND LOWER(LTRIM(RTRIM(assignedUser.Status))) = 'active'
              )
            )
            OR
            (
              @ServiceProviderId IS NOT NULL
              AND @AssignedMembershipId IS NULL
              AND EXISTS (
                SELECT 1
                FROM dbo.ServiceProviders sp
                WHERE sp.ServiceProviderId = @ServiceProviderId
                  AND sp.OrganizationId = @OrganizationId
                  AND LOWER(LTRIM(RTRIM(sp.Status))) = 'active'
              )
            )
          );
      `);

    return result.recordset[0] ?? null;
  }

  // =====================================================
  // UPDATE SERVICE STATUS
  // Only active Owners and Administrators
  // =====================================================

  async updateStatus(
    propertyServiceId: string,
    organizationId: string,
    userId: string,
    data: UpdatePropertyServiceStatusInput
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input(
        "PropertyServiceId",
        sql.UniqueIdentifier,
        propertyServiceId
      )
      .input("OrganizationId", sql.UniqueIdentifier, organizationId)
      .input("UserId", sql.UniqueIdentifier, userId)
      .input("Status", sql.NVarChar(30), data.status)
      .query(`
        UPDATE ps
        SET Status = @Status
        OUTPUT INSERTED.*
        FROM dbo.PropertyServices ps
        WHERE ps.PropertyServiceId = @PropertyServiceId
          AND ps.OrganizationId = @OrganizationId
          AND EXISTS (
            SELECT 1
            FROM dbo.Memberships requesterMembership
            INNER JOIN dbo.Organizations o
              ON o.OrganizationId = requesterMembership.OrganizationId
            INNER JOIN dbo.Users requester
              ON requester.UserId = requesterMembership.UserId
            WHERE requesterMembership.UserId = @UserId
              AND requesterMembership.OrganizationId = ps.OrganizationId
              AND LOWER(LTRIM(RTRIM(requester.Status))) = 'active'
              AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
              AND LOWER(LTRIM(RTRIM(requesterMembership.Role)))
                IN ('owner', 'administrator')
          );
      `);

    return result.recordset[0] ?? null;
  }
}
