
import { getDatabase, sql } from "../../config/database";

export type MaintenanceInput = {
  assetId: string;
  maintenanceTitle: string;
  description?: string | null;
  maintenanceType?: string;
  dueDate?: string | null;
  completedDate?: string | null;
  recurrenceMonths?: number | null;
  status?: string;
  serviceProvider?: string | null;
  cost?: number | null;
  notes?: string | null;
};

export type MaintenanceAccessContext = {
  organizationId: string;
  membershipId: string;
  role: string;
};

function getRolePermissions(role: string) {
  const normalizedRole = role.trim().toLowerCase();

  const isPrivileged =
    normalizedRole === "owner" ||
    normalizedRole === "administrator";

  return {
    isPrivileged,
    canWrite: isPrivileged || normalizedRole === "member",
  };
}

function addAccessParameters(
  request: any,
  context: MaintenanceAccessContext
) {
  const permissions = getRolePermissions(context.role);

  return request
    .input("organizationId", sql.UniqueIdentifier, context.organizationId)
    .input("membershipId", sql.UniqueIdentifier, context.membershipId)
    .input("isPrivileged", sql.Bit, permissions.isPrivileged)
    .input("canWrite", sql.Bit, permissions.canWrite);
}

// ==================================================
// GET ALL MAINTENANCE RECORDS
// ==================================================

export async function getAllMaintenance(
  context: MaintenanceAccessContext
) {
  const pool = await getDatabase();
  const request = addAccessParameters(pool.request(), context);

  const result = await request.query(`
    SELECT
      m.MaintenanceId AS maintenanceId,
      m.OrganizationId AS organizationId,
      m.AssetId AS assetId,
      a.AssetName AS assetName,
      a.SerialNumber AS serialNumber,
      p.PropertyName AS propertyName,
      m.MaintenanceTitle AS maintenanceTitle,
      m.Description AS description,
      m.MaintenanceType AS maintenanceType,
      m.DueDate AS dueDate,
      m.CompletedDate AS completedDate,
      m.RecurrenceMonths AS recurrenceMonths,
      m.Status AS status,
      m.ServiceProvider AS serviceProvider,
      m.Cost AS cost,
      m.Notes AS notes,
      m.CreatedAt AS createdAt
    FROM dbo.AssetMaintenance m
    INNER JOIN dbo.PropertyAssets a
      ON a.AssetId = m.AssetId
    LEFT JOIN dbo.Properties p
      ON p.PropertyId = a.PropertyId
    WHERE m.OrganizationId = @organizationId
      AND (
        @isPrivileged = 1
        OR EXISTS (
          SELECT 1
          FROM dbo.UserPropertyAccess upa
          WHERE upa.MembershipId = @membershipId
            AND upa.PropertyId = a.PropertyId
        )
      )
    ORDER BY
      CASE
        WHEN m.Status = 'completed' THEN 2
        ELSE 1
      END,
      m.DueDate ASC;
  `);

  return result.recordset;
}

// ==================================================
// GET ONE MAINTENANCE RECORD
// ==================================================

export async function getMaintenanceById(
  context: MaintenanceAccessContext,
  maintenanceId: string
) {
  const pool = await getDatabase();
  const request = addAccessParameters(pool.request(), context);

  const result = await request
    .input("maintenanceId", sql.UniqueIdentifier, maintenanceId)
    .query(`
      SELECT
        m.MaintenanceId AS maintenanceId,
        m.OrganizationId AS organizationId,
        m.AssetId AS assetId,
        a.AssetName AS assetName,
        a.SerialNumber AS serialNumber,
        p.PropertyName AS propertyName,
        m.MaintenanceTitle AS maintenanceTitle,
        m.Description AS description,
        m.MaintenanceType AS maintenanceType,
        m.DueDate AS dueDate,
        m.CompletedDate AS completedDate,
        m.RecurrenceMonths AS recurrenceMonths,
        m.Status AS status,
        m.ServiceProvider AS serviceProvider,
        m.Cost AS cost,
        m.Notes AS notes,
        m.CreatedAt AS createdAt
      FROM dbo.AssetMaintenance m
      INNER JOIN dbo.PropertyAssets a
        ON a.AssetId = m.AssetId
      LEFT JOIN dbo.Properties p
        ON p.PropertyId = a.PropertyId
      WHERE m.OrganizationId = @organizationId
        AND m.MaintenanceId = @maintenanceId
        AND (
          @isPrivileged = 1
          OR EXISTS (
            SELECT 1
            FROM dbo.UserPropertyAccess upa
            WHERE upa.MembershipId = @membershipId
              AND upa.PropertyId = a.PropertyId
          )
        );
    `);

  return result.recordset[0] ?? null;
}

// ==================================================
// CREATE MAINTENANCE RECORD
// ==================================================

export async function createMaintenance(
  context: MaintenanceAccessContext,
  input: MaintenanceInput
) {
  const permissions = getRolePermissions(context.role);

  if (!permissions.canWrite) {
    throw new Error("You do not have permission to create maintenance records.");
  }

  const pool = await getDatabase();
  const request = addAccessParameters(pool.request(), context);

  const result = await request
    .input("assetId", sql.UniqueIdentifier, input.assetId)
    .input("maintenanceTitle", sql.NVarChar(150), input.maintenanceTitle)
    .input("description", sql.NVarChar(sql.MAX), input.description ?? null)
    .input("maintenanceType", sql.NVarChar(50), input.maintenanceType || "scheduled")
    .input("dueDate", sql.Date, input.dueDate || null)
    .input("completedDate", sql.Date, input.completedDate || null)
    .input("recurrenceMonths", sql.Int, input.recurrenceMonths ?? null)
    .input("status", sql.NVarChar(50), input.status || "scheduled")
    .input("serviceProvider", sql.NVarChar(150), input.serviceProvider ?? null)
    .input("cost", sql.Decimal(12, 2), input.cost ?? null)
    .input("notes", sql.NVarChar(sql.MAX), input.notes ?? null)
    .query(`
      INSERT INTO dbo.AssetMaintenance (
        OrganizationId,
        AssetId,
        MaintenanceTitle,
        Description,
        MaintenanceType,
        DueDate,
        CompletedDate,
        RecurrenceMonths,
        Status,
        ServiceProvider,
        Cost,
        Notes
      )
      OUTPUT INSERTED.MaintenanceId AS maintenanceId
      SELECT
        @organizationId,
        a.AssetId,
        @maintenanceTitle,
        @description,
        @maintenanceType,
        @dueDate,
        @completedDate,
        @recurrenceMonths,
        @status,
        @serviceProvider,
        @cost,
        @notes
      FROM dbo.PropertyAssets a
      WHERE a.AssetId = @assetId
        AND a.OrganizationId = @organizationId
        AND (
          @isPrivileged = 1
          OR (
            @canWrite = 1
            AND EXISTS (
              SELECT 1
              FROM dbo.UserPropertyAccess upa
              WHERE upa.MembershipId = @membershipId
                AND upa.PropertyId = a.PropertyId
            )
          )
        );
    `);

  const maintenanceId = result.recordset[0]?.maintenanceId;

  if (!maintenanceId) {
    throw new Error(
      "The selected asset was not found or you do not have access to its property."
    );
  }

  return getMaintenanceById(context, maintenanceId);
}

// ==================================================
// UPDATE MAINTENANCE RECORD
// ==================================================

export async function updateMaintenance(
  context: MaintenanceAccessContext,
  maintenanceId: string,
  input: MaintenanceInput
) {
  const permissions = getRolePermissions(context.role);

  if (!permissions.canWrite) {
    throw new Error("You do not have permission to update maintenance records.");
  }

  const pool = await getDatabase();
  const request = addAccessParameters(pool.request(), context);

  const result = await request
    .input("maintenanceId", sql.UniqueIdentifier, maintenanceId)
    .input("assetId", sql.UniqueIdentifier, input.assetId)
    .input("maintenanceTitle", sql.NVarChar(150), input.maintenanceTitle)
    .input("description", sql.NVarChar(sql.MAX), input.description ?? null)
    .input("maintenanceType", sql.NVarChar(50), input.maintenanceType || "scheduled")
    .input("dueDate", sql.Date, input.dueDate || null)
    .input("completedDate", sql.Date, input.completedDate || null)
    .input("recurrenceMonths", sql.Int, input.recurrenceMonths ?? null)
    .input("status", sql.NVarChar(50), input.status || "scheduled")
    .input("serviceProvider", sql.NVarChar(150), input.serviceProvider ?? null)
    .input("cost", sql.Decimal(12, 2), input.cost ?? null)
    .input("notes", sql.NVarChar(sql.MAX), input.notes ?? null)
    .query(`
      UPDATE m
      SET
        AssetId = newAsset.AssetId,
        MaintenanceTitle = @maintenanceTitle,
        Description = @description,
        MaintenanceType = @maintenanceType,
        DueDate = @dueDate,
        CompletedDate = @completedDate,
        RecurrenceMonths = @recurrenceMonths,
        Status = @status,
        ServiceProvider = @serviceProvider,
        Cost = @cost,
        Notes = @notes
      FROM dbo.AssetMaintenance m
      INNER JOIN dbo.PropertyAssets oldAsset
        ON oldAsset.AssetId = m.AssetId
        AND oldAsset.OrganizationId = @organizationId
      INNER JOIN dbo.PropertyAssets newAsset
        ON newAsset.AssetId = @assetId
        AND newAsset.OrganizationId = @organizationId
      WHERE m.OrganizationId = @organizationId
        AND m.MaintenanceId = @maintenanceId
        AND (
          @isPrivileged = 1
          OR (
            @canWrite = 1
            AND EXISTS (
              SELECT 1
              FROM dbo.UserPropertyAccess upa
              WHERE upa.MembershipId = @membershipId
                AND upa.PropertyId = oldAsset.PropertyId
            )
            AND EXISTS (
              SELECT 1
              FROM dbo.UserPropertyAccess upa
              WHERE upa.MembershipId = @membershipId
                AND upa.PropertyId = newAsset.PropertyId
            )
          )
        );

      SELECT @@ROWCOUNT AS affectedRows;
    `);

  if (result.recordset[0]?.affectedRows === 0) {
    return null;
  }

  return getMaintenanceById(context, maintenanceId);
}

// ==================================================
// MARK MAINTENANCE AS COMPLETED
// ==================================================

export async function completeMaintenance(
  context: MaintenanceAccessContext,
  maintenanceId: string
) {
  const permissions = getRolePermissions(context.role);

  if (!permissions.canWrite) {
    throw new Error("You do not have permission to complete maintenance records.");
  }

  const pool = await getDatabase();
  const request = addAccessParameters(pool.request(), context);

  const result = await request
    .input("maintenanceId", sql.UniqueIdentifier, maintenanceId)
    .query(`
      UPDATE m
      SET
        Status = 'completed',
        CompletedDate = CAST(GETDATE() AS DATE)
      FROM dbo.AssetMaintenance m
      INNER JOIN dbo.PropertyAssets a
        ON a.AssetId = m.AssetId
        AND a.OrganizationId = @organizationId
      WHERE m.OrganizationId = @organizationId
        AND m.MaintenanceId = @maintenanceId
        AND (
          @isPrivileged = 1
          OR (
            @canWrite = 1
            AND EXISTS (
              SELECT 1
              FROM dbo.UserPropertyAccess upa
              WHERE upa.MembershipId = @membershipId
                AND upa.PropertyId = a.PropertyId
            )
          )
        );

      SELECT @@ROWCOUNT AS affectedRows;
    `);

  if (result.recordset[0]?.affectedRows === 0) {
    return null;
  }

  return getMaintenanceById(context, maintenanceId);
}

// ==================================================
// DELETE MAINTENANCE RECORD
// OWNER AND ADMINISTRATOR ONLY
// ==================================================

export async function deleteMaintenance(
  context: MaintenanceAccessContext,
  maintenanceId: string
): Promise<boolean> {
  const permissions = getRolePermissions(context.role);

  if (!permissions.isPrivileged) {
    throw new Error("Only Owners and Administrators can delete maintenance records.");
  }

  const pool = await getDatabase();
  const request = addAccessParameters(pool.request(), context);

  const result = await request
    .input("maintenanceId", sql.UniqueIdentifier, maintenanceId)
    .query(`
      DELETE FROM dbo.AssetMaintenance
      WHERE OrganizationId = @organizationId
        AND MaintenanceId = @maintenanceId
        AND @isPrivileged = 1;

      SELECT @@ROWCOUNT AS affectedRows;
    `);

  return result.recordset[0]?.affectedRows > 0;
}
