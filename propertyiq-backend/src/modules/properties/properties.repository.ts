
import { getDatabase, sql } from "../../config/database";
import type {
  CreatePropertyInput,
  UpdatePropertyInput,
} from "./properties.validation";

export class PropertiesRepository {
  // =====================================================
  // GET PROPERTIES THE USER IS ALLOWED TO SEE
  // Owner / Administrator: all organization properties
  // Member: explicitly assigned properties only
  // Active user and active organization required
  // =====================================================

  async getAll(organizationId: string, userId: string) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("OrganizationId", sql.UniqueIdentifier, organizationId)
      .input("UserId", sql.UniqueIdentifier, userId)
      .query(`
        SELECT DISTINCT
          p.PropertyId,
          p.OrganizationId,
          p.PropertyName,
          p.PropertyType,
          p.Address,
          p.City,
          p.Province,
          p.PostalCode,
          p.Country,
          p.TimeZone,
          p.Latitude,
          p.Longitude,
          p.Status,
          p.CreatedAt
        FROM dbo.Properties p
        INNER JOIN dbo.Organizations o
          ON o.OrganizationId = p.OrganizationId
        INNER JOIN dbo.Memberships m
          ON m.OrganizationId = p.OrganizationId
        INNER JOIN dbo.Users u
          ON u.UserId = m.UserId
        LEFT JOIN dbo.UserPropertyAccess upa
          ON upa.MembershipId = m.MembershipId
          AND upa.PropertyId = p.PropertyId
        WHERE p.OrganizationId = @OrganizationId
          AND m.UserId = @UserId
          AND LOWER(LTRIM(RTRIM(u.Status))) = 'active'
          AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
          AND (
            LOWER(LTRIM(RTRIM(m.Role))) IN ('owner', 'administrator')
            OR upa.AccessId IS NOT NULL
          )
        ORDER BY p.CreatedAt DESC;
      `);

    return result.recordset;
  }

  // =====================================================
  // GET ONE PROPERTY IF USER HAS ACCESS
  // =====================================================

  async getById(
    propertyId: string,
    organizationId: string,
    userId: string
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("PropertyId", sql.UniqueIdentifier, propertyId)
      .input("OrganizationId", sql.UniqueIdentifier, organizationId)
      .input("UserId", sql.UniqueIdentifier, userId)
      .query(`
        SELECT TOP 1
          p.PropertyId,
          p.OrganizationId,
          p.PropertyName,
          p.PropertyType,
          p.Address,
          p.City,
          p.Province,
          p.PostalCode,
          p.Country,
          p.TimeZone,
          p.Latitude,
          p.Longitude,
          p.Status,
          p.CreatedAt
        FROM dbo.Properties p
        INNER JOIN dbo.Organizations o
          ON o.OrganizationId = p.OrganizationId
        INNER JOIN dbo.Memberships m
          ON m.OrganizationId = p.OrganizationId
        INNER JOIN dbo.Users u
          ON u.UserId = m.UserId
        LEFT JOIN dbo.UserPropertyAccess upa
          ON upa.MembershipId = m.MembershipId
          AND upa.PropertyId = p.PropertyId
        WHERE p.PropertyId = @PropertyId
          AND p.OrganizationId = @OrganizationId
          AND m.UserId = @UserId
          AND LOWER(LTRIM(RTRIM(u.Status))) = 'active'
          AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
          AND (
            LOWER(LTRIM(RTRIM(m.Role))) IN ('owner', 'administrator')
            OR upa.AccessId IS NOT NULL
          );
      `);

    return result.recordset[0] ?? null;
  }

  // =====================================================
  // CREATE PROPERTY
  // Only active Owners and Administrators
  // =====================================================

  async create(data: CreatePropertyInput, userId: string) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("UserId", sql.UniqueIdentifier, userId)
      .input("OrganizationId", sql.UniqueIdentifier, data.organizationId)
      .input("PropertyName", sql.NVarChar(200), data.propertyName)
      .input("PropertyType", sql.NVarChar(50), data.propertyType)
      .input("Address", sql.NVarChar(300), data.address ?? null)
      .input("City", sql.NVarChar(100), data.city ?? null)
      .input("Province", sql.NVarChar(100), data.province ?? null)
      .input("PostalCode", sql.NVarChar(20), data.postalCode ?? null)
      .input("Country", sql.NVarChar(100), data.country)
      .input("TimeZone", sql.NVarChar(100), data.timeZone)
      .input("Latitude", sql.Decimal(9, 6), data.latitude ?? null)
      .input("Longitude", sql.Decimal(9, 6), data.longitude ?? null)
      .input("Status", sql.NVarChar(50), data.status)
      .query(`
        INSERT INTO dbo.Properties (
          OrganizationId,
          PropertyName,
          PropertyType,
          Address,
          City,
          Province,
          PostalCode,
          Country,
          TimeZone,
          Latitude,
          Longitude,
          Status
        )
        OUTPUT INSERTED.*
        SELECT
          @OrganizationId,
          @PropertyName,
          @PropertyType,
          @Address,
          @City,
          @Province,
          @PostalCode,
          @Country,
          @TimeZone,
          @Latitude,
          @Longitude,
          @Status
        WHERE EXISTS (
          SELECT 1
          FROM dbo.Memberships m
          INNER JOIN dbo.Organizations o
            ON o.OrganizationId = m.OrganizationId
          INNER JOIN dbo.Users u
            ON u.UserId = m.UserId
          WHERE m.UserId = @UserId
            AND m.OrganizationId = @OrganizationId
            AND LOWER(LTRIM(RTRIM(u.Status))) = 'active'
            AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
            AND LOWER(LTRIM(RTRIM(m.Role)))
              IN ('owner', 'administrator')
        );
      `);

    return result.recordset[0] ?? null;
  }

  // =====================================================
  // UPDATE PROPERTY
  // Only active Owners and Administrators
  // =====================================================

  async update(
    propertyId: string,
    organizationId: string,
    userId: string,
    data: UpdatePropertyInput
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("PropertyId", sql.UniqueIdentifier, propertyId)
      .input("OrganizationId", sql.UniqueIdentifier, organizationId)
      .input("UserId", sql.UniqueIdentifier, userId)
      .input("PropertyName", sql.NVarChar(200), data.propertyName)
      .input("PropertyType", sql.NVarChar(50), data.propertyType)
      .input("Address", sql.NVarChar(300), data.address ?? null)
      .input("City", sql.NVarChar(100), data.city ?? null)
      .input("Province", sql.NVarChar(100), data.province ?? null)
      .input("PostalCode", sql.NVarChar(20), data.postalCode ?? null)
      .input("Country", sql.NVarChar(100), data.country)
      .input("TimeZone", sql.NVarChar(100), data.timeZone)
      .input("Latitude", sql.Decimal(9, 6), data.latitude ?? null)
      .input("Longitude", sql.Decimal(9, 6), data.longitude ?? null)
      .input("Status", sql.NVarChar(50), data.status)
      .query(`
        UPDATE p
        SET
          PropertyName = @PropertyName,
          PropertyType = @PropertyType,
          Address = @Address,
          City = @City,
          Province = @Province,
          PostalCode = @PostalCode,
          Country = @Country,
          TimeZone = @TimeZone,
          Latitude = @Latitude,
          Longitude = @Longitude,
          Status = @Status
        OUTPUT INSERTED.*
        FROM dbo.Properties p
        WHERE p.PropertyId = @PropertyId
          AND p.OrganizationId = @OrganizationId
          AND EXISTS (
            SELECT 1
            FROM dbo.Memberships m
            INNER JOIN dbo.Organizations o
              ON o.OrganizationId = m.OrganizationId
            INNER JOIN dbo.Users u
              ON u.UserId = m.UserId
            WHERE m.UserId = @UserId
              AND m.OrganizationId = p.OrganizationId
              AND LOWER(LTRIM(RTRIM(u.Status))) = 'active'
              AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
              AND LOWER(LTRIM(RTRIM(m.Role)))
                IN ('owner', 'administrator')
          );
      `);

    return result.recordset[0] ?? null;
  }

  // =====================================================
  // DELETE PROPERTY
  // Only active Owners and Administrators
  // =====================================================

  async delete(
    propertyId: string,
    organizationId: string,
    userId: string
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("PropertyId", sql.UniqueIdentifier, propertyId)
      .input("OrganizationId", sql.UniqueIdentifier, organizationId)
      .input("UserId", sql.UniqueIdentifier, userId)
      .query(`
        DELETE p
        OUTPUT DELETED.PropertyId
        FROM dbo.Properties p
        WHERE p.PropertyId = @PropertyId
          AND p.OrganizationId = @OrganizationId
          AND EXISTS (
            SELECT 1
            FROM dbo.Memberships m
            INNER JOIN dbo.Organizations o
              ON o.OrganizationId = m.OrganizationId
            INNER JOIN dbo.Users u
              ON u.UserId = m.UserId
            WHERE m.UserId = @UserId
              AND m.OrganizationId = p.OrganizationId
              AND LOWER(LTRIM(RTRIM(u.Status))) = 'active'
              AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
              AND LOWER(LTRIM(RTRIM(m.Role)))
                IN ('owner', 'administrator')
          );
      `);

    return result.recordset.length > 0;
  }
}
