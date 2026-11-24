
import { Request, Response } from "express";

import { MaintenanceTaskAssignmentsService } from "./maintenance-task-assignments.service";

import {
  createTaskAssignmentSchema,
  updateTaskAssignmentStatusSchema,
  maintenanceTaskIdSchema,
  taskAssignmentIdSchema,
} from "./maintenance-task-assignments.validation";

import type {
  TaskAssignmentAccessContext,
} from "./maintenance-task-assignments.repository";

const service = new MaintenanceTaskAssignmentsService();

// ==================================================
// VERIFIED ORGANIZATION CONTEXT
// ==================================================

function getVerifiedOrganizationContext(
  req: Request
): TaskAssignmentAccessContext | null {
  const context = req.organizationContext;
  const user = (req as any).user;

  const userId = user?.userId ?? user?.id;

  if (!context || !userId) {
    return null;
  }

  return {
    organizationId: context.organizationId,
    membershipId: context.membershipId,
    role: context.role,
    userId,
  };
}

// ==================================================
// REQUEST ID HELPERS
// ==================================================

function getRouteId(req: Request): string | null {
  const id = req.params.id;

  return typeof id === "string" ? id : null;
}

function isPermissionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("permission") ||
    message.includes("not authorized") ||
    message.includes("do not have access")
  );
}

function getErrorMessage(
  error: unknown,
  fallback: string
): string {
  return error instanceof Error ? error.message : fallback;
}

// ==================================================
// GET ASSIGNMENTS FOR A MAINTENANCE TASK
// GET /api/v1/maintenance-task-assignments/task/:maintenanceTaskId
// ==================================================

export async function listTaskAssignments(
  req: Request,
  res: Response
) {
  try {
    const access = getVerifiedOrganizationContext(req);

    const validation = maintenanceTaskIdSchema.safeParse(
      req.params.maintenanceTaskId
    );

    if (!access || !validation.success) {
      return res.status(400).json({
        success: false,
        message: "A valid organization and maintenance task ID are required.",
      });
    }

    const data = await service.getAssignmentsByTask(
      access,
      validation.data
    );

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("List task assignments error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve task assignments.",
    });
  }
}

// ==================================================
// GET ONE TASK ASSIGNMENT
// GET /api/v1/maintenance-task-assignments/:id
// ==================================================

export async function getTaskAssignment(
  req: Request,
  res: Response
) {
  try {
    const access = getVerifiedOrganizationContext(req);
    const id = getRouteId(req);
    const validation = taskAssignmentIdSchema.safeParse(id);

    if (!access || !validation.success) {
      return res.status(400).json({
        success: false,
        message: "A valid organization and task assignment ID are required.",
      });
    }

    const data = await service.getTaskAssignmentById(
      access,
      validation.data
    );

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Task assignment not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Get task assignment error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve task assignment.",
    });
  }
}

// ==================================================
// CREATE OR REASSIGN MAINTENANCE TASK
// POST /api/v1/maintenance-task-assignments
// ==================================================

export async function addTaskAssignment(
  req: Request,
  res: Response
) {
  try {
    const access = getVerifiedOrganizationContext(req);

    if (!access) {
      return res.status(403).json({
        success: false,
        message: "Verified organization access is required.",
      });
    }

    const validation = createTaskAssignmentSchema.safeParse({
      ...req.body,
      organizationId: access.organizationId,
    });

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid task assignment information.",
        errors: validation.error.flatten(),
      });
    }

    const data = await service.createTaskAssignment(
      access,
      validation.data
    );

    return res.status(201).json({
      success: true,
      message: "Maintenance task assigned successfully.",
      data,
    });
  } catch (error) {
    console.error("Create task assignment error:", error);

    return res.status(isPermissionError(error) ? 403 : 400).json({
      success: false,
      message: getErrorMessage(
        error,
        "Could not create task assignment."
      ),
    });
  }
}

// ==================================================
// UPDATE TASK ASSIGNMENT STATUS
// PATCH /api/v1/maintenance-task-assignments/:id/status
// ==================================================

export async function editTaskAssignmentStatus(
  req: Request,
  res: Response
) {
  try {
    const access = getVerifiedOrganizationContext(req);
    const id = getRouteId(req);
    const idValidation = taskAssignmentIdSchema.safeParse(id);

    if (!access || !idValidation.success) {
      return res.status(400).json({
        success: false,
        message: "A valid organization and task assignment ID are required.",
      });
    }

    const validation = updateTaskAssignmentStatusSchema.safeParse(
      req.body
    );

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid task assignment status.",
        errors: validation.error.flatten(),
      });
    }

    const data = await service.updateTaskAssignmentStatus(
      access,
      idValidation.data,
      validation.data
    );

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Task assignment not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Task assignment updated successfully.",
      data,
    });
  } catch (error) {
    console.error("Update task assignment status error:", error);

    return res.status(isPermissionError(error) ? 403 : 400).json({
      success: false,
      message: getErrorMessage(
        error,
        "Could not update task assignment."
      ),
    });
  }
}
