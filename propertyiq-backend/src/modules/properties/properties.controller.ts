
import type { Request, Response } from "express";
import { ZodError } from "zod";

import { PropertiesService } from "./properties.service";

import {
  createPropertySchema,
  updatePropertySchema,
  propertyIdSchema,
  organizationIdSchema,
} from "./properties.validation";

const service = new PropertiesService();

// =====================================================
// AUTHENTICATED USER
// =====================================================

function getUserId(req: Request): string | null {
  return req.user?.userId ?? null;
}

// =====================================================
// ORGANIZATION ID
// This is only a selector. SQL verifies membership.
// =====================================================

function getOrganizationId(req: Request): string | null {
  const value = req.query.organizationId;
  const parsed = organizationIdSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}

// =====================================================
// PROPERTY ID
// =====================================================

function getPropertyId(req: Request): string | null {
  const parsed = propertyIdSchema.safeParse(req.params.id);

  return parsed.success ? parsed.data : null;
}

// =====================================================
// ERROR HANDLER
// =====================================================

function handleError(res: Response, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: error.issues,
    });
  }

  console.error("Properties API error:", error);

  return res.status(500).json({
    success: false,
    message: "An unexpected server error occurred",
  });
}

// =====================================================
// GET ALL PROPERTIES
// =====================================================

export class PropertiesController {
  async getAll(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const organizationId = getOrganizationId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "A valid organizationId is required",
        });
      }

      const properties = await service.getAll(
        organizationId,
        userId
      );

      return res.status(200).json({
        success: true,
        count: properties.length,
        data: properties,
      });
    } catch (error) {
      return handleError(res, error);
    }
  }

  // ===================================================
  // GET ONE PROPERTY
  // ===================================================

  async getById(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const propertyId = getPropertyId(req);
      const organizationId = getOrganizationId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      if (!propertyId || !organizationId) {
        return res.status(400).json({
          success: false,
          message: "A valid property ID and organizationId are required",
        });
      }

      const property = await service.getById(
        propertyId,
        organizationId,
        userId
      );

      if (!property) {
        return res.status(404).json({
          success: false,
          message: "Property not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: property,
      });
    } catch (error) {
      return handleError(res, error);
    }
  }

  // ===================================================
  // CREATE PROPERTY
  // ===================================================

  async create(req: Request, res: Response) {
    try {
      const userId = getUserId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const parsed = createPropertySchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: parsed.error.issues,
        });
      }

      const property = await service.create(parsed.data, userId);

      if (!property) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to create properties in this organization.",
        });
      }

      return res.status(201).json({
        success: true,
        message: "Property created successfully",
        data: property,
      });
    } catch (error) {
      return handleError(res, error);
    }
  }

  // ===================================================
  // UPDATE PROPERTY
  // ===================================================

  async update(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const propertyId = getPropertyId(req);
      const organizationId = getOrganizationId(req);
      const parsed = updatePropertySchema.safeParse(req.body);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      if (!propertyId || !organizationId) {
        return res.status(400).json({
          success: false,
          message: "A valid property ID and organizationId are required",
        });
      }

      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: parsed.error.issues,
        });
      }

      const property = await service.update(
        propertyId,
        organizationId,
        userId,
        parsed.data
      );

      if (!property) {
        return res.status(404).json({
          success: false,
          message: "Property not found or you do not have permission to update it",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Property updated successfully",
        data: property,
      });
    } catch (error) {
      return handleError(res, error);
    }
  }

  // ===================================================
  // DELETE PROPERTY
  // ===================================================

  async delete(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const propertyId = getPropertyId(req);
      const organizationId = getOrganizationId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      if (!propertyId || !organizationId) {
        return res.status(400).json({
          success: false,
          message: "A valid property ID and organizationId are required",
        });
      }

      const deleted = await service.delete(
        propertyId,
        organizationId,
        userId
      );

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: "Property not found or you do not have permission to delete it",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Property deleted successfully",
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
}
