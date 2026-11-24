
import { getDatabase, sql } from "../../config/database";

import type {
  CreateServiceProviderContractInput,
  UpdateServiceProviderContractInput,
  UpdateServiceProviderContractStatusInput,
} from "./service-provider-contracts.validation";

export class ServiceProviderContractsRepository {
  // =====================================================
  // SHARED CONTRACT SELECT
  // =====================================================

  private readonly contractSelect = `
    SELECT
      c.ContractId AS contractId,
      c.OrganizationId AS organizationId,
      c.ServiceProviderId AS serviceProviderId,
      sp.CompanyName AS serviceProviderName,
      c.PropertyId AS propertyId,
      p.PropertyName AS propertyName,
      c.PropertyServiceId AS propertyServiceId,
      ps.ServiceName AS serviceName,
      c.ContractName AS contractName,
      c.ContractNumber AS contractNumber,
      c.Description AS description,
      c.ContractValue AS contractValue,
      c.CurrencyCode AS currencyCode,
      c.StartDate AS startDate,
      c.EndDate AS endDate,
      c.RenewalDate AS renewalDate,
      c.AutoRenew AS autoRenew,
      c.NoticePeriodDays AS noticePeriodDays,
      c.Status AS status,
      c.Notes AS notes,
      c.CreatedByUserId AS createdByUserId,
      c.CreatedAt AS createdAt,
      c.UpdatedAt AS updatedAt

    FROM dbo.ServiceProviderContracts c

    INNER JOIN dbo.ServiceProviders sp
      ON sp.ServiceProviderId = c.ServiceProviderId
      AND sp.OrganizationId = c.OrganizationId

    LEFT JOIN dbo.Properties p
      ON p.PropertyId = c.PropertyId
      AND p.OrganizationId = c.OrganizationId

    LEFT JOIN dbo.PropertyServices ps
      ON ps.PropertyServiceId = c.PropertyServiceId
      AND ps.OrganizationId = c.OrganizationId
      AND ps.ServiceProviderId = c.ServiceProviderId
  `;

  // =====================================================
  // SHARED ACCESS CHECK
  //
  // Any active organization member can read.
  // =====================================================

  private readonly readAccessCheck = `
    EXISTS (
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
  `;

  // =====================================================
  // SHARED WRITE ACCESS CHECK
  //
  // Owner / Administrator only.
  // =====================================================

  private readonly writeAccessCheck = `
    EXISTS (
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
    )
  `;

  // =====================================================
  // SAFE TRANSACTION ROLLBACK
  // =====================================================

  private async rollback(transaction: sql.Transaction) {
    try {
      await transaction.rollback();
    } catch {
      // Preserve the original database error.
    }
  }

  // =====================================================
  // GET ALL CONTRACTS FOR A SERVICE PROVIDER
  //
  // Any active organization member can read.
  // Includes draft, active, expired, and terminated.
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
        ${this.contractSelect}

        WHERE c.ServiceProviderId = @serviceProviderId
          AND c.OrganizationId = @organizationId
          AND ${this.readAccessCheck}

        ORDER BY
          c.CreatedAt DESC,
          c.ContractName ASC;
      `);

    return result.recordset;
  }

  // =====================================================
  // GET CONTRACT BY ID
  //
  // Organization isolation is enforced.
  // =====================================================

  async getById(
    contractId: string,
    organizationId: string,
    userId: string
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("contractId", sql.UniqueIdentifier, contractId)
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        ${this.contractSelect}

        WHERE c.ContractId = @contractId
          AND c.OrganizationId = @organizationId
          AND ${this.readAccessCheck};
      `);

    return result.recordset[0] ?? null;
  }

  // =====================================================
  // CREATE CONTRACT
  //
  // Owner / Administrator only.
  // Provider must be active.
  //
  // Optional property and property-service relationships
  // must belong to the same organization and provider.
  // =====================================================

  async create(
    data: CreateServiceProviderContractInput,
    userId: string
  ) {
    const pool = await getDatabase();
    const transaction = new sql.Transaction(pool);

    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    try {
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
            AND ${this.writeAccessCheck};
        `);

      if (!providerResult.recordset[0]) {
        await this.rollback(transaction);
        return null;
      }

      // Validate optional property and property-service links.

      const relationshipResult = await transaction
        .request()
        .input("organizationId", sql.UniqueIdentifier, data.organizationId)
        .input("serviceProviderId", sql.UniqueIdentifier, data.serviceProviderId)
        .input("propertyId", sql.UniqueIdentifier, data.propertyId ?? null)
        .input(
          "propertyServiceId",
          sql.UniqueIdentifier,
          data.propertyServiceId ?? null
        )
        .query(`
          SELECT
            CASE
              WHEN
                (
                  @propertyId IS NULL
                  OR EXISTS (
                    SELECT 1
                    FROM dbo.Properties p
                    WHERE p.PropertyId = @propertyId
                      AND p.OrganizationId = @organizationId
                  )
                )
                AND
                (
                  @propertyServiceId IS NULL
                  OR EXISTS (
                    SELECT 1
                    FROM dbo.PropertyServices ps
                    WHERE ps.PropertyServiceId = @propertyServiceId
                      AND ps.OrganizationId = @organizationId
                      AND ps.ServiceProviderId = @serviceProviderId
                      AND (
                        @propertyId IS NULL
                        OR ps.PropertyId = @propertyId
                      )
                  )
                )
              THEN 1
              ELSE 0
            END AS isValid;
        `);

      if (!relationshipResult.recordset[0]?.isValid) {
        await this.rollback(transaction);
        return null;
      }

      const result = await transaction
        .request()
        .input("organizationId", sql.UniqueIdentifier, data.organizationId)
        .input(
          "serviceProviderId",
          sql.UniqueIdentifier,
          data.serviceProviderId
        )
        .input("propertyId", sql.UniqueIdentifier, data.propertyId ?? null)
        .input(
          "propertyServiceId",
          sql.UniqueIdentifier,
          data.propertyServiceId ?? null
        )
        .input("contractName", sql.NVarChar(200), data.contractName)
        .input("contractNumber", sql.NVarChar(150), data.contractNumber ?? null)
        .input("description", sql.NVarChar(2000), data.description ?? null)
        .input(
          "contractValue",
          sql.Decimal(18, 2),
          data.contractValue ?? null
        )
        .input("currencyCode", sql.Char(3), data.currencyCode ?? null)
        .input("startDate", sql.Date, data.startDate)
        .input("endDate", sql.Date, data.endDate ?? null)
        .input("renewalDate", sql.Date, data.renewalDate ?? null)
        .input("autoRenew", sql.Bit, data.autoRenew ?? false)
        .input(
          "noticePeriodDays",
          sql.Int,
          data.noticePeriodDays ?? null
        )
        .input("status", sql.NVarChar(30), data.status ?? "draft")
        .input("notes", sql.NVarChar(sql.MAX), data.notes ?? null)
        .input("createdByUserId", sql.UniqueIdentifier, userId)
        .query(`
          INSERT INTO dbo.ServiceProviderContracts (
            OrganizationId,
            ServiceProviderId,
            PropertyId,
            PropertyServiceId,
            ContractName,
            ContractNumber,
            Description,
            ContractValue,
            CurrencyCode,
            StartDate,
            EndDate,
            RenewalDate,
            AutoRenew,
            NoticePeriodDays,
            Status,
            Notes,
            CreatedByUserId
          )

          OUTPUT
            INSERTED.ContractId AS contractId,
            INSERTED.OrganizationId AS organizationId,
            INSERTED.ServiceProviderId AS serviceProviderId,
            INSERTED.PropertyId AS propertyId,
            INSERTED.PropertyServiceId AS propertyServiceId,
            INSERTED.ContractName AS contractName,
            INSERTED.ContractNumber AS contractNumber,
            INSERTED.Description AS description,
            INSERTED.ContractValue AS contractValue,
            INSERTED.CurrencyCode AS currencyCode,
            INSERTED.StartDate AS startDate,
            INSERTED.EndDate AS endDate,
            INSERTED.RenewalDate AS renewalDate,
            INSERTED.AutoRenew AS autoRenew,
            INSERTED.NoticePeriodDays AS noticePeriodDays,
            INSERTED.Status AS status,
            INSERTED.Notes AS notes,
            INSERTED.CreatedByUserId AS createdByUserId,
            INSERTED.CreatedAt AS createdAt,
            INSERTED.UpdatedAt AS updatedAt

          VALUES (
            @organizationId,
            @serviceProviderId,
            @propertyId,
            @propertyServiceId,
            @contractName,
            @contractNumber,
            @description,
            @contractValue,
            @currencyCode,
            @startDate,
            @endDate,
            @renewalDate,
            @autoRenew,
            @noticePeriodDays,
            @status,
            @notes,
            @createdByUserId
          );
        `);

      await transaction.commit();

      return result.recordset[0] ?? null;
    } catch (error) {
      await this.rollback(transaction);
      throw error;
    }
  }

  // =====================================================
  // UPDATE CONTRACT
  //
  // Owner / Administrator only.
  // Provider ownership cannot be changed.
  // =====================================================

  async update(
    contractId: string,
    organizationId: string,
    userId: string,
    data: UpdateServiceProviderContractInput
  ) {
    const pool = await getDatabase();
    const transaction = new sql.Transaction(pool);

    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    try {
      const contractResult = await transaction
        .request()
        .input("contractId", sql.UniqueIdentifier, contractId)
        .input("organizationId", sql.UniqueIdentifier, organizationId)
        .input("userId", sql.UniqueIdentifier, userId)
        .query(`
          SELECT
            c.ServiceProviderId

          FROM dbo.ServiceProviderContracts c WITH (UPDLOCK, HOLDLOCK)

          INNER JOIN dbo.ServiceProviders sp
            ON sp.ServiceProviderId = c.ServiceProviderId
            AND sp.OrganizationId = c.OrganizationId

          WHERE c.ContractId = @contractId
            AND c.OrganizationId = @organizationId
            AND LOWER(LTRIM(RTRIM(sp.Status))) = 'active'
            AND ${this.writeAccessCheck};
        `);

      const contract = contractResult.recordset[0];

      if (!contract) {
        await this.rollback(transaction);
        return null;
      }

      const relationshipResult = await transaction
        .request()
        .input("organizationId", sql.UniqueIdentifier, organizationId)
        .input(
          "serviceProviderId",
          sql.UniqueIdentifier,
          contract.ServiceProviderId
        )
        .input("propertyId", sql.UniqueIdentifier, data.propertyId ?? null)
        .input(
          "propertyServiceId",
          sql.UniqueIdentifier,
          data.propertyServiceId ?? null
        )
        .query(`
          SELECT
            CASE
              WHEN
                (
                  @propertyId IS NULL
                  OR EXISTS (
                    SELECT 1
                    FROM dbo.Properties p
                    WHERE p.PropertyId = @propertyId
                      AND p.OrganizationId = @organizationId
                  )
                )
                AND
                (
                  @propertyServiceId IS NULL
                  OR EXISTS (
                    SELECT 1
                    FROM dbo.PropertyServices ps
                    WHERE ps.PropertyServiceId = @propertyServiceId
                      AND ps.OrganizationId = @organizationId
                      AND ps.ServiceProviderId = @serviceProviderId
                      AND (
                        @propertyId IS NULL
                        OR ps.PropertyId = @propertyId
                      )
                  )
                )
              THEN 1
              ELSE 0
            END AS isValid;
        `);

      if (!relationshipResult.recordset[0]?.isValid) {
        await this.rollback(transaction);
        return null;
      }

      const result = await transaction
        .request()
        .input("contractId", sql.UniqueIdentifier, contractId)
        .input("organizationId", sql.UniqueIdentifier, organizationId)
        .input("propertyId", sql.UniqueIdentifier, data.propertyId ?? null)
        .input(
          "propertyServiceId",
          sql.UniqueIdentifier,
          data.propertyServiceId ?? null
        )
        .input("contractName", sql.NVarChar(200), data.contractName)
        .input("contractNumber", sql.NVarChar(150), data.contractNumber ?? null)
        .input("description", sql.NVarChar(2000), data.description ?? null)
        .input(
          "contractValue",
          sql.Decimal(18, 2),
          data.contractValue ?? null
        )
        .input("currencyCode", sql.Char(3), data.currencyCode ?? null)
        .input("startDate", sql.Date, data.startDate)
        .input("endDate", sql.Date, data.endDate ?? null)
        .input("renewalDate", sql.Date, data.renewalDate ?? null)
        .input("autoRenew", sql.Bit, data.autoRenew)
        .input(
          "noticePeriodDays",
          sql.Int,
          data.noticePeriodDays ?? null
        )
        .input("notes", sql.NVarChar(sql.MAX), data.notes ?? null)
        .query(`
          UPDATE dbo.ServiceProviderContracts

          SET
            PropertyId = @propertyId,
            PropertyServiceId = @propertyServiceId,
            ContractName = @contractName,
            ContractNumber = @contractNumber,
            Description = @description,
            ContractValue = @contractValue,
            CurrencyCode = @currencyCode,
            StartDate = @startDate,
            EndDate = @endDate,
            RenewalDate = @renewalDate,
            AutoRenew = @autoRenew,
            NoticePeriodDays = @noticePeriodDays,
            Notes = @notes,
            UpdatedAt = SYSUTCDATETIME()

          OUTPUT
            INSERTED.ContractId AS contractId,
            INSERTED.OrganizationId AS organizationId,
            INSERTED.ServiceProviderId AS serviceProviderId,
            INSERTED.PropertyId AS propertyId,
            INSERTED.PropertyServiceId AS propertyServiceId,
            INSERTED.ContractName AS contractName,
            INSERTED.ContractNumber AS contractNumber,
            INSERTED.Description AS description,
            INSERTED.ContractValue AS contractValue,
            INSERTED.CurrencyCode AS currencyCode,
            INSERTED.StartDate AS startDate,
            INSERTED.EndDate AS endDate,
            INSERTED.RenewalDate AS renewalDate,
            INSERTED.AutoRenew AS autoRenew,
            INSERTED.NoticePeriodDays AS noticePeriodDays,
            INSERTED.Status AS status,
            INSERTED.Notes AS notes,
            INSERTED.CreatedByUserId AS createdByUserId,
            INSERTED.CreatedAt AS createdAt,
            INSERTED.UpdatedAt AS updatedAt

          WHERE ContractId = @contractId
            AND OrganizationId = @organizationId;
        `);

      await transaction.commit();

      return result.recordset[0] ?? null;
    } catch (error) {
      await this.rollback(transaction);
      throw error;
    }
  }

  // =====================================================
  // UPDATE CONTRACT STATUS
  //
  // Owner / Administrator only.
  // Records remain in the database.
  // =====================================================

  async updateStatus(
    contractId: string,
    organizationId: string,
    userId: string,
    data: UpdateServiceProviderContractStatusInput
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("contractId", sql.UniqueIdentifier, contractId)
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .input("userId", sql.UniqueIdentifier, userId)
      .input("status", sql.NVarChar(30), data.status)
      .query(`
        UPDATE c

        SET
          Status = @status,
          UpdatedAt = SYSUTCDATETIME()

        OUTPUT
          INSERTED.ContractId AS contractId,
          INSERTED.OrganizationId AS organizationId,
          INSERTED.ServiceProviderId AS serviceProviderId,
          INSERTED.PropertyId AS propertyId,
          INSERTED.PropertyServiceId AS propertyServiceId,
          INSERTED.ContractName AS contractName,
          INSERTED.ContractNumber AS contractNumber,
          INSERTED.StartDate AS startDate,
          INSERTED.EndDate AS endDate,
          INSERTED.RenewalDate AS renewalDate,
          INSERTED.AutoRenew AS autoRenew,
          INSERTED.NoticePeriodDays AS noticePeriodDays,
          INSERTED.Status AS status,
          INSERTED.UpdatedAt AS updatedAt

        FROM dbo.ServiceProviderContracts c

        INNER JOIN dbo.ServiceProviders sp
          ON sp.ServiceProviderId = c.ServiceProviderId
          AND sp.OrganizationId = c.OrganizationId

        WHERE c.ContractId = @contractId
          AND c.OrganizationId = @organizationId
          AND LOWER(LTRIM(RTRIM(sp.Status))) = 'active'
          AND ${this.writeAccessCheck};
      `);

    return result.recordset[0] ?? null;
  }
}
