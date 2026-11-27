
import { Request, Response } from "express";

import { MaintenanceTasksService } from "./maintenance-tasks.service";

import {
  createMaintenanceTaskSchema,
  updateMaintenanceTaskSchema,
  maintenanceTaskIdSchema,
  maintenanceTaskPrioritySchema,
  maintenanceTaskStatusSchema,
} from "./maintenance-tasks.validation";

const maintenanceTasksService = new MaintenanceTasksService();

// =====================================================
// ORGANIZATION CONTEXT
// =====================================================

function getVerifiedOrganizationContext(req: Request) {
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

// =====================================================
// ROUTE ID VALIDATION
// =====================================================

function getRouteId(req: Request): string | null {
  const id = req.params.id;

  if (typeof id !== "string") {
    return null;
  }

  const result = maintenanceTaskIdSchema.safeParse(id);

  return result.success ? result.data : null;
}

// =====================================================
// QUERY PARAMETER HELPER
// =====================================================

function getQueryString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

// =====================================================
// ERROR HELPERS
// =====================================================

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred.";
}

function isPermissionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("permission") ||
    message.includes("not authorized") ||
    message.includes("do not have access") ||
    message.includes("not found or you do not have access")
  );
}

// =====================================================
// GET ALL MAINTENANCE TASKS
// GET /api/v1/maintenance-tasks
// =====================================================

export async function listMaintenanceTasks(
  req: Request,
  res: Response
) {
  try {
    const context = getVerifiedOrganizationContext(req);

    if (!context) {
      return res.status(403).json({
        message: "Organization access is required.",
      });
    }

    const propertyId = getQueryString(req.query.propertyId);
    const status = getQueryString(req.query.status);

    if (propertyId) {
      const propertyValidation =
        maintenanceTaskIdSchema.safeParse(propertyId);

      if (!propertyValidation.success) {
        return res.status(400).json({
          message: "Invalid property ID.",
        });
      }
    }

    if (status) {
      const statusValidation =
        maintenanceTaskStatusSchema.safeParse(status);

      if (!statusValidation.success) {
        return res.status(400).json({
          message: "Invalid maintenance task status.",
        });
      }
    }

 const filters: {
  propertyId?: string;
  status?: string;
} = {};

if (propertyId) {
  filters.propertyId = propertyId;
}

if (status) {
  filters.status = status;
}

const tasks =
  await maintenanceTasksService.getAll(
    context,
    filters
  );

    return res.status(200).json({
      success: true,
      count: tasks.length,
      data: tasks,
    });
  } catch (error) {
    console.error("List maintenance tasks error:", error);

    return res.status(isPermissionError(error) ? 403 : 500).json({
      message: getErrorMessage(error),
    });
  }
}

// =====================================================
// GET MAINTENANCE TASK BY ID
// GET /api/v1/maintenance-tasks/:id
// =====================================================

export async function getMaintenanceTask(
  req: Request,
  res: Response
) {
  try {
    const context = getVerifiedOrganizationContext(req);

    if (!context) {
      return res.status(403).json({
        message: "Organization access is required.",
      });
    }

    const maintenanceTaskId = getRouteId(req);

    if (!maintenanceTaskId) {
      return res.status(400).json({
        message: "Invalid maintenance task ID.",
      });
    }

    const task = await maintenanceTasksService.getById(
      context,
      maintenanceTaskId
    );

    if (!task) {
      return res.status(404).json({
        message: "Maintenance task not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: task,
    });
  } catch (error) {
    console.error("Get maintenance task error:", error);

    return res.status(isPermissionError(error) ? 403 : 500).json({
      message: getErrorMessage(error),
    });
  }
}

// =====================================================
// CREATE MAINTENANCE TASK
// POST /api/v1/maintenance-tasks
// =====================================================

export async function addMaintenanceTask(
  req: Request,
  res: Response
) {
  try {
    const context = getVerifiedOrganizationContext(req);

    if (!context) {
      return res.status(403).json({
        message: "Organization access is required.",
      });
    }

    const validation = createMaintenanceTaskSchema.safeParse(
      req.body
    );

    if (!validation.success) {
      return res.status(400).json({
        message: "Invalid maintenance task data.",
        errors: validation.error.flatten(),
      });
    }

    const task = await maintenanceTasksService.create(
      context,
      validation.data
    );

    return res.status(201).json({
      success: true,
      message: "Maintenance task created successfully.",
      data: task,
    });
  } catch (error) {
    console.error("Create maintenance task error:", error);

    return res.status(isPermissionError(error) ? 403 : 400).json({
      message: getErrorMessage(error),
    });
  }
}

// =====================================================
// UPDATE MAINTENANCE TASK
// PATCH /api/v1/maintenance-tasks/:id
// =====================================================

export async function editMaintenanceTask(
  req: Request,
  res: Response
) {
  try {
    const context = getVerifiedOrganizationContext(req);

    if (!context) {
      return res.status(403).json({
        message: "Organization access is required.",
      });
    }

    const maintenanceTaskId = getRouteId(req);

    if (!maintenanceTaskId) {
      return res.status(400).json({
        message: "Invalid maintenance task ID.",
      });
    }

    const validation = updateMaintenanceTaskSchema.safeParse(
      req.body
    );

    if (!validation.success) {
      return res.status(400).json({
        message: "Invalid maintenance task update data.",
        errors: validation.error.flatten(),
      });
    }

    const task = await maintenanceTasksService.update(
      context,
      maintenanceTaskId,
      validation.data
    );

    if (!task) {
      return res.status(404).json({
        message: "Maintenance task not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Maintenance task updated successfully.",
      data: task,
    });
  } catch (error) {
    console.error("Update maintenance task error:", error);

    return res.status(isPermissionError(error) ? 403 : 400).json({
      message: getErrorMessage(error),
    });
  }
}

// =====================================================
// DELETE MAINTENANCE TASK
// DELETE /api/v1/maintenance-tasks/:id
// Owner / Administrator only
// =====================================================

export async function removeMaintenanceTask(
  req: Request,
  res: Response
) {
  try {
    const context = getVerifiedOrganizationContext(req);

    if (!context) {
      return res.status(403).json({
        message: "Organization access is required.",
      });
    }

    const maintenanceTaskId = getRouteId(req);

    if (!maintenanceTaskId) {
      return res.status(400).json({
        message: "Invalid maintenance task ID.",
      });
    }

    const deleted = await maintenanceTasksService.delete(
      context,
      maintenanceTaskId
    );

    if (!deleted) {
      return res.status(404).json({
        message: "Maintenance task not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Maintenance task deleted successfully.",
    });
  } catch (error) {
    console.error("Delete maintenance task error:", error);

    return res.status(isPermissionError(error) ? 403 : 400).json({
      message: getErrorMessage(error),
    });
  }
}
