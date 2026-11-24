
import { getDatabase, sql } from "../../config/database";

import type {
  CreateTaskAssignmentInput,
  UpdateTaskAssignmentStatusInput,
} from "./maintenance-task-assignments.validation";

export type TaskAssignmentAccessContext = {
  organizationId: string;
  membershipId: string;
  userId: string;
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
  context: TaskAssignmentAccessContext
) {
  const permissions = getRolePermissions(context.role);

  return request
    .input("organizationId", sql.UniqueIdentifier, context.organizationId)
    .input("membershipId", sql.UniqueIdentifier, context.membershipId)
    .input("userId", sql.UniqueIdentifier, context.userId)
    .input("isPrivileged", sql.Bit, permissions.isPrivileged)
    .input("canWrite", sql.Bit, permissions.canWrite);
}

// ==================================================
// GET ASSIGNMENTS FOR A MAINTENANCE TASK
// INCLUDES CURRENT AND HISTORICAL ASSIGNMENTS
// ==================================================

export async function getAssignmentsByTask(
  context: TaskAssignmentAccessContext,
  maintenanceTaskId: string
) {
  const pool = await getDatabase();

  const request = addAccessParameters(
    pool.request(),
    context
  );

  const result = await request
    .input(
      "maintenanceTaskId",
      sql.UniqueIdentifier,
      maintenanceTaskId
    )
    .query(`
      SELECT
        a.TaskAssignmentId AS taskAssignmentId,
        a.OrganizationId AS organizationId,
        a.MaintenanceTaskId AS maintenanceTaskId,
        t.Title AS taskTitle,
        t.PropertyId AS propertyId,
        p.PropertyName AS propertyName,
        a.MembershipId AS membershipId,
        a.ServiceProviderId AS serviceProviderId,
        sp.CompanyName AS serviceProviderName,
        a.AssignedByUserId AS assignedByUserId,
        a.AssignedAt AS assignedAt,
        a.CompletedAt AS completedAt,
        a.Status AS status,
        a.Notes AS notes
      FROM dbo.MaintenanceTaskAssignments a
      INNER JOIN dbo.MaintenanceTasks t
        ON t.MaintenanceTaskId = a.MaintenanceTaskId
        AND t.OrganizationId = a.OrganizationId
      INNER JOIN dbo.Properties p
        ON p.PropertyId = t.PropertyId
        AND p.OrganizationId = t.OrganizationId
      LEFT JOIN dbo.ServiceProviders sp
        ON sp.ServiceProviderId = a.ServiceProviderId
        AND sp.OrganizationId = a.OrganizationId
      WHERE a.OrganizationId = @organizationId
        AND a.MaintenanceTaskId = @maintenanceTaskId
        AND (
          @isPrivileged = 1
          OR EXISTS (
            SELECT 1
            FROM dbo.UserPropertyAccess upa
            WHERE upa.MembershipId = @membershipId
              AND upa.PropertyId = t.PropertyId
          )
        )
      ORDER BY a.AssignedAt DESC;
    `);

  return result.recordset;
}

// ==================================================
// GET ONE TASK ASSIGNMENT
// ==================================================

export async function getTaskAssignmentById(
  context: TaskAssignmentAccessContext,
  taskAssignmentId: string
) {
  const pool = await getDatabase();

  const request = addAccessParameters(
    pool.request(),
    context
  );

  const result = await request
    .input(
      "taskAssignmentId",
      sql.UniqueIdentifier,
      taskAssignmentId
    )
    .query(`
      SELECT
        a.TaskAssignmentId AS taskAssignmentId,
        a.OrganizationId AS organizationId,
        a.MaintenanceTaskId AS maintenanceTaskId,
        t.Title AS taskTitle,
        t.PropertyId AS propertyId,
        p.PropertyName AS propertyName,
        a.MembershipId AS membershipId,
        a.ServiceProviderId AS serviceProviderId,
        sp.CompanyName AS serviceProviderName,
        a.AssignedByUserId AS assignedByUserId,
        a.AssignedAt AS assignedAt,
        a.CompletedAt AS completedAt,
        a.Status AS status,
        a.Notes AS notes
      FROM dbo.MaintenanceTaskAssignments a
      INNER JOIN dbo.MaintenanceTasks t
        ON t.MaintenanceTaskId = a.MaintenanceTaskId
        AND t.OrganizationId = a.OrganizationId
      INNER JOIN dbo.Properties p
        ON p.PropertyId = t.PropertyId
        AND p.OrganizationId = t.OrganizationId
      LEFT JOIN dbo.ServiceProviders sp
        ON sp.ServiceProviderId = a.ServiceProviderId
        AND sp.OrganizationId = a.OrganizationId
      WHERE a.OrganizationId = @organizationId
        AND a.TaskAssignmentId = @taskAssignmentId
        AND (
          @isPrivileged = 1
          OR EXISTS (
            SELECT 1
            FROM dbo.UserPropertyAccess upa
            WHERE upa.MembershipId = @membershipId
              AND upa.PropertyId = t.PropertyId
          )
        );
    `);

  return result.recordset[0] ?? null;
}

// ==================================================
// CREATE OR REASSIGN A MAINTENANCE TASK
//
// PREVIOUS ACTIVE ASSIGNMENTS ARE CANCELLED,
// NOT DELETED, SO ASSIGNMENT HISTORY IS PRESERVED.
// ==================================================

export async function createTaskAssignment(
  context: TaskAssignmentAccessContext,
  input: CreateTaskAssignmentInput
) {
  const permissions = getRolePermissions(context.role);

  if (!permissions.canWrite) {
    throw new Error(
      "You do not have permission to assign maintenance tasks."
    );
  }

  const pool = await getDatabase();
  const transaction = new sql.Transaction(pool);

  await transaction.begin();

  let taskAssignmentId: string | null = null;

  try {
    // Verify task organization and property access.
    const taskResult = await addAccessParameters(
      transaction.request(),
      context
    )
      .input(
        "maintenanceTaskId",
        sql.UniqueIdentifier,
        input.maintenanceTaskId
      )
      .query(`
        SELECT TOP 1
          t.MaintenanceTaskId AS maintenanceTaskId,
          t.PropertyId AS propertyId
        FROM dbo.MaintenanceTasks t WITH (UPDLOCK, HOLDLOCK)
        WHERE t.MaintenanceTaskId = @maintenanceTaskId
          AND t.OrganizationId = @organizationId
          AND (
            @isPrivileged = 1
            OR (
              @canWrite = 1
              AND EXISTS (
                SELECT 1
                FROM dbo.UserPropertyAccess upa
                WHERE upa.MembershipId = @membershipId
                  AND upa.PropertyId = t.PropertyId
              )
            )
          );
      `);

    const task = taskResult.recordset[0];

    if (!task) {
      throw new Error(
        "The maintenance task was not found or you do not have access to its property."
      );
    }

    // Verify the selected internal or external assignee.
    const assigneeRequest = transaction.request()
      .input(
        "organizationId",
        sql.UniqueIdentifier,
        context.organizationId
      );

    if (input.membershipId) {
      // Internal members must:
      // 1. Belong to this organization.
      // 2. Have an active user account.
      // 3. Have access to this task's property.
      const membershipResult = await assigneeRequest
        .input(
          "assigneeMembershipId",
          sql.UniqueIdentifier,
          input.membershipId
        )
        .input(
          "propertyId",
          sql.UniqueIdentifier,
          task.propertyId
        )
        .query(`
          SELECT TOP 1
            m.MembershipId
          FROM dbo.Memberships m
          INNER JOIN dbo.Users u
            ON u.UserId = m.UserId
          INNER JOIN dbo.UserPropertyAccess upa
            ON upa.MembershipId = m.MembershipId
            AND upa.PropertyId = @propertyId
          WHERE m.MembershipId = @assigneeMembershipId
            AND m.OrganizationId = @organizationId
            AND u.Status = 'active';
        `);

      if (!membershipResult.recordset[0]) {
        throw new Error(
          "The selected member must belong to this organization, have an active user account, and have access to the task's property."
        );
      }
    } else if (input.serviceProviderId) {
      // External providers must belong to this organization
      // and have an active provider record.
      const providerResult = await assigneeRequest
        .input(
          "assigneeServiceProviderId",
          sql.UniqueIdentifier,
          input.serviceProviderId
        )
        .query(`
          SELECT TOP 1
            ServiceProviderId
          FROM dbo.ServiceProviders
          WHERE ServiceProviderId = @assigneeServiceProviderId
            AND OrganizationId = @organizationId
            AND Status = 'active';
        `);

      if (!providerResult.recordset[0]) {
        throw new Error(
          "The selected service provider was not found or is inactive."
        );
      }
    } else {
      throw new Error(
        "Exactly one assignee is required."
      );
    }

    // Preserve old assignments by cancelling active ones.
    await transaction.request()
      .input(
        "organizationId",
        sql.UniqueIdentifier,
        context.organizationId
      )
      .input(
        "maintenanceTaskId",
        sql.UniqueIdentifier,
        input.maintenanceTaskId
      )
      .query(`
        UPDATE dbo.MaintenanceTaskAssignments
        SET Status = 'cancelled'
        WHERE OrganizationId = @organizationId
          AND MaintenanceTaskId = @maintenanceTaskId
          AND Status IN ('assigned', 'accepted', 'in_progress');
      `);

    // Create the new assignment.
    const insertResult = await transaction.request()
      .input(
        "organizationId",
        sql.UniqueIdentifier,
        context.organizationId
      )
      .input(
        "maintenanceTaskId",
        sql.UniqueIdentifier,
        input.maintenanceTaskId
      )
      .input(
        "membershipId",
        sql.UniqueIdentifier,
        input.membershipId ?? null
      )
      .input(
        "serviceProviderId",
        sql.UniqueIdentifier,
        input.serviceProviderId ?? null
      )
      .input(
        "assignedByUserId",
        sql.UniqueIdentifier,
        context.userId
      )
      .input(
        "notes",
        sql.NVarChar(1000),
        input.notes ?? null
      )
      .query(`
        INSERT INTO dbo.MaintenanceTaskAssignments (
          OrganizationId,
          MaintenanceTaskId,
          MembershipId,
          ServiceProviderId,
          AssignedByUserId,
          Notes
        )
        OUTPUT
          INSERTED.TaskAssignmentId AS taskAssignmentId
        VALUES (
          @organizationId,
          @maintenanceTaskId,
          @membershipId,
          @serviceProviderId,
          @assignedByUserId,
          @notes
        );
      `);

    taskAssignmentId =
      insertResult.recordset[0]?.taskAssignmentId ?? null;

    if (!taskAssignmentId) {
      throw new Error(
        "The task assignment could not be created."
      );
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return getTaskAssignmentById(
    context,
    taskAssignmentId
  );
}

// ==================================================
// UPDATE TASK ASSIGNMENT STATUS
//
// ALLOWED TRANSITIONS:
// assigned    -> accepted, in_progress, completed, cancelled
// accepted    -> in_progress, completed, cancelled
// in_progress -> completed, cancelled
// completed  -> terminal
// cancelled  -> terminal
// ==================================================

export async function updateTaskAssignmentStatus(
  context: TaskAssignmentAccessContext,
  taskAssignmentId: string,
  input: UpdateTaskAssignmentStatusInput
) {
  const permissions = getRolePermissions(context.role);

  if (!permissions.canWrite) {
    throw new Error(
      "You do not have permission to update task assignments."
    );
  }

  const pool = await getDatabase();

  const request = addAccessParameters(
    pool.request(),
    context
  );

  const result = await request
    .input(
      "taskAssignmentId",
      sql.UniqueIdentifier,
      taskAssignmentId
    )
    .input(
      "status",
      sql.NVarChar(30),
      input.status
    )
    .input(
      "notes",
      sql.NVarChar(1000),
      input.notes ?? null
    )
    .input(
      "updateNotes",
      sql.Bit,
      input.notes !== undefined
    )
    .query(`
      UPDATE a
      SET
        Status = @status,

        CompletedAt = CASE
          WHEN @status = 'completed' THEN
            CASE
              WHEN a.CompletedAt IS NULL
                THEN SYSUTCDATETIME()
              ELSE a.CompletedAt
            END
          ELSE NULL
        END,

        Notes = CASE
          WHEN @updateNotes = 1 THEN @notes
          ELSE a.Notes
        END

      FROM dbo.MaintenanceTaskAssignments a

      INNER JOIN dbo.MaintenanceTasks t
        ON t.MaintenanceTaskId = a.MaintenanceTaskId
        AND t.OrganizationId = a.OrganizationId

      WHERE a.TaskAssignmentId = @taskAssignmentId
        AND a.OrganizationId = @organizationId

        -- Authorization.
        AND (
          @isPrivileged = 1
          OR (
            @canWrite = 1
            AND a.MembershipId = @membershipId
            AND a.ServiceProviderId IS NULL
            AND EXISTS (
              SELECT 1
              FROM dbo.UserPropertyAccess upa
              WHERE upa.MembershipId = @membershipId
                AND upa.PropertyId = t.PropertyId
            )
          )
        )

        -- Valid status transitions only.
        AND (
          (
            a.Status = 'assigned'
            AND @status IN (
              'accepted',
              'in_progress',
              'completed',
              'cancelled'
            )
          )
          OR (
            a.Status = 'accepted'
            AND @status IN (
              'in_progress',
              'completed',
              'cancelled'
            )
          )
          OR (
            a.Status = 'in_progress'
            AND @status IN (
              'completed',
              'cancelled'
            )
          )
        );

      SELECT @@ROWCOUNT AS affectedRows;
    `);

  if (result.recordset[0]?.affectedRows === 0) {
    // Distinguish an invalid transition from a missing
    // or inaccessible assignment.
    const existingResult = await addAccessParameters(
      pool.request(),
      context
    )
      .input(
        "taskAssignmentId",
        sql.UniqueIdentifier,
        taskAssignmentId
      )
      .query(`
        SELECT TOP 1
          a.TaskAssignmentId
        FROM dbo.MaintenanceTaskAssignments a
        INNER JOIN dbo.MaintenanceTasks t
          ON t.MaintenanceTaskId = a.MaintenanceTaskId
          AND t.OrganizationId = a.OrganizationId
        WHERE a.TaskAssignmentId = @taskAssignmentId
          AND a.OrganizationId = @organizationId
          AND (
            @isPrivileged = 1
            OR (
              @canWrite = 1
              AND a.MembershipId = @membershipId
              AND a.ServiceProviderId IS NULL
              AND EXISTS (
                SELECT 1
                FROM dbo.UserPropertyAccess upa
                WHERE upa.MembershipId = @membershipId
                  AND upa.PropertyId = t.PropertyId
              )
            )
          );
      `);

    if (existingResult.recordset[0]) {
      throw new Error(
        "Invalid task assignment status transition. Completed and cancelled assignments cannot be reopened."
      );
    }

    return null;
  }

  return getTaskAssignmentById(
    context,
    taskAssignmentId
  );
}
