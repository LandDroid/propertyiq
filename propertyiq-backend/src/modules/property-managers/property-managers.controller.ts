import type { Request, Response } from "express";
import { ZodError } from "zod";

import { PropertyManagersService } from "./property-managers.service";

import {
  createPropertyManagerSchema,
  organizationIdSchema,
  propertyManagerIdSchema,
} from "./property-managers.validation";

const service = new PropertyManagersService();

// =====================================================
// HELPERS
// =====================================================

function getUserId(req: Request): string | null {
  return req.user?.userId ?? null;
}

function getOrganizationId(req: Request): string {
  return organizationIdSchema.parse(req.query.organizationId);
}

function getPropertyManagerId(req: Request): string {
  return propertyManagerIdSchema.parse(req.params.id);
}

// =====================================================
// ERROR HANDLING
// =====================================================

function handleError(
  res: Response,
  error: unknown,
  message: string
) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Invalid request data.",
      errors: error.flatten(),
    });
  }

  console.error("Property Managers API error:", error);

  return res.status(500).json({
    success: false,
    message,
  });
}

// =====================================================
// PROPERTY MANAGERS CONTROLLER
// =====================================================

export class PropertyManagersController {
  // ===================================================
  // GET ALL PROPERTY MANAGER ASSIGNMENTS
  // ===================================================

  async getAll(req: Request, res: Response) {
    try {
      const userId = getUserId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required.",
        });
      }

      const organizationId = getOrganizationId(req);

      const assignments = await service.getAll(
        organizationId,
        userId
      );

      return res.status(200).json({
        success: true,
        count: assignments.length,
        data: assignments,
      });
    } catch (error) {
      return handleError(
        res,
        error,
        "Failed to retrieve property manager assignments."
      );
    }
  }

  // ===================================================
  // GET PROPERTY MANAGER ASSIGNMENT BY ID
  // ===================================================

  async getById(req: Request, res: Response) {
    try {
      const userId = getUserId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required.",
        });
      }

      const organizationId = getOrganizationId(req);
      const propertyManagerId = getPropertyManagerId(req);

      const assignment = await service.getById(
        propertyManagerId,
        organizationId,
        userId
      );

      if (!assignment) {
        return res.status(404).json({
          success: false,
          message: "Property manager assignment not found.",
        });
      }

      return res.status(200).json({
        success: true,
        data: assignment,
      });
    } catch (error) {
      return handleError(
        res,
        error,
        "Failed to retrieve property manager assignment."
      );
    }
  }

  // ===================================================
  // CREATE PROPERTY MANAGER ASSIGNMENT
  // ===================================================

  async create(req: Request, res: Response) {
    try {
      const userId = getUserId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required.",
        });
      }

      const data = createPropertyManagerSchema.parse(req.body);

      const assignment = await service.create(data, userId);

      if (!assignment) {
        return res.status(409).json({
          success: false,
          message:
            "Unable to create assignment. Verify that the property and membership belong to this organization and that no active assignment already exists.",
        });
      }

      return res.status(201).json({
        success: true,
        message: "Property manager assigned successfully.",
        data: assignment,
      });
    } catch (error) {
      return handleError(
        res,
        error,
        "Failed to create property manager assignment."
      );
    }
  }

  // ===================================================
  // END PROPERTY MANAGER ASSIGNMENT
  // ===================================================

  async end(req: Request, res: Response) {
    try {
      const userId = getUserId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required.",
        });
      }

      const organizationId = getOrganizationId(req);
      const propertyManagerId = getPropertyManagerId(req);

      const assignment = await service.end(
        propertyManagerId,
        organizationId,
        userId
      );

      if (!assignment) {
        return res.status(404).json({
          success: false,
          message:
            "Property manager assignment not found, already ended, or unavailable.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Property manager assignment ended successfully.",
        data: assignment,
      });
    } catch (error) {
      return handleError(
        res,
        error,
        "Failed to end property manager assignment."
      );
    }
  }
}