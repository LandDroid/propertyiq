
import { getDatabase, sql } from "../../config/database";

import type {
  CreateAssetInput,
  UpdateAssetInput,
} from "./assets.validation";

import type { AssetAccessContext } from "./assets.service";

// =====================================================
// SHARED HELPERS
// =====================================================

function getRolePermissions(role: string) {
  const normalizedRole = role.trim().toLowerCase();

  const isPrivileged =
    normalizedRole === "owner" ||
    normalizedRole === "administrator";

  return {
    isPrivileged,
  };
}

function addAccessParameters(request: any, context: AssetAccessContext) {
  const permissions = getRolePermissions(context.role);

  return request
    .input("organizationId", sql.UniqueIdentifier, context.organizationId)
    .input("membershipId", sql.UniqueIdentifier, context.membershipId)
    .input("isPrivileged", sql.Bit, permissions.isPrivileged);
}

const ASSET_SELECT = `
  SELECT
    a.AssetId AS assetId,
    a.OrganizationId AS organizationId,
    a.PropertyId AS propertyId,
    a.DeviceId AS deviceId,
    a.AssetName AS assetName,
    a.Category AS category,
    a.Manufacturer AS manufacturer,
    a.Model AS model,
    a.SerialNumber AS serialNumber,
    a.PurchaseDate AS purchaseDate,
    a.InstalledAt AS installedAt,
    a.ExpectedLifespanYears AS expectedLifespanYears,
    a.Status AS status,
    a.Notes AS notes,
    a.CreatedAt AS createdAt,
    a.UpdatedAt AS updatedAt,
    p.PropertyName AS propertyName,
    d.DeviceName AS deviceName
  FROM dbo.PropertyAssets AS a
  INNER JOIN dbo.Properties AS p
    ON p.PropertyId = a.PropertyId
    AND p.OrganizationId = a.OrganizationId
  LEFT JOIN dbo.Devices AS d
    ON d.DeviceId = a.DeviceId
    AND d.OrganizationId = a.OrganizationId
  WHERE a.OrganizationId = @organizationId
`;

// =====================================================
// GET ALL ASSETS
// OWNER / ADMIN: ALL ORGANIZATION ASSETS
// MEMBER / VIEWER: ASSIGNED PROPERTIES ONLY
// =====================================================

export async function getAllAssets(context: AssetAccessContext) {
  const pool = await getDatabase();
  const request = addAccessParameters(pool.request(), context);

  const result = await request.query(`
    ${ASSET_SELECT}
      AND (
        @isPrivileged = 1
        OR EXISTS (
          SELECT 1
          FROM dbo.UserPropertyAccess upa
          INNER JOIN dbo.Memberships membership
            ON membership.MembershipId = upa.MembershipId
            AND membership.OrganizationId = @organizationId
          INNER JOIN dbo.Properties assignedProperty
            ON assignedProperty.PropertyId = upa.PropertyId
            AND assignedProperty.OrganizationId = @organizationId
          WHERE upa.MembershipId = @membershipId
            AND upa.PropertyId = a.PropertyId
        )
      )
    ORDER BY a.CreatedAt DESC;
  `);

  return result.recordset;
}

// =====================================================
// GET ONE ASSET
// =====================================================

export async function getAssetById(
  assetId: string,
  context: AssetAccessContext
) {
  const pool = await getDatabase();
  const request = addAccessParameters(pool.request(), context);

  const result = await request
    .input("assetId", sql.UniqueIdentifier, assetId)
    .query(`
      ${ASSET_SELECT}
        AND a.AssetId = @assetId
        AND (
          @isPrivileged = 1
          OR EXISTS (
            SELECT 1
            FROM dbo.UserPropertyAccess upa
            INNER JOIN dbo.Memberships membership
              ON membership.MembershipId = upa.MembershipId
              AND membership.OrganizationId = @organizationId
            INNER JOIN dbo.Properties assignedProperty
              ON assignedProperty.PropertyId = upa.PropertyId
              AND assignedProperty.OrganizationId = @organizationId
            WHERE upa.MembershipId = @membershipId
              AND upa.PropertyId = a.PropertyId
          )
        );
    `);

  return result.recordset[0] ?? null;
}

// =====================================================
// CREATE ASSET
// OWNER AND ADMINISTRATOR ONLY
// =====================================================

export async function createAsset(
  data: CreateAssetInput,
  organizationId: string
) {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input("organizationId", sql.UniqueIdentifier, organizationId)
    .input("propertyId", sql.UniqueIdentifier, data.propertyId)
    .input("deviceId", sql.UniqueIdentifier, data.deviceId ?? null)
    .input("assetName", sql.NVarChar(150), data.assetName)
    .input("category", sql.NVarChar(75), data.category)
    .input("manufacturer", sql.NVarChar(100), data.manufacturer ?? null)
    .input("model", sql.NVarChar(100), data.model ?? null)
    .input("serialNumber", sql.NVarChar(150), data.serialNumber ?? null)
    .input("purchaseDate", sql.Date, data.purchaseDate ?? null)
    .input("installedAt", sql.Date, data.installedAt ?? null)
    .input(
      "expectedLifespanYears",
      sql.Int,
      data.expectedLifespanYears ?? null
    )
    .input("status", sql.NVarChar(30), data.status)
    .input("notes", sql.NVarChar(sql.MAX), data.notes ?? null)
    .query(`
      INSERT INTO dbo.PropertyAssets (
        OrganizationId,
        PropertyId,
        DeviceId,
        AssetName,
        Category,
        Manufacturer,
        Model,
        SerialNumber,
        PurchaseDate,
        InstalledAt,
        ExpectedLifespanYears,
        Status,
        Notes
      )
      OUTPUT
        INSERTED.AssetId AS assetId,
        INSERTED.OrganizationId AS organizationId,
        INSERTED.PropertyId AS propertyId,
        INSERTED.DeviceId AS deviceId,
        INSERTED.AssetName AS assetName,
        INSERTED.Category AS category,
        INSERTED.Manufacturer AS manufacturer,
        INSERTED.Model AS model,
        INSERTED.SerialNumber AS serialNumber,
        INSERTED.PurchaseDate AS purchaseDate,
        INSERTED.InstalledAt AS installedAt,
        INSERTED.ExpectedLifespanYears AS expectedLifespanYears,
        INSERTED.Status AS status,
        INSERTED.Notes AS notes,
        INSERTED.CreatedAt AS createdAt,
        INSERTED.UpdatedAt AS updatedAt
      SELECT
        @organizationId,
        p.PropertyId,
        d.DeviceId,
        @assetName,
        @category,
        @manufacturer,
        @model,
        @serialNumber,
        @purchaseDate,
        @installedAt,
        @expectedLifespanYears,
        @status,
        @notes
      FROM dbo.Properties p
      LEFT JOIN dbo.Devices d
        ON d.DeviceId = @deviceId
        AND d.OrganizationId = @organizationId
        AND d.PropertyId = p.PropertyId
      WHERE p.PropertyId = @propertyId
        AND p.OrganizationId = @organizationId
        AND (
          @deviceId IS NULL
          OR d.DeviceId IS NOT NULL
        );
    `);

  return result.recordset[0] ?? null;
}

// =====================================================
// UPDATE ASSET
// OWNER AND ADMINISTRATOR ONLY
// =====================================================

export async function updateAsset(
  assetId: string,
  organizationId: string,
  data: UpdateAssetInput
) {
  const pool = await getDatabase();

  const request = pool
    .request()
    .input("assetId", sql.UniqueIdentifier, assetId)
    .input("organizationId", sql.UniqueIdentifier, organizationId)
    .input("propertyId", sql.UniqueIdentifier, data.propertyId ?? null)
    .input("deviceId", sql.UniqueIdentifier, data.deviceId ?? null)
    .input("hasPropertyId", sql.Bit, data.propertyId !== undefined)
    .input("hasDeviceId", sql.Bit, data.deviceId !== undefined);

  const fields: string[] = [];

  if (data.propertyId !== undefined) {
    fields.push("PropertyId = @propertyId");
  }

  if (data.deviceId !== undefined) {
    fields.push("DeviceId = @deviceId");
  }

  if (data.assetName !== undefined) {
    request.input("assetName", sql.NVarChar(150), data.assetName);
    fields.push("AssetName = @assetName");
  }

  if (data.category !== undefined) {
    request.input("category", sql.NVarChar(75), data.category);
    fields.push("Category = @category");
  }

  if (data.manufacturer !== undefined) {
    request.input("manufacturer", sql.NVarChar(100), data.manufacturer);
    fields.push("Manufacturer = @manufacturer");
  }

  if (data.model !== undefined) {
    request.input("model", sql.NVarChar(100), data.model);
    fields.push("Model = @model");
  }

  if (data.serialNumber !== undefined) {
    request.input("serialNumber", sql.NVarChar(150), data.serialNumber);
    fields.push("SerialNumber = @serialNumber");
  }

  if (data.purchaseDate !== undefined) {
    request.input("purchaseDate", sql.Date, data.purchaseDate);
    fields.push("PurchaseDate = @purchaseDate");
  }

  if (data.installedAt !== undefined) {
    request.input("installedAt", sql.Date, data.installedAt);
    fields.push("InstalledAt = @installedAt");
  }

  if (data.expectedLifespanYears !== undefined) {
    request.input(
      "expectedLifespanYears",
      sql.Int,
      data.expectedLifespanYears
    );
    fields.push("ExpectedLifespanYears = @expectedLifespanYears");
  }

  if (data.status !== undefined) {
    request.input("status", sql.NVarChar(30), data.status);
    fields.push("Status = @status");
  }

  if (data.notes !== undefined) {
    request.input("notes", sql.NVarChar(sql.MAX), data.notes);
    fields.push("Notes = @notes");
  }

  // No fields supplied: return the existing asset without updating it.
  if (fields.length === 0) {
    const existing = await pool
      .request()
      .input("assetId", sql.UniqueIdentifier, assetId)
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .query(`
        ${ASSET_SELECT}
          AND a.AssetId = @assetId;
      `);

    return existing.recordset[0] ?? null;
  }

  fields.push("UpdatedAt = SYSUTCDATETIME()");

  const result = await request.query(`
    UPDATE a
    SET ${fields.join(", ")}
    OUTPUT
      INSERTED.AssetId AS assetId,
      INSERTED.OrganizationId AS organizationId,
      INSERTED.PropertyId AS propertyId,
      INSERTED.DeviceId AS deviceId,
      INSERTED.AssetName AS assetName,
      INSERTED.Category AS category,
      INSERTED.Manufacturer AS manufacturer,
      INSERTED.Model AS model,
      INSERTED.SerialNumber AS serialNumber,
      INSERTED.PurchaseDate AS purchaseDate,
      INSERTED.InstalledAt AS installedAt,
      INSERTED.ExpectedLifespanYears AS expectedLifespanYears,
      INSERTED.Status AS status,
      INSERTED.Notes AS notes,
      INSERTED.CreatedAt AS createdAt,
      INSERTED.UpdatedAt AS updatedAt
    FROM dbo.PropertyAssets a
    WHERE a.AssetId = @assetId
      AND a.OrganizationId = @organizationId

      AND EXISTS (
        SELECT 1
        FROM dbo.Properties currentProperty
        WHERE currentProperty.PropertyId = a.PropertyId
          AND currentProperty.OrganizationId = @organizationId
      )

      AND EXISTS (
        SELECT 1
        FROM dbo.Properties targetProperty
        WHERE targetProperty.PropertyId =
          CASE
            WHEN @hasPropertyId = 1 THEN @propertyId
            ELSE a.PropertyId
          END
          AND targetProperty.OrganizationId = @organizationId
      )

      AND (
        CASE
          WHEN @hasDeviceId = 1 THEN @deviceId
          ELSE a.DeviceId
        END IS NULL
        OR EXISTS (
          SELECT 1
          FROM dbo.Devices d
          WHERE d.DeviceId =
            CASE
              WHEN @hasDeviceId = 1 THEN @deviceId
              ELSE a.DeviceId
            END
            AND d.OrganizationId = @organizationId
            AND d.PropertyId =
              CASE
                WHEN @hasPropertyId = 1 THEN @propertyId
                ELSE a.PropertyId
              END
        )
      );
  `);

  return result.recordset[0] ?? null;
}

// =====================================================
// DELETE ASSET
// OWNER AND ADMINISTRATOR ONLY
// =====================================================

export async function deleteAsset(
  assetId: string,
  organizationId: string
) {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input("assetId", sql.UniqueIdentifier, assetId)
    .input("organizationId", sql.UniqueIdentifier, organizationId)
    .query(`
      DELETE a
      OUTPUT DELETED.AssetId AS assetId
      FROM dbo.PropertyAssets a
      INNER JOIN dbo.Properties p
        ON p.PropertyId = a.PropertyId
        AND p.OrganizationId = @organizationId
      WHERE a.AssetId = @assetId
        AND a.OrganizationId = @organizationId;
    `);

  return result.recordset[0] ?? null;
}
