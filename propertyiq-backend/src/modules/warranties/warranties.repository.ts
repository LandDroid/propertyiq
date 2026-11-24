
import { getDatabase, sql } from "../../config/database";
import type {
  CreateWarrantyInput,
  UpdateWarrantyInput,
} from "./warranties.validation";

export type WarrantyAccessContext = {
  organizationId: string;
  membershipId: string;
  role: string;
};

function getRolePermissions(role: string) {
  const normalizedRole = role.trim().toLowerCase();

  return {
    isPrivileged:
      normalizedRole === "owner" ||
      normalizedRole === "administrator",
  };
}

function addAccessParameters(
  request: any,
  context: WarrantyAccessContext
) {
  const permissions = getRolePermissions(context.role);

  request
    .input("organizationId", sql.UniqueIdentifier, context.organizationId)
    .input("membershipId", sql.UniqueIdentifier, context.membershipId)
    .input("isPrivileged", sql.Bit, permissions.isPrivileged ? 1 : 0);

  return permissions;
}


const WARRANTY_ACCESS_FILTER = `
  AND (
    @isPrivileged = 1
    OR EXISTS (
      SELECT 1
      FROM dbo.UserPropertyAccess upa
      INNER JOIN dbo.Memberships membership
        ON membership.MembershipId = upa.MembershipId
      INNER JOIN dbo.Properties assignedProperty
        ON assignedProperty.PropertyId = upa.PropertyId
      WHERE
        upa.MembershipId = @membershipId
        AND membership.OrganizationId = @organizationId
        AND upa.PropertyId = p.PropertyId
        AND assignedProperty.OrganizationId = @organizationId
    )
  )
`;


const warrantySelect = `
  SELECT
    w.WarrantyId AS warrantyId,
    w.OrganizationId AS organizationId,
    w.AssetId AS assetId,
    w.WarrantyName AS warrantyName,
    w.WarrantyProvider AS warrantyProvider,
    w.WarrantyType AS warrantyType,
    w.WarrantyStartDate AS warrantyStartDate,
    w.WarrantyEndDate AS warrantyEndDate,
    w.CoverageDetails AS coverageDetails,
    w.ContractNumber AS contractNumber,
    w.Status AS status,
    CASE
      WHEN LOWER(w.Status) IN ('cancelled', 'void')
        THEN LOWER(w.Status)
      WHEN w.WarrantyEndDate IS NOT NULL
        AND CAST(w.WarrantyEndDate AS DATE) < CAST(GETDATE() AS DATE)
        THEN 'expired'
      WHEN w.WarrantyEndDate IS NOT NULL
        AND CAST(w.WarrantyEndDate AS DATE) <= DATEADD(DAY, 30, CAST(GETDATE() AS DATE))
        THEN 'expiring'
      ELSE 'active'
    END AS expiryStatus,
    CASE
      WHEN w.WarrantyEndDate IS NOT NULL
        THEN DATEDIFF(DAY, CAST(GETDATE() AS DATE), w.WarrantyEndDate)
      ELSE NULL
    END AS daysUntilExpiry,
    a.AssetName AS assetName,
    a.Category AS assetCategory,
    p.PropertyId AS propertyId,
    p.PropertyName AS propertyName,
    w.CreatedAt AS createdAt
  FROM dbo.AssetWarranties AS w
  INNER JOIN dbo.PropertyAssets AS a
    ON a.AssetId = w.AssetId
    AND a.OrganizationId = w.OrganizationId
  INNER JOIN dbo.Properties AS p
    ON p.PropertyId = a.PropertyId
    AND p.OrganizationId = w.OrganizationId
`;

export async function getAllWarranties(
  context: WarrantyAccessContext
) {
  const pool = await getDatabase();
  const request = pool.request();

  addAccessParameters(request, context);

  const result = await request.query(`
    ${warrantySelect}
    WHERE
      w.OrganizationId = @organizationId
      ${WARRANTY_ACCESS_FILTER}
    ORDER BY
      CASE
        WHEN w.Status IN ('cancelled', 'void') THEN 3
        WHEN w.WarrantyEndDate < CAST(GETDATE() AS DATE) THEN 2
        WHEN w.WarrantyEndDate <= DATEADD(DAY, 30, CAST(GETDATE() AS DATE)) THEN 1
        ELSE 0
      END,
      w.WarrantyEndDate ASC;
  `);

  return result.recordset;
}

export async function getWarrantyById(
  warrantyId: string,
  context: WarrantyAccessContext
) {
  const pool = await getDatabase();

  const request = pool
    .request()
    .input("warrantyId", sql.UniqueIdentifier, warrantyId);

  addAccessParameters(request, context);

  const result = await request.query(`
    ${warrantySelect}
    WHERE
      w.WarrantyId = @warrantyId
      AND w.OrganizationId = @organizationId
      ${WARRANTY_ACCESS_FILTER};
  `);

  return result.recordset[0] ?? null;
}

export async function createWarranty(
  data: CreateWarrantyInput,
  context: WarrantyAccessContext
) {
  const permissions = getRolePermissions(context.role);

  if (!permissions.isPrivileged) {
    throw new Error("You do not have permission to create warranties.");
  }

  const pool = await getDatabase();

  const result = await pool
    .request()
    .input("organizationId", sql.UniqueIdentifier, context.organizationId)
    .input("assetId", sql.UniqueIdentifier, data.assetId)
    .input("warrantyName", sql.NVarChar(150), data.warrantyName)
    .input("warrantyProvider", sql.NVarChar(150), data.warrantyProvider ?? null)
    .input("warrantyType", sql.NVarChar(50), data.warrantyType)
    .input("warrantyStartDate", sql.Date, data.warrantyStartDate ?? null)
    .input("warrantyEndDate", sql.Date, data.warrantyEndDate ?? null)
    .input("coverageDetails", sql.NVarChar(sql.MAX), data.coverageDetails ?? null)
    .input("contractNumber", sql.NVarChar(150), data.contractNumber ?? null)
    .input("status", sql.NVarChar(30), data.status)
    .query(`
      INSERT INTO dbo.AssetWarranties (
        OrganizationId,
        AssetId,
        WarrantyName,
        WarrantyProvider,
        WarrantyType,
        WarrantyStartDate,
        WarrantyEndDate,
        CoverageDetails,
        ContractNumber,
        Status
      )
      OUTPUT
        INSERTED.WarrantyId AS warrantyId,
        INSERTED.OrganizationId AS organizationId,
        INSERTED.AssetId AS assetId,
        INSERTED.WarrantyName AS warrantyName,
        INSERTED.WarrantyProvider AS warrantyProvider,
        INSERTED.WarrantyType AS warrantyType,
        INSERTED.WarrantyStartDate AS warrantyStartDate,
        INSERTED.WarrantyEndDate AS warrantyEndDate,
        INSERTED.CoverageDetails AS coverageDetails,
        INSERTED.ContractNumber AS contractNumber,
        INSERTED.Status AS status,
        INSERTED.CreatedAt AS createdAt
      SELECT
        @organizationId,
        a.AssetId,
        @warrantyName,
        @warrantyProvider,
        @warrantyType,
        @warrantyStartDate,
        @warrantyEndDate,
        @coverageDetails,
        @contractNumber,
        @status
      FROM dbo.PropertyAssets AS a
      INNER JOIN dbo.Properties AS p
        ON p.PropertyId = a.PropertyId
        AND p.OrganizationId = a.OrganizationId
      WHERE
        a.AssetId = @assetId
        AND a.OrganizationId = @organizationId;
    `);

  return result.recordset[0] ?? null;
}

export async function updateWarranty(
  warrantyId: string,
  context: WarrantyAccessContext,
  data: UpdateWarrantyInput
) {
  const permissions = getRolePermissions(context.role);

  if (!permissions.isPrivileged) {
    throw new Error("You do not have permission to update warranties.");
  }

  const pool = await getDatabase();

  const request = pool
    .request()
    .input("warrantyId", sql.UniqueIdentifier, warrantyId)
    .input("organizationId", sql.UniqueIdentifier, context.organizationId);

  const fields: string[] = [];

  if (data.assetId !== undefined) {
    request.input("assetId", sql.UniqueIdentifier, data.assetId);
    fields.push("AssetId = @assetId");
  }

  if (data.warrantyName !== undefined) {
    request.input("warrantyName", sql.NVarChar(150), data.warrantyName);
    fields.push("WarrantyName = @warrantyName");
  }

  if (data.warrantyProvider !== undefined) {
    request.input("warrantyProvider", sql.NVarChar(150), data.warrantyProvider);
    fields.push("WarrantyProvider = @warrantyProvider");
  }

  if (data.warrantyType !== undefined) {
    request.input("warrantyType", sql.NVarChar(50), data.warrantyType);
    fields.push("WarrantyType = @warrantyType");
  }

  if (data.warrantyStartDate !== undefined) {
    request.input("warrantyStartDate", sql.Date, data.warrantyStartDate);
    fields.push("WarrantyStartDate = @warrantyStartDate");
  }

  if (data.warrantyEndDate !== undefined) {
    request.input("warrantyEndDate", sql.Date, data.warrantyEndDate);
    fields.push("WarrantyEndDate = @warrantyEndDate");
  }

  if (data.coverageDetails !== undefined) {
    request.input("coverageDetails", sql.NVarChar(sql.MAX), data.coverageDetails);
    fields.push("CoverageDetails = @coverageDetails");
  }

  if (data.contractNumber !== undefined) {
    request.input("contractNumber", sql.NVarChar(150), data.contractNumber);
    fields.push("ContractNumber = @contractNumber");
  }

  if (data.status !== undefined) {
    request.input("status", sql.NVarChar(30), data.status);
    fields.push("Status = @status");
  }

  if (fields.length === 0) {
    return getWarrantyById(warrantyId, context);
  }

  const assetCondition =
    data.assetId !== undefined
      ? `AND EXISTS (
          SELECT 1
          FROM dbo.PropertyAssets AS targetAsset
          INNER JOIN dbo.Properties AS targetProperty
            ON targetProperty.PropertyId = targetAsset.PropertyId
            AND targetProperty.OrganizationId = targetAsset.OrganizationId
          WHERE
            targetAsset.AssetId = @assetId
            AND targetAsset.OrganizationId = @organizationId
        )`
      : "";

  const result = await request.query(`
    UPDATE w
    SET ${fields.join(", ")}
    OUTPUT
      INSERTED.WarrantyId AS warrantyId,
      INSERTED.OrganizationId AS organizationId,
      INSERTED.AssetId AS assetId,
      INSERTED.WarrantyName AS warrantyName,
      INSERTED.WarrantyProvider AS warrantyProvider,
      INSERTED.WarrantyType AS warrantyType,
      INSERTED.WarrantyStartDate AS warrantyStartDate,
      INSERTED.WarrantyEndDate AS warrantyEndDate,
      INSERTED.CoverageDetails AS coverageDetails,
      INSERTED.ContractNumber AS contractNumber,
      INSERTED.Status AS status,
      INSERTED.CreatedAt AS createdAt
    FROM dbo.AssetWarranties AS w
    INNER JOIN dbo.PropertyAssets AS a
      ON a.AssetId = w.AssetId
      AND a.OrganizationId = w.OrganizationId
    INNER JOIN dbo.Properties AS p
      ON p.PropertyId = a.PropertyId
      AND p.OrganizationId = w.OrganizationId
    WHERE
      w.WarrantyId = @warrantyId
      AND w.OrganizationId = @organizationId
      ${assetCondition};
  `);

  return result.recordset[0] ?? null;
}

export async function deleteWarranty(
  warrantyId: string,
  context: WarrantyAccessContext
) {
  const permissions = getRolePermissions(context.role);

  if (!permissions.isPrivileged) {
    throw new Error("You do not have permission to delete warranties.");
  }

  const pool = await getDatabase();

  const result = await pool
    .request()
    .input("warrantyId", sql.UniqueIdentifier, warrantyId)
    .input("organizationId", sql.UniqueIdentifier, context.organizationId)
    .query(`
      DELETE w
      OUTPUT DELETED.WarrantyId AS warrantyId
      FROM dbo.AssetWarranties AS w
      INNER JOIN dbo.PropertyAssets AS a
        ON a.AssetId = w.AssetId
        AND a.OrganizationId = w.OrganizationId
      INNER JOIN dbo.Properties AS p
        ON p.PropertyId = a.PropertyId
        AND p.OrganizationId = w.OrganizationId
      WHERE
        w.WarrantyId = @warrantyId
        AND w.OrganizationId = @organizationId;
    `);

  return result.recordset[0] ?? null;
}
