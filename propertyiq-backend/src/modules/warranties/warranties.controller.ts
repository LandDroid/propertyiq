
import type { Request, Response } from "express";
import { ZodError } from "zod";
import * as service from "./warranties.service";
import {
  createWarrantySchema,
  updateWarrantySchema,
} from "./warranties.validation";

const isValidGuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );

function handleError(res: Response, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Please check the submitted warranty information.",
      errors: error.issues,
    });
  }

  if (
    error instanceof Error &&
    error.message.toLowerCase().includes("permission")
  ) {
    return res.status(403).json({
      success: false,
      message: error.message,
    });
  }

  const sqlError = error as { number?: number };

  if (sqlError?.number === 547) {
    return res.status(409).json({
      success: false,
      message:
        "The selected asset is invalid or this warranty is linked to another record.",
    });
  }

  console.error("Warranties API error:", error);

  return res.status(500).json({
    success: false,
    message:
      "An unexpected error occurred while processing the warranty.",
  });
}

export async function getWarranties(req: Request, res: Response) {
  try {
    const context = req.organizationContext;

    if (!context) {
      return res.status(403).json({
        success: false,
        message: "Organization access is required.",
      });
    }

    const warranties = await service.getAllWarranties(context);

    return res.json({
      success: true,
      data: warranties,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getWarranty(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const context = req.organizationContext;

    if (!isValidGuid(id)) {
      return res.status(400).json({
        success: false,
        message: "A valid warranty ID is required.",
      });
    }

    if (!context) {
      return res.status(403).json({
        success: false,
        message: "Organization access is required.",
      });
    }

    const warranty = await service.getWarrantyById(id, context);

    if (!warranty) {
      return res.status(404).json({
        success: false,
        message: "Warranty not found.",
      });
    }

    return res.json({
      success: true,
      data: warranty,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createWarranty(req: Request, res: Response) {
  try {
    const context = req.organizationContext;

    if (!context) {
      return res.status(403).json({
        success: false,
        message: "Organization access is required.",
      });
    }

    const data = createWarrantySchema.parse(req.body);

    if (
      data.organizationId &&
      data.organizationId.toLowerCase() !==
        context.organizationId.toLowerCase()
    ) {
      return res.status(403).json({
        success: false,
        message: "You cannot create a warranty for another organization.",
      });
    }

    const warranty = await service.createWarranty(data, context);

    if (!warranty) {
      return res.status(400).json({
        success: false,
        message:
          "The selected asset could not be found for this organization.",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Warranty created successfully.",
      data: warranty,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateWarranty(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const context = req.organizationContext;

    if (!isValidGuid(id)) {
      return res.status(400).json({
        success: false,
        message: "A valid warranty ID is required.",
      });
    }

    if (!context) {
      return res.status(403).json({
        success: false,
        message: "Organization access is required.",
      });
    }

    const data = updateWarrantySchema.parse(req.body);

    const warranty = await service.updateWarranty(
      id,
      context,
      data
    );

    if (!warranty) {
      return res.status(404).json({
        success: false,
        message: "Warranty not found or the selected asset is invalid.",
      });
    }

    return res.json({
      success: true,
      message: "Warranty updated successfully.",
      data: warranty,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function deleteWarranty(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const context = req.organizationContext;

    if (!isValidGuid(id)) {
      return res.status(400).json({
        success: false,
        message: "A valid warranty ID is required.",
      });
    }

    if (!context) {
      return res.status(403).json({
        success: false,
        message: "Organization access is required.",
      });
    }

    const deleted = await service.deleteWarranty(id, context);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Warranty not found.",
      });
    }

    return res.json({
      success: true,
      message: "Warranty deleted successfully.",
    });
  } catch (error) {
    return handleError(res, error);
  }
}
