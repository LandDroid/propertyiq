
import { getDatabase, sql } from "../../config/database";

import type {
  CreateServiceProviderInput,
  UpdateServiceProviderInput,
  UpdateServiceProviderStatusInput,
} from "./service-providers.validation";

export class ServiceProvidersRepository {
  // =====================================================
  // GET ALL SERVICE PROVIDERS
  //
  // Any active organization member can view providers.
  // Includes active and inactive providers.
  // =====================================================

  async getAll(organizationId: string, userId: string) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        SELECT
          sp.ServiceProviderId AS serviceProviderId,
          sp.OrganizationId AS organizationId,
          sp.CompanyName AS companyName,
          sp.ContactName AS contactName,
          sp.Email AS email,
          sp.Phone AS phone,
          sp.Website AS website,
          sp.Address AS address,
          sp.City AS city,
          sp.Province AS province,
          sp.PostalCode AS postalCode,
          sp.Country AS country,
          sp.Notes AS notes,
          sp.Status AS status,
          sp.CreatedAt AS createdAt

        FROM dbo.ServiceProviders sp

        WHERE sp.OrganizationId = @organizationId

          AND EXISTS (
            SELECT 1
            FROM dbo.Memberships m

            INNER JOIN dbo.Organizations o
              ON o.OrganizationId = m.OrganizationId

            INNER JOIN dbo.Users u
              ON u.UserId = m.UserId

            WHERE m.UserId = @userId
              AND m.OrganizationId = @organizationId
              AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
              AND LOWER(LTRIM(RTRIM(u.Status))) = 'active'
          )

        ORDER BY
          sp.CompanyName ASC;
      `);

    return result.recordset;
  }

  // =====================================================
  // GET SERVICE PROVIDER BY ID
  //
  // Organization isolation is enforced.
  // =====================================================

  async getById(
    serviceProviderId: string,
    organizationId: string,
    userId: string
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("serviceProviderId", sql.UniqueIdentifier, serviceProviderId)
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        SELECT
          sp.ServiceProviderId AS serviceProviderId,
          sp.OrganizationId AS organizationId,
          sp.CompanyName AS companyName,
          sp.ContactName AS contactName,
          sp.Email AS email,
          sp.Phone AS phone,
          sp.Website AS website,
          sp.Address AS address,
          sp.City AS city,
          sp.Province AS province,
          sp.PostalCode AS postalCode,
          sp.Country AS country,
          sp.Notes AS notes,
          sp.Status AS status,
          sp.CreatedAt AS createdAt

        FROM dbo.ServiceProviders sp

        WHERE sp.ServiceProviderId = @serviceProviderId
          AND sp.OrganizationId = @organizationId

          AND EXISTS (
            SELECT 1
            FROM dbo.Memberships m

            INNER JOIN dbo.Organizations o
              ON o.OrganizationId = m.OrganizationId

            INNER JOIN dbo.Users u
              ON u.UserId = m.UserId

            WHERE m.UserId = @userId
              AND m.OrganizationId = @organizationId
              AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
              AND LOWER(LTRIM(RTRIM(u.Status))) = 'active'
          );
      `);

    return result.recordset[0] ?? null;
  }

  // =====================================================
  // CREATE SERVICE PROVIDER
  //
  // Owner / Administrator only.
  // Organization and user must be active.
  // =====================================================

  async create(data: CreateServiceProviderInput, userId: string) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("organizationId", sql.UniqueIdentifier, data.organizationId)
      .input("userId", sql.UniqueIdentifier, userId)
      .input("companyName", sql.NVarChar(200), data.companyName)
      .input("contactName", sql.NVarChar(200), data.contactName ?? null)
      .input("email", sql.NVarChar(255), data.email ?? null)
      .input("phone", sql.NVarChar(50), data.phone ?? null)
      .input("website", sql.NVarChar(500), data.website ?? null)
      .input("address", sql.NVarChar(255), data.address ?? null)
      .input("city", sql.NVarChar(100), data.city ?? null)
      .input("province", sql.NVarChar(100), data.province ?? null)
      .input("postalCode", sql.NVarChar(30), data.postalCode ?? null)
      .input("country", sql.NVarChar(100), data.country ?? null)
      .input("notes", sql.NVarChar(sql.MAX), data.notes ?? null)
      .query(`
        INSERT INTO dbo.ServiceProviders (
          OrganizationId,
          CompanyName,
          ContactName,
          Email,
          Phone,
          Website,
          Address,
          City,
          Province,
          PostalCode,
          Country,
          Notes
        )

        OUTPUT
          INSERTED.ServiceProviderId AS serviceProviderId,
          INSERTED.OrganizationId AS organizationId,
          INSERTED.CompanyName AS companyName,
          INSERTED.ContactName AS contactName,
          INSERTED.Email AS email,
          INSERTED.Phone AS phone,
          INSERTED.Website AS website,
          INSERTED.Address AS address,
          INSERTED.City AS city,
          INSERTED.Province AS province,
          INSERTED.PostalCode AS postalCode,
          INSERTED.Country AS country,
          INSERTED.Notes AS notes,
          INSERTED.Status AS status,
          INSERTED.CreatedAt AS createdAt

        SELECT
          @organizationId,
          @companyName,
          @contactName,
          @email,
          @phone,
          @website,
          @address,
          @city,
          @province,
          @postalCode,
          @country,
          @notes

        WHERE EXISTS (
          SELECT 1
          FROM dbo.Memberships m

          INNER JOIN dbo.Organizations o
            ON o.OrganizationId = m.OrganizationId

          INNER JOIN dbo.Users u
            ON u.UserId = m.UserId

          WHERE m.UserId = @userId
            AND m.OrganizationId = @organizationId
            AND LOWER(LTRIM(RTRIM(m.Role))) IN ('owner', 'administrator')
            AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
            AND LOWER(LTRIM(RTRIM(u.Status))) = 'active'
        );
      `);

    return result.recordset[0] ?? null;
  }

  // =====================================================
  // UPDATE SERVICE PROVIDER
  //
  // Owner / Administrator only.
  // Does not change organization ownership.
  // =====================================================

  async update(
    serviceProviderId: string,
    organizationId: string,
    userId: string,
    data: UpdateServiceProviderInput
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("serviceProviderId", sql.UniqueIdentifier, serviceProviderId)
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .input("userId", sql.UniqueIdentifier, userId)
      .input("companyName", sql.NVarChar(200), data.companyName)
      .input("contactName", sql.NVarChar(200), data.contactName)
      .input("email", sql.NVarChar(255), data.email)
      .input("phone", sql.NVarChar(50), data.phone)
      .input("website", sql.NVarChar(500), data.website)
      .input("address", sql.NVarChar(255), data.address)
      .input("city", sql.NVarChar(100), data.city)
      .input("province", sql.NVarChar(100), data.province)
      .input("postalCode", sql.NVarChar(30), data.postalCode)
      .input("country", sql.NVarChar(100), data.country)
      .input("notes", sql.NVarChar(sql.MAX), data.notes)
      .query(`
        UPDATE dbo.ServiceProviders

        SET
          CompanyName = @companyName,
          ContactName = @contactName,
          Email = @email,
          Phone = @phone,
          Website = @website,
          Address = @address,
          City = @city,
          Province = @province,
          PostalCode = @postalCode,
          Country = @country,
          Notes = @notes

        OUTPUT
          INSERTED.ServiceProviderId AS serviceProviderId,
          INSERTED.OrganizationId AS organizationId,
          INSERTED.CompanyName AS companyName,
          INSERTED.ContactName AS contactName,
          INSERTED.Email AS email,
          INSERTED.Phone AS phone,
          INSERTED.Website AS website,
          INSERTED.Address AS address,
          INSERTED.City AS city,
          INSERTED.Province AS province,
          INSERTED.PostalCode AS postalCode,
          INSERTED.Country AS country,
          INSERTED.Notes AS notes,
          INSERTED.Status AS status,
          INSERTED.CreatedAt AS createdAt

        WHERE ServiceProviderId = @serviceProviderId
          AND OrganizationId = @organizationId

          AND EXISTS (
            SELECT 1
            FROM dbo.Memberships m

            INNER JOIN dbo.Organizations o
              ON o.OrganizationId = m.OrganizationId

            INNER JOIN dbo.Users u
              ON u.UserId = m.UserId

            WHERE m.UserId = @userId
              AND m.OrganizationId = @organizationId
              AND LOWER(LTRIM(RTRIM(m.Role))) IN ('owner', 'administrator')
              AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
              AND LOWER(LTRIM(RTRIM(u.Status))) = 'active'
          );
      `);

    return result.recordset[0] ?? null;
  }

  // =====================================================
  // UPDATE SERVICE PROVIDER STATUS
  //
  // Owner / Administrator only.
  // Deactivation preserves historical assignments.
  // =====================================================

  async updateStatus(
    serviceProviderId: string,
    organizationId: string,
    userId: string,
    data: UpdateServiceProviderStatusInput
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("serviceProviderId", sql.UniqueIdentifier, serviceProviderId)
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .input("userId", sql.UniqueIdentifier, userId)
      .input("status", sql.NVarChar(30), data.status)
      .query(`
        UPDATE dbo.ServiceProviders

        SET Status = @status

        OUTPUT
          INSERTED.ServiceProviderId AS serviceProviderId,
          INSERTED.OrganizationId AS organizationId,
          INSERTED.CompanyName AS companyName,
          INSERTED.Status AS status

        WHERE ServiceProviderId = @serviceProviderId
          AND OrganizationId = @organizationId

          AND EXISTS (
            SELECT 1
            FROM dbo.Memberships m

            INNER JOIN dbo.Organizations o
              ON o.OrganizationId = m.OrganizationId

            INNER JOIN dbo.Users u
              ON u.UserId = m.UserId

            WHERE m.UserId = @userId
              AND m.OrganizationId = @organizationId
              AND LOWER(LTRIM(RTRIM(m.Role))) IN ('owner', 'administrator')
              AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
              AND LOWER(LTRIM(RTRIM(u.Status))) = 'active'
          );
      `);

    return result.recordset[0] ?? null;
  }
}
