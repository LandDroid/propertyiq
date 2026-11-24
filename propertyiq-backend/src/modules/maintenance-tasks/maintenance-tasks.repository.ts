
import { getDatabase, sql } from "../../config/database";

import type {
  CreateMaintenanceTaskInput,
  UpdateMaintenanceTaskInput,
} from "./maintenance-tasks.validation";

export type MaintenanceTaskAccessContext = {
  organizationId: string;
  membershipId: string;
  userId: string;
  role: string;
};

function getRolePermissions(role: string) {
  const normalizedRole = role.toLowerCase().trim();

  const isPrivileged =
    normalizedRole === "owner" || normalizedRole === "administrator";

  return {
    isPrivileged,
    canWrite: isPrivileged || normalizedRole === "member",
  };
}

function propertyAccessCondition(): string {
  return `
    (
      @IsPrivileged = 1
      OR EXISTS (
        SELECT 1
        FROM dbo.UserPropertyAccess upa
        WHERE upa.MembershipId = @MembershipId
          AND upa.PropertyId = mt.PropertyId
      )
    )
  `;
}

async function verifyPropertyAccess(
  transaction: sql.Transaction,
  context: MaintenanceTaskAccessContext,
  propertyId: string
): Promise<boolean> {
  const permissions = getRolePermissions(context.role);

  const result = await transaction
    .request()
    .input("OrganizationId", sql.UniqueIdentifier, context.organizationId)
    .input("MembershipId", sql.UniqueIdentifier, context.membershipId)
    .input("PropertyId", sql.UniqueIdentifier, propertyId)
    .input("IsPrivileged", sql.Bit, permissions.isPrivileged)
    .query(`
      SELECT p.PropertyId
      FROM dbo.Properties p
      WHERE p.OrganizationId = @OrganizationId
        AND p.PropertyId = @PropertyId
        AND (
          @IsPrivileged = 1
          OR EXISTS (
            SELECT 1
            FROM dbo.UserPropertyAccess upa
            WHERE upa.MembershipId = @MembershipId
              AND upa.PropertyId = p.PropertyId
          )
        )
    `);

  return result.recordset.length > 0;
}

async function verifyDevice(
  transaction: sql.Transaction,
  organizationId: string,
  propertyId: string,
  deviceId: string | null | undefined
): Promise<boolean> {
  if (!deviceId) {
    return true;
  }

  const result = await transaction
    .request()
    .input("OrganizationId", sql.UniqueIdentifier, organizationId)
    .input("PropertyId", sql.UniqueIdentifier, propertyId)
    .input("DeviceId", sql.UniqueIdentifier, deviceId)
    .query(`
      SELECT DeviceId
      FROM dbo.Devices
      WHERE OrganizationId = @OrganizationId
        AND PropertyId = @PropertyId
        AND DeviceId = @DeviceId
    `);

  return result.recordset.length > 0;
}

// =====================================================
// VERIFY ASSIGNED USER
// User must belong to the organization and have access
// to the property receiving the task.
// =====================================================

async function verifyAssignedUserForProperty(
  transaction: sql.Transaction,
  organizationId: string,
  userId: string | null | undefined,
  propertyId: string
): Promise<boolean> {
  if (!userId) {
    return true;
  }

  const result = await transaction
    .request()
    .input("OrganizationId", sql.UniqueIdentifier, organizationId)
    .input("UserId", sql.UniqueIdentifier, userId)
    .input("PropertyId", sql.UniqueIdentifier, propertyId)
    .query(`
      SELECT TOP 1 m.MembershipId
      FROM dbo.Memberships m
      INNER JOIN dbo.UserPropertyAccess upa
        ON upa.MembershipId = m.MembershipId
        AND upa.PropertyId = @PropertyId
      WHERE m.OrganizationId = @OrganizationId
        AND m.UserId = @UserId
    `);

  return result.recordset.length > 0;
}

// =====================================================
// GET ALL MAINTENANCE TASKS
// Owner / Administrator: all organization properties
// Member / Viewer: assigned properties only
// =====================================================

export async function getAllMaintenanceTasks(
  context: MaintenanceTaskAccessContext,
  filters?: {
    propertyId?: string;
    status?: string;
  }
) {
  const pool = await getDatabase();
  const permissions = getRolePermissions(context.role);

  const request = pool
    .request()
    .input("OrganizationId", sql.UniqueIdentifier, context.organizationId)
    .input("MembershipId", sql.UniqueIdentifier, context.membershipId)
    .input("IsPrivileged", sql.Bit, permissions.isPrivileged)
    .input(
      "PropertyId",
      sql.UniqueIdentifier,
      filters?.propertyId ?? null
    )
    .input("Status", sql.NVarChar(60), filters?.status ?? null);

  const result = await request.query(`
    SELECT
      mt.*,
      d.DeviceName
    FROM dbo.MaintenanceTasks mt
    LEFT JOIN dbo.Devices d
      ON d.DeviceId = mt.DeviceId
      AND d.OrganizationId = mt.OrganizationId
      AND d.PropertyId = mt.PropertyId
    WHERE mt.OrganizationId = @OrganizationId
      AND (
        @PropertyId IS NULL
        OR mt.PropertyId = @PropertyId
      )
      AND (
        @Status IS NULL
        OR mt.Status = @Status
      )
      AND ${propertyAccessCondition()}
    ORDER BY
      CASE mt.Priority
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
        WHEN 'low' THEN 4
        ELSE 5
      END,
      mt.ScheduledDate ASC,
      mt.CreatedAt DESC
  `);

  return result.recordset;
}

// =====================================================
// GET ONE MAINTENANCE TASK
// =====================================================

export async function getMaintenanceTaskById(
  context: MaintenanceTaskAccessContext,
  maintenanceTaskId: string
) {
  const pool = await getDatabase();
  const permissions = getRolePermissions(context.role);

  const result = await pool
    .request()
    .input("OrganizationId", sql.UniqueIdentifier, context.organizationId)
    .input("MembershipId", sql.UniqueIdentifier, context.membershipId)
    .input("MaintenanceTaskId", sql.UniqueIdentifier, maintenanceTaskId)
    .input("IsPrivileged", sql.Bit, permissions.isPrivileged)
    .query(`
      SELECT
        mt.*,
        d.DeviceName
      FROM dbo.MaintenanceTasks mt
      LEFT JOIN dbo.Devices d
        ON d.DeviceId = mt.DeviceId
        AND d.OrganizationId = mt.OrganizationId
        AND d.PropertyId = mt.PropertyId
      WHERE mt.OrganizationId = @OrganizationId
        AND mt.MaintenanceTaskId = @MaintenanceTaskId
        AND ${propertyAccessCondition()}
    `);

  return result.recordset[0] ?? null;
}

// =====================================================
// CREATE MAINTENANCE TASK
// Owner / Administrator / Member can create
// Assigned internal user must have property access
// =====================================================

export async function createMaintenanceTask(
  context: MaintenanceTaskAccessContext,
  input: CreateMaintenanceTaskInput
) {
  const permissions = getRolePermissions(context.role);

  if (!permissions.canWrite) {
    throw new Error(
      "You do not have permission to create maintenance tasks."
    );
  }

  const pool = await getDatabase();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const hasPropertyAccess = await verifyPropertyAccess(
      transaction,
      context,
      input.propertyId
    );

    if (!hasPropertyAccess) {
      throw new Error(
        "The selected property was not found or you do not have access to it."
      );
    }

    const hasValidDevice = await verifyDevice(
      transaction,
      context.organizationId,
      input.propertyId,
      input.deviceId
    );

    if (!hasValidDevice) {
      throw new Error(
        "The selected device does not belong to the selected property and organization."
      );
    }

    const hasValidAssignedUser = await verifyAssignedUserForProperty(
      transaction,
      context.organizationId,
      input.assignedToUserId,
      input.propertyId
    );

    if (!hasValidAssignedUser) {
      throw new Error(
        "The assigned user must belong to this organization and have access to the selected property."
      );
    }

    const result = await transaction
      .request()
      .input("OrganizationId", sql.UniqueIdentifier, context.organizationId)
      .input("PropertyId", sql.UniqueIdentifier, input.propertyId)
      .input("DeviceId", sql.UniqueIdentifier, input.deviceId ?? null)
      .input(
        "AssignedToUserId",
        sql.UniqueIdentifier,
        input.assignedToUserId ?? null
      )
      .input("Title", sql.NVarChar(200), input.title)
      .input(
        "Description",
        sql.NVarChar(2000),
        input.description ?? null
      )
      .input("Priority", sql.NVarChar(60), input.priority ?? "normal")
      .input("Status", sql.NVarChar(60), input.status ?? "open")
      .input(
        "ScheduledDate",
        sql.DateTime2,
        input.scheduledDate ? new Date(input.scheduledDate) : null
      )
      .query(`
        INSERT INTO dbo.MaintenanceTasks (
          OrganizationId,
          PropertyId,
          DeviceId,
          AssignedToUserId,
          Title,
          Description,
          Priority,
          Status,
          ScheduledDate
        )
        OUTPUT INSERTED.*
        VALUES (
          @OrganizationId,
          @PropertyId,
          @DeviceId,
          @AssignedToUserId,
          @Title,
          @Description,
          @Priority,
          @Status,
          @ScheduledDate
        )
      `);

    await transaction.commit();

    return result.recordset[0];
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // Preserve the original error.
    }

    throw error;
  }
}

// =====================================================
// UPDATE MAINTENANCE TASK
// Owner / Administrator / Member can update
// Assigned internal user must have access to the
// resulting task property.
// =====================================================

export async function updateMaintenanceTask(
  context: MaintenanceTaskAccessContext,
  maintenanceTaskId: string,
  input: UpdateMaintenanceTaskInput
) {
  const permissions = getRolePermissions(context.role);

  if (!permissions.canWrite) {
    throw new Error(
      "You do not have permission to update maintenance tasks."
    );
  }

  const pool = await getDatabase();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const existingResult = await transaction
      .request()
      .input("OrganizationId", sql.UniqueIdentifier, context.organizationId)
      .input("MembershipId", sql.UniqueIdentifier, context.membershipId)
      .input("MaintenanceTaskId", sql.UniqueIdentifier, maintenanceTaskId)
      .input("IsPrivileged", sql.Bit, permissions.isPrivileged)
      .query(`
        SELECT mt.*
        FROM dbo.MaintenanceTasks mt WITH (UPDLOCK, HOLDLOCK)
        WHERE mt.OrganizationId = @OrganizationId
          AND mt.MaintenanceTaskId = @MaintenanceTaskId
          AND ${propertyAccessCondition()}
      `);

    const existingTask = existingResult.recordset[0];

    if (!existingTask) {
      throw new Error(
        "The maintenance task was not found or you do not have access to its property."
      );
    }

    const propertyId = input.propertyId ?? existingTask.PropertyId;

    const deviceId =
      input.deviceId !== undefined
        ? input.deviceId
        : existingTask.DeviceId;

    const hasPropertyAccess = await verifyPropertyAccess(
      transaction,
      context,
      propertyId
    );

    if (!hasPropertyAccess) {
      throw new Error(
        "The selected property was not found or you do not have access to it."
      );
    }

    const hasValidDevice = await verifyDevice(
      transaction,
      context.organizationId,
      propertyId,
      deviceId
    );

    if (!hasValidDevice) {
      throw new Error(
        "The selected device does not belong to the selected property and organization."
      );
    }

    const assignedToUserId =
      input.assignedToUserId !== undefined
        ? input.assignedToUserId
        : existingTask.AssignedToUserId;

    const hasValidAssignedUser =
      await verifyAssignedUserForProperty(
        transaction,
        context.organizationId,
        assignedToUserId,
        propertyId
      );

    if (!hasValidAssignedUser) {
      throw new Error(
        "The assigned user must belong to this organization and have access to the selected property."
      );
    }

    const request = transaction
      .request()
      .input("OrganizationId", sql.UniqueIdentifier, context.organizationId)
      .input("MaintenanceTaskId", sql.UniqueIdentifier, maintenanceTaskId);

    const updates: string[] = [];

    if (input.propertyId !== undefined) {
      request.input("PropertyId", sql.UniqueIdentifier, input.propertyId);
      updates.push("PropertyId = @PropertyId");
    }

    if (input.deviceId !== undefined || input.propertyId !== undefined) {
      request.input("DeviceId", sql.UniqueIdentifier, deviceId);
      updates.push("DeviceId = @DeviceId");
    }

    if (input.assignedToUserId !== undefined) {
      request.input(
        "AssignedToUserId",
        sql.UniqueIdentifier,
        input.assignedToUserId
      );
      updates.push("AssignedToUserId = @AssignedToUserId");
    }

    if (input.title !== undefined) {
      request.input("Title", sql.NVarChar(200), input.title);
      updates.push("Title = @Title");
    }

    if (input.description !== undefined) {
      request.input(
        "Description",
        sql.NVarChar(2000),
        input.description
      );
      updates.push("Description = @Description");
    }

    if (input.priority !== undefined) {
      request.input("Priority", sql.NVarChar(60), input.priority);
      updates.push("Priority = @Priority");
    }

    if (input.status !== undefined) {
      request.input("Status", sql.NVarChar(60), input.status);
      updates.push("Status = @Status");

      updates.push(
        input.status === "completed"
          ? "CompletedAt = SYSUTCDATETIME()"
          : "CompletedAt = NULL"
      );
    }

    if (input.scheduledDate !== undefined) {
      request.input(
        "ScheduledDate",
        sql.DateTime2,
        input.scheduledDate ? new Date(input.scheduledDate) : null
      );
      updates.push("ScheduledDate = @ScheduledDate");
    }

    if (updates.length === 0) {
      await transaction.commit();
      return existingTask;
    }

    const result = await request.query(`
      UPDATE dbo.MaintenanceTasks
      SET ${updates.join(", ")}
      OUTPUT INSERTED.*
      WHERE OrganizationId = @OrganizationId
        AND MaintenanceTaskId = @MaintenanceTaskId
    `);

    await transaction.commit();

    return result.recordset[0] ?? null;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // Preserve the original error.
    }

    throw error;
  }
}

// =====================================================
// DELETE MAINTENANCE TASK
// Owner / Administrator only
// Tasks with assignment history cannot be deleted
// =====================================================

export async function deleteMaintenanceTask(
  context: MaintenanceTaskAccessContext,
  maintenanceTaskId: string
): Promise<boolean> {
  const permissions = getRolePermissions(context.role);

  if (!permissions.isPrivileged) {
    throw new Error(
      "You do not have permission to delete maintenance tasks."
    );
  }

  const pool = await getDatabase();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    // Lock the task so a new assignment cannot be added
    // while its assignment history is being checked.
    const taskResult = await transaction
      .request()
      .input("OrganizationId", sql.UniqueIdentifier, context.organizationId)
      .input("MaintenanceTaskId", sql.UniqueIdentifier, maintenanceTaskId)
      .query(`
        SELECT MaintenanceTaskId
        FROM dbo.MaintenanceTasks WITH (UPDLOCK, HOLDLOCK)
        WHERE OrganizationId = @OrganizationId
          AND MaintenanceTaskId = @MaintenanceTaskId;
      `);

    if (taskResult.recordset.length === 0) {
      await transaction.rollback();
      return false;
    }

    // Do not delete tasks that have assignment history.
    const assignmentResult = await transaction
      .request()
      .input("OrganizationId", sql.UniqueIdentifier, context.organizationId)
      .input("MaintenanceTaskId", sql.UniqueIdentifier, maintenanceTaskId)
      .query(`
        SELECT TOP 1 1 AS HasAssignment
        FROM dbo.MaintenanceTaskAssignments WITH (UPDLOCK, HOLDLOCK)
        WHERE OrganizationId = @OrganizationId
          AND MaintenanceTaskId = @MaintenanceTaskId;
      `);

    if (assignmentResult.recordset.length > 0) {
      throw new Error(
        "This maintenance task cannot be deleted because it has assignment history. Change its status to cancelled instead."
      );
    }

    await transaction
      .request()
      .input("OrganizationId", sql.UniqueIdentifier, context.organizationId)
      .input("MaintenanceTaskId", sql.UniqueIdentifier, maintenanceTaskId)
      .query(`
        DELETE FROM dbo.MaintenanceTasks
        WHERE OrganizationId = @OrganizationId
          AND MaintenanceTaskId = @MaintenanceTaskId;
      `);

    await transaction.commit();

    return true;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // Preserve the original error.
    }

    throw error;
  }
}
