
import { Request, Response } from "express";

import {
  listAlerts,
  findAlert,
  createAlert,
  acknowledgeAlert,
  resolveAlert,
} from "./alerts.service";

import { createAlertSchema } from "./alerts.validation";

function getAccessContext(req: Request) {
  return req.organizationContext;
}

function isValidGuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

// =====================================================
// ERROR DETECTION
// =====================================================

function isAuthorizationError(error: unknown): error is Error {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("permission") ||
    message.includes("access")
  );
}

function isRelationshipValidationError(
  error: unknown
): error is Error {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("does not belong") ||
    message.includes("does not match") ||
    message.includes("must belong") ||
    message.includes("must match") ||
    message.includes("invalid device") ||
    message.includes("invalid sensor") ||
    message.includes("invalid alert rule")
  );
}

// =====================================================
// GET ALL ALERTS
// =====================================================

export async function getAlerts(
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

    const alerts = await listAlerts(context);

    return res.status(200).json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    console.error("Get alerts error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve alerts.",
    });
  }
}

// =====================================================
// GET ALERT BY ID
// =====================================================

export async function getAlert(
  req: Request,
  res: Response
) {
  try {
    const { id } = req.params;
    const context = getAccessContext(req);

    if (!isValidGuid(id)) {
      return res.status(400).json({
        success: false,
        message: "A valid alert ID is required.",
      });
    }

    if (!context) {
      return res.status(403).json({
        success: false,
        message: "Organization access is required.",
      });
    }

    const alert = await findAlert(id, context);

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: "Alert not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: alert,
    });
  } catch (error) {
    console.error("Get alert error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve alert.",
    });
  }
}

// =====================================================
// CREATE ALERT
// =====================================================

export async function createAlertController(
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

    const validation = createAlertSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid alert data.",
        errors: validation.error.flatten(),
      });
    }

    const alert = await createAlert(
      context,
      validation.data
    );

    return res.status(201).json({
      success: true,
      data: alert,
      message: "Alert created successfully.",
    });
  } catch (error) {
    if (isAuthorizationError(error)) {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }

    if (isRelationshipValidationError(error)) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Create alert error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create alert.",
    });
  }
}

// =====================================================
// CHANGE ALERT STATUS
// =====================================================

async function changeAlertStatus(
  req: Request,
  res: Response,
  action: "acknowledge" | "resolve"
) {
  try {
    const { id } = req.params;
    const context = getAccessContext(req);

    if (!isValidGuid(id)) {
      return res.status(400).json({
        success: false,
        message: "A valid alert ID is required.",
      });
    }

    if (!context) {
      return res.status(403).json({
        success: false,
        message: "Organization access is required.",
      });
    }

    const alert =
      action === "acknowledge"
        ? await acknowledgeAlert(id, context)
        : await resolveAlert(id, context);

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: "Alert not found or cannot be updated.",
      });
    }

    return res.status(200).json({
      success: true,
      data: alert,
      message:
        action === "acknowledge"
          ? "Alert acknowledged."
          : "Alert resolved.",
    });
  } catch (error) {
    if (isAuthorizationError(error)) {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }

    console.error(`${action} alert error:`, error);

    return res.status(500).json({
      success: false,
      message: `Unable to ${action} alert.`,
    });
  }
}

// =====================================================
// ACKNOWLEDGE ALERT
// =====================================================

export async function acknowledgeAlertController(
  req: Request,
  res: Response
) {
  return changeAlertStatus(req, res, "acknowledge");
}

// =====================================================
// RESOLVE ALERT
// =====================================================

export async function resolveAlertController(
  req: Request,
  res: Response
) {
  return changeAlertStatus(req, res, "resolve");
}
