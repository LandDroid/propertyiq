
import { Request, Response } from "express";

import {
  getAllMaintenance,
  getMaintenanceById,
  createMaintenance,
  updateMaintenance,
  completeMaintenance,
  deleteMaintenance,
  MaintenanceInput,
  MaintenanceAccessContext,
} from "./maintenance.repository";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_STATUSES = [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
  "overdue",
];

// ==================================================
// VERIFIED ORGANIZATION CONTEXT
// ==================================================

function getVerifiedOrganizationContext(
  req: Request
): MaintenanceAccessContext | null {
  const context = req.organizationContext;

  if (!context) {
    return null;
  }

  return {
    organizationId: context.organizationId,
    membershipId: context.membershipId,
    role: context.role,
  };
}

// ==================================================
// MAINTENANCE ID VALIDATION
// ==================================================

function maintenanceIdFromRequest(req: Request): string | null {
  const value = String(req.params.id || "");

  return UUID_REGEX.test(value) ? value : null;
}

// ==================================================
// PERMISSION ERROR HANDLING
// ==================================================

function isPermissionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("permission")
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

// ==================================================
// VALIDATE MAINTENANCE INPUT
// ==================================================

function validateMaintenance(body: any): string | null {
  if (!body || typeof body !== "object") {
    return "Request body is required.";
  }

  if (
    typeof body.assetId !== "string" ||
    !UUID_REGEX.test(body.assetId)
  ) {
    return "A valid asset must be selected.";
  }

  if (
    typeof body.maintenanceTitle !== "string" ||
    !body.maintenanceTitle.trim() ||
    body.maintenanceTitle.length > 150
  ) {
    return "Maintenance title is required and must be 150 characters or fewer.";
  }

  for (const field of ["dueDate", "completedDate"]) {
    const value = body[field];

    if (value == null || value === "") continue;

    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
      return `${field} must use YYYY-MM-DD format.`;
    }

    const date = new Date(`${value}T00:00:00`);

    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      return `${field} is not a valid date.`;
    }
  }

  if (
    body.recurrenceMonths != null &&
    (!Number.isInteger(Number(body.recurrenceMonths)) ||
      Number(body.recurrenceMonths) <= 0)
  ) {
    return "Recurrence months must be a positive whole number.";
  }

  if (
    body.cost != null &&
    (!Number.isFinite(Number(body.cost)) ||
      Number(body.cost) < 0)
  ) {
    return "Cost must be zero or greater.";
  }

  if (
    body.status != null &&
    !ALLOWED_STATUSES.includes(String(body.status))
  ) {
    return "Invalid maintenance status.";
  }

  if (
    body.maintenanceType != null &&
    (typeof body.maintenanceType !== "string" ||
      body.maintenanceType.length > 50)
  ) {
    return "Maintenance type must be 50 characters or fewer.";
  }

  if (
    body.serviceProvider != null &&
    (typeof body.serviceProvider !== "string" ||
      body.serviceProvider.length > 150)
  ) {
    return "Service provider must be 150 characters or fewer.";
  }

  if (
    body.description != null &&
    typeof body.description !== "string"
  ) {
    return "Description must be text.";
  }

  if (
    body.notes != null &&
    typeof body.notes !== "string"
  ) {
    return "Notes must be text.";
  }

  return null;
}

// ==================================================
// CONVERT REQUEST BODY
// ==================================================

function toMaintenanceInput(body: any): MaintenanceInput {
  return {
    assetId: String(body.assetId),
    maintenanceTitle: String(body.maintenanceTitle).trim(),
    description: body.description ?? null,
    maintenanceType: body.maintenanceType || "scheduled",
    dueDate: body.dueDate || null,
    completedDate: body.completedDate || null,
    recurrenceMonths:
      body.recurrenceMonths == null
        ? null
        : Number(body.recurrenceMonths),
    status: body.status || "scheduled",
    serviceProvider: body.serviceProvider ?? null,
    cost: body.cost == null ? null : Number(body.cost),
    notes: body.notes ?? null,
  };
}

// ==================================================
// GET ALL MAINTENANCE RECORDS
// GET /api/v1/maintenance
// ==================================================

export async function listMaintenance(
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

    const data = await getAllMaintenance(access);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("List maintenance error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve maintenance records.",
    });
  }
}

// ==================================================
// GET ONE MAINTENANCE RECORD
// GET /api/v1/maintenance/:id
// ==================================================

export async function getMaintenance(
  req: Request,
  res: Response
) {
  try {
    const access = getVerifiedOrganizationContext(req);
    const maintenanceId = maintenanceIdFromRequest(req);

    if (!access || !maintenanceId) {
      return res.status(400).json({
        success: false,
        message: "A valid organization and maintenance ID are required.",
      });
    }

    const data = await getMaintenanceById(
      access,
      maintenanceId
    );

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Maintenance record not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Get maintenance error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve maintenance record.",
    });
  }
}

// ==================================================
// CREATE MAINTENANCE RECORD
// POST /api/v1/maintenance
// ==================================================

export async function addMaintenance(
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

    const validationError = validateMaintenance(req.body);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const data = await createMaintenance(
      access,
      toMaintenanceInput(req.body)
    );

    return res.status(201).json({
      success: true,
      message: "Maintenance task created successfully.",
      data,
    });
  } catch (error) {
    console.error("Create maintenance error:", error);

    return res.status(isPermissionError(error) ? 403 : 400).json({
      success: false,
      message: getErrorMessage(
        error,
        "Could not create maintenance task."
      ),
    });
  }
}

// ==================================================
// UPDATE MAINTENANCE RECORD
// PUT /api/v1/maintenance/:id
// ==================================================

export async function editMaintenance(
  req: Request,
  res: Response
) {
  try {
    const access = getVerifiedOrganizationContext(req);
    const maintenanceId = maintenanceIdFromRequest(req);

    if (!access || !maintenanceId) {
      return res.status(400).json({
        success: false,
        message: "A valid organization and maintenance ID are required.",
      });
    }

    const validationError = validateMaintenance(req.body);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const data = await updateMaintenance(
      access,
      maintenanceId,
      toMaintenanceInput(req.body)
    );

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Maintenance record not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Maintenance task updated successfully.",
      data,
    });
  } catch (error) {
    console.error("Update maintenance error:", error);

    return res.status(isPermissionError(error) ? 403 : 400).json({
      success: false,
      message: getErrorMessage(
        error,
        "Could not update maintenance task."
      ),
    });
  }
}

// ==================================================
// COMPLETE MAINTENANCE RECORD
// PATCH /api/v1/maintenance/:id/complete
// ==================================================

export async function markMaintenanceComplete(
  req: Request,
  res: Response
) {
  try {
    const access = getVerifiedOrganizationContext(req);
    const maintenanceId = maintenanceIdFromRequest(req);

    if (!access || !maintenanceId) {
      return res.status(400).json({
        success: false,
        message: "A valid organization and maintenance ID are required.",
      });
    }

    const data = await completeMaintenance(
      access,
      maintenanceId
    );

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Maintenance record not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Maintenance task completed successfully.",
      data,
    });
  } catch (error) {
    console.error("Complete maintenance error:", error);

    return res.status(isPermissionError(error) ? 403 : 500).json({
      success: false,
      message: getErrorMessage(
        error,
        "Could not complete maintenance task."
      ),
    });
  }
}

// ==================================================
// DELETE MAINTENANCE RECORD
// DELETE /api/v1/maintenance/:id
// ==================================================

export async function removeMaintenance(
  req: Request,
  res: Response
) {
  try {
    const access = getVerifiedOrganizationContext(req);
    const maintenanceId = maintenanceIdFromRequest(req);

    if (!access || !maintenanceId) {
      return res.status(400).json({
        success: false,
        message: "A valid organization and maintenance ID are required.",
      });
    }

    const deleted = await deleteMaintenance(
      access,
      maintenanceId
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Maintenance record not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Maintenance task deleted successfully.",
    });
  } catch (error) {
    console.error("Delete maintenance error:", error);

    return res.status(isPermissionError(error) ? 403 : 500).json({
      success: false,
      message: getErrorMessage(
        error,
        "Could not delete maintenance task."
      ),
    });
  }
}
