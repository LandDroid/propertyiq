
import { Request, Response } from "express";
import { ZodError } from "zod";

import { PropertyServicesService } from "./property-services.service";

import {
  createPropertyServiceSchema,
  propertyServiceIdSchema,
  updatePropertyServiceSchema,
  updatePropertyServiceStatusSchema,
} from "./property-services.validation";

const propertyServicesService = new PropertyServicesService();

function getUserId(req: Request): string | null {
  const user = (req as any).user;

  return user?.userId ?? user?.id ?? null;
}

function getOrganizationId(req: Request): string | null {
  return (
    (req.query.organizationId as string | undefined) ??
    (req.body?.organizationId as string | undefined) ??
    null
  );
}

function handleError(res: Response, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: "Validation failed.",
      errors: error.issues,
    });
  }

  console.error("Property Services Controller Error:", error);

  return res.status(500).json({
    message: "An unexpected error occurred.",
  });
}

// =====================================================
// GET ALL PROPERTY SERVICES
// =====================================================

export async function getPropertyServices(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);

    if (!userId || !organizationId) {
      return res.status(400).json({
        message: "User ID and organization ID are required.",
      });
    }

    const services = await propertyServicesService.getAll(
      organizationId,
      userId
    );

    return res.status(200).json(services);
  } catch (error) {
    return handleError(res, error);
  }
}

// =====================================================
// GET PROPERTY SERVICE BY ID
// =====================================================

export async function getPropertyServiceById(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);

    if (!userId || !organizationId) {
      return res.status(400).json({
        message: "User ID and organization ID are required.",
      });
    }

    const idResult = propertyServiceIdSchema.safeParse(req.params.id);

    if (!idResult.success) {
      return res.status(400).json({
        message: "Invalid property service ID.",
        errors: idResult.error.issues,
      });
    }

    const service = await propertyServicesService.getById(
      idResult.data,
      organizationId,
      userId
    );

    if (!service) {
      return res.status(404).json({
        message: "Property service not found.",
      });
    }

    return res.status(200).json(service);
  } catch (error) {
    return handleError(res, error);
  }
}

// =====================================================
// CREATE PROPERTY SERVICE
// =====================================================

export async function createPropertyService(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    const parsed = createPropertyServiceSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed.",
        errors: parsed.error.issues,
      });
    }

    const service = await propertyServicesService.create(
      parsed.data,
      userId
    );

    if (!service) {
      return res.status(403).json({
        message:
          "Unable to create property service. Verify your permissions, property, and assignee.",
      });
    }

    return res.status(201).json({
      message: "Property service created successfully.",
      service,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// =====================================================
// UPDATE PROPERTY SERVICE
// =====================================================

export async function updatePropertyService(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);

    if (!userId || !organizationId) {
      return res.status(400).json({
        message: "User ID and organization ID are required.",
      });
    }

    const idResult = propertyServiceIdSchema.safeParse(req.params.id);

    if (!idResult.success) {
      return res.status(400).json({
        message: "Invalid property service ID.",
        errors: idResult.error.issues,
      });
    }

    const parsed = updatePropertyServiceSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed.",
        errors: parsed.error.issues,
      });
    }

    const service = await propertyServicesService.update(
      idResult.data,
      organizationId,
      userId,
      parsed.data
    );

    if (!service) {
      return res.status(404).json({
        message:
          "Property service not found, or the update was not permitted.",
      });
    }

    return res.status(200).json({
      message: "Property service updated successfully.",
      service,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// =====================================================
// UPDATE PROPERTY SERVICE STATUS
// =====================================================

export async function updatePropertyServiceStatus(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);

    if (!userId || !organizationId) {
      return res.status(400).json({
        message: "User ID and organization ID are required.",
      });
    }

    const idResult = propertyServiceIdSchema.safeParse(req.params.id);

    if (!idResult.success) {
      return res.status(400).json({
        message: "Invalid property service ID.",
        errors: idResult.error.issues,
      });
    }

    const parsed = updatePropertyServiceStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed.",
        errors: parsed.error.issues,
      });
    }

    const service = await propertyServicesService.updateStatus(
      idResult.data,
      organizationId,
      userId,
      parsed.data
    );

    if (!service) {
      return res.status(404).json({
        message:
          "Property service not found, or the status update was not permitted.",
      });
    }

    return res.status(200).json({
      message: "Property service status updated successfully.",
      service,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
