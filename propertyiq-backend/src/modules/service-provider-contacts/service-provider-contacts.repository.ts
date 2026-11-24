
import { getDatabase, sql } from "../../config/database";

import type {
  CreateServiceProviderContactInput,
  UpdateServiceProviderContactInput,
  UpdateServiceProviderContactStatusInput,
} from "./service-provider-contacts.validation";

export class ServiceProviderContactsRepository {
  // =====================================================
  // GET ALL CONTACTS FOR A SERVICE PROVIDER
  //
  // Any active organization member can read contacts.
  // Includes active and inactive contacts.
  // =====================================================

  async getAll(
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
          c.ProviderContactId AS providerContactId,
          c.OrganizationId AS organizationId,
          c.ServiceProviderId AS serviceProviderId,
          c.ContactName AS contactName,
          c.JobTitle AS jobTitle,
          c.Email AS email,
          c.Phone AS phone,
          c.IsPrimary AS isPrimary,
          c.IsActive AS isActive,
          c.Notes AS notes,
          c.CreatedAt AS createdAt

        FROM dbo.ServiceProviderContacts c

        INNER JOIN dbo.ServiceProviders sp
          ON sp.ServiceProviderId = c.ServiceProviderId
          AND sp.OrganizationId = c.OrganizationId

        WHERE c.ServiceProviderId = @serviceProviderId
          AND c.OrganizationId = @organizationId

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
          c.IsPrimary DESC,
          c.IsActive DESC,
          c.ContactName ASC;
      `);

    return result.recordset;
  }

  // =====================================================
  // GET CONTACT BY ID
  //
  // Organization isolation is enforced.
  // =====================================================

  async getById(
    providerContactId: string,
    organizationId: string,
    userId: string
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("providerContactId", sql.UniqueIdentifier, providerContactId)
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        SELECT
          c.ProviderContactId AS providerContactId,
          c.OrganizationId AS organizationId,
          c.ServiceProviderId AS serviceProviderId,
          c.ContactName AS contactName,
          c.JobTitle AS jobTitle,
          c.Email AS email,
          c.Phone AS phone,
          c.IsPrimary AS isPrimary,
          c.IsActive AS isActive,
          c.Notes AS notes,
          c.CreatedAt AS createdAt

        FROM dbo.ServiceProviderContacts c

        WHERE c.ProviderContactId = @providerContactId
          AND c.OrganizationId = @organizationId

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
  // CREATE CONTACT
  //
  // Owner / Administrator only.
  // Provider must be active and belong to the organization.
  // Primary contact changes are transaction-protected.
  // =====================================================

  async create(data: CreateServiceProviderContactInput, userId: string) {
    const pool = await getDatabase();
    const transaction = new sql.Transaction(pool);

    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    try {
      // Lock the provider row to serialize primary-contact
      // changes for this provider.

      const providerResult = await transaction
        .request()
        .input(
          "serviceProviderId",
          sql.UniqueIdentifier,
          data.serviceProviderId
        )
        .input("organizationId", sql.UniqueIdentifier, data.organizationId)
        .input("userId", sql.UniqueIdentifier, userId)
        .query(`
          SELECT
            sp.ServiceProviderId

          FROM dbo.ServiceProviders sp WITH (UPDLOCK, HOLDLOCK)

          WHERE sp.ServiceProviderId = @serviceProviderId
            AND sp.OrganizationId = @organizationId
            AND LOWER(LTRIM(RTRIM(sp.Status))) = 'active'

            AND EXISTS (
              SELECT 1
              FROM dbo.Memberships m

              INNER JOIN dbo.Organizations o
                ON o.OrganizationId = m.OrganizationId

              INNER JOIN dbo.Users u
                ON u.UserId = m.UserId

              WHERE m.UserId = @userId
                AND m.OrganizationId = @organizationId
                AND LOWER(LTRIM(RTRIM(m.Role)))
                  IN ('owner', 'administrator')
                AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
                AND LOWER(LTRIM(RTRIM(u.Status))) = 'active'
            );
        `);

      if (!providerResult.recordset[0]) {
        await transaction.rollback();
        return null;
      }

      if (data.isPrimary ?? false) {
        await transaction
          .request()
          .input(
            "serviceProviderId",
            sql.UniqueIdentifier,
            data.serviceProviderId
          )
          .input("organizationId", sql.UniqueIdentifier, data.organizationId)
          .query(`
            UPDATE dbo.ServiceProviderContacts

            SET IsPrimary = 0

            WHERE ServiceProviderId = @serviceProviderId
              AND OrganizationId = @organizationId
              AND IsPrimary = 1
              AND IsActive = 1;
          `);
      }

      const result = await transaction
        .request()
        .input("organizationId", sql.UniqueIdentifier, data.organizationId)
        .input(
          "serviceProviderId",
          sql.UniqueIdentifier,
          data.serviceProviderId
        )
        .input("contactName", sql.NVarChar(200), data.contactName)
        .input("jobTitle", sql.NVarChar(150), data.jobTitle ?? null)
        .input("email", sql.NVarChar(255), data.email ?? null)
        .input("phone", sql.NVarChar(50), data.phone ?? null)
        .input("isPrimary", sql.Bit, data.isPrimary ?? false)
        .input("notes", sql.NVarChar(sql.MAX), data.notes ?? null)
        .query(`
          INSERT INTO dbo.ServiceProviderContacts (
            OrganizationId,
            ServiceProviderId,
            ContactName,
            JobTitle,
            Email,
            Phone,
            IsPrimary,
            Notes
          )

          OUTPUT
            INSERTED.ProviderContactId AS providerContactId,
            INSERTED.OrganizationId AS organizationId,
            INSERTED.ServiceProviderId AS serviceProviderId,
            INSERTED.ContactName AS contactName,
            INSERTED.JobTitle AS jobTitle,
            INSERTED.Email AS email,
            INSERTED.Phone AS phone,
            INSERTED.IsPrimary AS isPrimary,
            INSERTED.IsActive AS isActive,
            INSERTED.Notes AS notes,
            INSERTED.CreatedAt AS createdAt

          VALUES (
            @organizationId,
            @serviceProviderId,
            @contactName,
            @jobTitle,
            @email,
            @phone,
            @isPrimary,
            @notes
          );
        `);

      await transaction.commit();

      return result.recordset[0] ?? null;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  // =====================================================
  // UPDATE CONTACT
  //
  // Owner / Administrator only.
  // Provider ownership cannot be changed.
  // =====================================================

  async update(
    providerContactId: string,
    organizationId: string,
    userId: string,
    data: UpdateServiceProviderContactInput
  ) {
    const pool = await getDatabase();
    const transaction = new sql.Transaction(pool);

    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    try {
      // Lock the provider row associated with this contact.

      const providerResult = await transaction
        .request()
        .input("providerContactId", sql.UniqueIdentifier, providerContactId)
        .input("organizationId", sql.UniqueIdentifier, organizationId)
        .input("userId", sql.UniqueIdentifier, userId)
        .query(`
          SELECT
            sp.ServiceProviderId

          FROM dbo.ServiceProviders sp WITH (UPDLOCK, HOLDLOCK)

          INNER JOIN dbo.ServiceProviderContacts c
            ON c.ServiceProviderId = sp.ServiceProviderId
            AND c.OrganizationId = sp.OrganizationId

          WHERE c.ProviderContactId = @providerContactId
            AND c.OrganizationId = @organizationId
            AND LOWER(LTRIM(RTRIM(sp.Status))) = 'active'

            AND EXISTS (
              SELECT 1
              FROM dbo.Memberships m

              INNER JOIN dbo.Organizations o
                ON o.OrganizationId = m.OrganizationId

              INNER JOIN dbo.Users u
                ON u.UserId = m.UserId

              WHERE m.UserId = @userId
                AND m.OrganizationId = @organizationId
                AND LOWER(LTRIM(RTRIM(m.Role)))
                  IN ('owner', 'administrator')
                AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
                AND LOWER(LTRIM(RTRIM(u.Status))) = 'active'
            );
        `);

      const provider = providerResult.recordset[0];

      if (!provider) {
        await transaction.rollback();
        return null;
      }

      if (data.isPrimary) {
        await transaction
          .request()
          .input(
            "serviceProviderId",
            sql.UniqueIdentifier,
            provider.ServiceProviderId
          )
          .input("organizationId", sql.UniqueIdentifier, organizationId)
          .input("providerContactId", sql.UniqueIdentifier, providerContactId)
          .query(`
            UPDATE dbo.ServiceProviderContacts

            SET IsPrimary = 0

            WHERE ServiceProviderId = @serviceProviderId
              AND OrganizationId = @organizationId
              AND ProviderContactId <> @providerContactId
              AND IsPrimary = 1
              AND IsActive = 1;
          `);
      }

      const result = await transaction
        .request()
        .input("providerContactId", sql.UniqueIdentifier, providerContactId)
        .input("organizationId", sql.UniqueIdentifier, organizationId)
        .input("contactName", sql.NVarChar(200), data.contactName)
        .input("jobTitle", sql.NVarChar(150), data.jobTitle)
        .input("email", sql.NVarChar(255), data.email)
        .input("phone", sql.NVarChar(50), data.phone)
        .input("isPrimary", sql.Bit, data.isPrimary)
        .input("notes", sql.NVarChar(sql.MAX), data.notes)
        .query(`
          UPDATE dbo.ServiceProviderContacts

          SET
            ContactName = @contactName,
            JobTitle = @jobTitle,
            Email = @email,
            Phone = @phone,
            IsPrimary = @isPrimary,
            Notes = @notes

          OUTPUT
            INSERTED.ProviderContactId AS providerContactId,
            INSERTED.OrganizationId AS organizationId,
            INSERTED.ServiceProviderId AS serviceProviderId,
            INSERTED.ContactName AS contactName,
            INSERTED.JobTitle AS jobTitle,
            INSERTED.Email AS email,
            INSERTED.Phone AS phone,
            INSERTED.IsPrimary AS isPrimary,
            INSERTED.IsActive AS isActive,
            INSERTED.Notes AS notes,
            INSERTED.CreatedAt AS createdAt

          WHERE ProviderContactId = @providerContactId
            AND OrganizationId = @organizationId;
        `);

      await transaction.commit();

      return result.recordset[0] ?? null;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  // =====================================================
  // UPDATE CONTACT STATUS
  //
  // Owner / Administrator only.
  // Deactivation also removes primary designation.
  // Reactivation does not automatically make a contact
  // the primary contact.
  // =====================================================

  async updateStatus(
    providerContactId: string,
    organizationId: string,
    userId: string,
    data: UpdateServiceProviderContactStatusInput
  ) {
    const pool = await getDatabase();
    const transaction = new sql.Transaction(pool);

    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    try {
      const providerResult = await transaction
        .request()
        .input("providerContactId", sql.UniqueIdentifier, providerContactId)
        .input("organizationId", sql.UniqueIdentifier, organizationId)
        .input("userId", sql.UniqueIdentifier, userId)
        .query(`
          SELECT
            sp.ServiceProviderId

          FROM dbo.ServiceProviders sp WITH (UPDLOCK, HOLDLOCK)

          INNER JOIN dbo.ServiceProviderContacts c
            ON c.ServiceProviderId = sp.ServiceProviderId
            AND c.OrganizationId = sp.OrganizationId

          WHERE c.ProviderContactId = @providerContactId
            AND c.OrganizationId = @organizationId
            AND LOWER(LTRIM(RTRIM(sp.Status))) = 'active'

            AND EXISTS (
              SELECT 1
              FROM dbo.Memberships m

              INNER JOIN dbo.Organizations o
                ON o.OrganizationId = m.OrganizationId

              INNER JOIN dbo.Users u
                ON u.UserId = m.UserId

              WHERE m.UserId = @userId
                AND m.OrganizationId = @organizationId
                AND LOWER(LTRIM(RTRIM(m.Role)))
                  IN ('owner', 'administrator')
                AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
                AND LOWER(LTRIM(RTRIM(u.Status))) = 'active'
            );
        `);

      if (!providerResult.recordset[0]) {
        await transaction.rollback();
        return null;
      }

      const result = await transaction
        .request()
        .input("providerContactId", sql.UniqueIdentifier, providerContactId)
        .input("organizationId", sql.UniqueIdentifier, organizationId)
        .input("isActive", sql.Bit, data.isActive)
        .query(`
          UPDATE dbo.ServiceProviderContacts

          SET
            IsActive = @isActive,
            IsPrimary = CASE
              WHEN @isActive = 0 THEN 0
              ELSE IsPrimary
            END

          OUTPUT
            INSERTED.ProviderContactId AS providerContactId,
            INSERTED.OrganizationId AS organizationId,
            INSERTED.ServiceProviderId AS serviceProviderId,
            INSERTED.ContactName AS contactName,
            INSERTED.IsPrimary AS isPrimary,
            INSERTED.IsActive AS isActive

          WHERE ProviderContactId = @providerContactId
            AND OrganizationId = @organizationId;
        `);

      await transaction.commit();

      return result.recordset[0] ?? null;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}
