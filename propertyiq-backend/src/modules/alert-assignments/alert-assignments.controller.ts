
import type { Request, Response } from "express";
import { ZodError } from "zod";

import {
  listAlertAssignments,
  findAlertAssignment,
  assignAlert,
  unassignAlertAssignment,
} from "./alert-assignments.service";

import {
  alertIdSchema,
  alertAssignmentIdSchema,
  createAlertAssignmentSchema,
  unassignAlertSchema,
} from "./alert-assignments.validation";

import type {
  AlertAssignmentAccessContext,
} from "./alert-assignments.repository";

// =====================================================
// VERIFIED ACCESS CONTEXT
// =====================================================

function getAccessContext(
  req: Request
): AlertAssignmentAccessContext | null {
  const organizationContext = req.organizationContext;
  const userId = req.user?.userId;

  if (!organizationContext || !userId) {
    return null;
  }

  return {
    organizationId: organizationContext.organizationId,
    membershipId: organizationContext.membershipId,
    userId,
    role: organizationContext.role,
  };
}

// =====================================================
// ERROR HANDLING
// =====================================================

function handleValidationError(
  error: unknown,
  res: Response
) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Validation failed.",
      issues: error.issues,
    });
  }

  return null;
}

function handleAssignmentError(
  error: unknown,
  res: Response,
  fallbackMessage: string
) {
  const validationResponse = handleValidationError(
    error,
    res
  );

  if (validationResponse) {
    return validationResponse;
  }

  const message =
    error instanceof Error ? error.message : "";

  if (message.toLowerCase().includes("permission")) {
    return res.status(403).json({
      success: false,
      message,
    });
  }

  if (
    message.includes("not found") ||
    message.includes("already unassigned")
  ) {
    return res.status(404).json({
      success: false,
      message,
    });
  }

  if (
    message.includes("assignee") ||
    message.includes("membership") ||
    message.includes("service provider")
  ) {
    return res.status(400).json({
      success: false,
      message,
    });
  }

  console.error("Alert assignment error:", error);

  return res.status(500).json({
    success: false,
    message: fallbackMessage,
  });
}

// =====================================================
// GET ASSIGNMENTS FOR ALERT
// =====================================================

export async function getAlertAssignmentsController(
  req: Request,
  res: Response
) {
  try {
    const context = getAccessContext(req);

    if (!context) {
      return res.status(403).json({
        success: false,
        message: "Organization access is required.",
      });
    }

    const parsedAlertId = alertIdSchema.safeParse(
      req.params.alertId
    );

    if (!parsedAlertId.success) {
      return res.status(400).json({
        success: false,
        message: "A valid alert ID is required.",
      });
    }

    const assignments = await listAlertAssignments(
      parsedAlertId.data,
      context
    );

    return res.status(200).json({
      success: true,
      data: assignments,
    });
  } catch (error) {
    console.error("Get alert assignments error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve alert assignments.",
    });
  }
}

// =====================================================
// GET ASSIGNMENT BY ID
// =====================================================

export async function getAlertAssignmentController(
  req: Request,
  res: Response
) {
  try {
    const context = getAccessContext(req);

    if (!context) {
      return res.status(403).json({
        success: false,
        message: "Organization access is required.",
      });
    }

    const parsedId = alertAssignmentIdSchema.safeParse(
      req.params.id
    );

    if (!parsedId.success) {
      return res.status(400).json({
        success: false,
        message: "A valid alert assignment ID is required.",
      });
    }

    const assignment = await findAlertAssignment(
      parsedId.data,
      context
    );

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Alert assignment not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: assignment,
    });
  } catch (error) {
    console.error("Get alert assignment error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve alert assignment.",
    });
  }
}

// =====================================================
// CREATE / REASSIGN ALERT
// =====================================================

export async function createAlertAssignmentController(
  req: Request,
  res: Response
) {
  try {
    const context = getAccessContext(req);

    if (!context) {
      return res.status(403).json({
        success: false,
        message: "Organization access is required.",
      });
    }

    const parsed = createAlertAssignmentSchema.safeParse(
      req.body
    );

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        issues: parsed.error.issues,
      });
    }
const assignment = await assignAlert(
  parsed.data,
  context
);
    return res.status(201).json({
      success: true,
      data: assignment,
      message: "Alert assigned successfully.",
    });
  } catch (error) {
    return handleAssignmentError(
      error,
      res,
      "Unable to create alert assignment."
    );
  }
}

// =====================================================
// UNASSIGN ALERT
// =====================================================

export async function unassignAlertController(
  req: Request,
  res: Response
) {
  try {
    const context = getAccessContext(req);

    if (!context) {
      return res.status(403).json({
        success: false,
        message: "Organization access is required.",
      });
    }

    const parsedId = alertAssignmentIdSchema.safeParse(
      req.params.id
    );

    if (!parsedId.success) {
      return res.status(400).json({
        success: false,
        message: "A valid alert assignment ID is required.",
      });
    }

    const parsedBody = unassignAlertSchema.safeParse(
      req.body ?? {}
    );

    if (!parsedBody.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        issues: parsedBody.error.issues,
      });
    }

    const assignment = await unassignAlertAssignment(
      parsedId.data,
      context,
      parsedBody.data
    );

    return res.status(200).json({
      success: true,
      data: assignment,
      message: "Alert assignment ended successfully.",
    });
  } catch (error) {
    return handleAssignmentError(
      error,
      res,
      "Unable to unassign alert."
    );
  }
}
