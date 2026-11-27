import type { Request, Response } from "express";
import { ZodError } from "zod";

import { TelemetryService } from "./telemetry.service";

import {
  createTelemetrySchema,
  sensorIdSchema,
  telemetryHistoryLimitSchema,
} from "./telemetry.validation";

const service = new TelemetryService();

// =====================================================
// HELPERS
// =====================================================

function getUserId(req: Request): string | null {
  return req.user?.userId ?? null;
}

function getOrganizationId(
  req: Request
): string | null {
  return (
    req.user?.organizationId ??
    null
  );
}

function getSensorId(
  req: Request
): string | null {
  const parsed =
    sensorIdSchema.safeParse(
      req.params.sensorId
    );

  return parsed.success
    ? parsed.data
    : null;
}

// =====================================================
// ERROR HANDLER
// =====================================================

function handleError(
  res: Response,
  error: unknown
) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message:
        "Validation failed",
      errors: error.issues,
    });
  }

  console.error(
    "Telemetry API error:",
    error
  );

  return res.status(500).json({
    success: false,
    message:
      "An unexpected server error occurred",
  });
}

// =====================================================
// TELEMETRY CONTROLLER
// =====================================================

export class TelemetryController {
  // ===================================================
  // CREATE READING
  // ===================================================

  async create(
    req: Request,
    res: Response
  ) {
    try {
      const parsed =
        createTelemetrySchema.safeParse(
          req.body
        );

      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message:
            "Validation failed",
          errors:
            parsed.error.issues,
        });
      }

      const telemetry =
        await service.create(
          parsed.data
        );

      return res.status(201).json({
        success: true,
        message:
          "Telemetry recorded successfully",
        data: telemetry,
      });
    } catch (error) {
      return handleError(
        res,
        error
      );
    }
  }

  // ===================================================
  // GET LATEST READING
  // ===================================================

  async getLatest(
    req: Request,
    res: Response
  ) {
    try {
      const userId =
        getUserId(req);

      const organizationId =
        getOrganizationId(req);

      const sensorId =
        getSensorId(req);

      if (
        !userId ||
        !organizationId
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Authentication required",
        });
      }

      if (!sensorId) {
        return res.status(400).json({
          success: false,
          message:
            "Valid sensorId required",
        });
      }

      const reading =
        await service.getLatest(
          sensorId,
          organizationId,
          userId
        );

      if (!reading) {
        return res.status(404).json({
          success: false,
          message:
            "Reading not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: reading,
      });
    } catch (error) {
      return handleError(
        res,
        error
      );
    }
  }

  // ===================================================
  // GET HISTORY
  // ===================================================

  async getHistory(
    req: Request,
    res: Response
  ) {
    try {
      const userId =
        getUserId(req);

      const organizationId =
        getOrganizationId(req);

      const sensorId =
        getSensorId(req);

      const limit =
        telemetryHistoryLimitSchema.parse(
          req.query.limit
        );

      if (
        !userId ||
        !organizationId
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Authentication required",
        });
      }

      if (!sensorId) {
        return res.status(400).json({
          success: false,
          message:
            "Valid sensorId required",
        });
      }

      const history =
        await service.getHistory(
          sensorId,
          organizationId,
          userId,
          limit
        );

      return res.status(200).json({
        success: true,
        count:
          history?.length ?? 0,
        data: history,
      });
    } catch (error) {
      return handleError(
        res,
        error
      );
    }
  }

  // ===================================================
  // PROPERTY DASHBOARD
  // ===================================================
// ===================================================
// PROPERTY DASHBOARD
// ===================================================

async getPropertyDashboard(
  req: Request,
  res: Response
) {
  try {
    const userId =
      getUserId(req);

    const organizationId =
      getOrganizationId(req);

    const propertyId =
      typeof req.params.propertyId ===
      "string"
        ? req.params.propertyId
        : null;

    if (
      !userId ||
      !organizationId
    ) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required",
      });
    }

    if (!propertyId) {
      return res.status(400).json({
        success: false,
        message:
          "Valid propertyId required",
      });
    }

    const dashboard =
      await service.getPropertyDashboard(
        propertyId,
        organizationId,
        userId
      );

    return res.status(200).json({
      success: true,
      count:
        dashboard.length,
      data: dashboard,
    });
  } catch (error) {
    return handleError(
      res,
      error
    );
  }
}
}