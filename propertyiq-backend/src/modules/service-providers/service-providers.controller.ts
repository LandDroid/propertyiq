
import { Request, Response } from "express";

import { ServiceProvidersService } from "./service-providers.service";

import {
  createServiceProviderSchema,
  updateServiceProviderSchema,
  updateServiceProviderStatusSchema,
} from "./service-providers.validation";

const service = new ServiceProvidersService();

// =====================================================
// HELPERS
// =====================================================

function getUserId(req: Request): string | null {
  return (req as any).user?.userId ?? (req as any).user?.id ?? null;
}

function getOrganizationId(req: Request): string | null {
  const organizationId =
    req.query.organizationId ?? req.body?.organizationId;

  return typeof organizationId === "string" ? organizationId : null;
}

function getServiceProviderId(req: Request): string | null {
  const id = req.params.id;

  return typeof id === "string" ? id : null;
}

// =====================================================
// GET ALL SERVICE PROVIDERS
// GET /api/v1/service-providers
// =====================================================

export async function getServiceProviders(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required.",
      });
    }

    const providers = await service.getAll(organizationId, userId);

    return res.status(200).json({
      success: true,
      count: providers.length,
      data: providers,
    });
  } catch (error) {
    console.error("Get service providers error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve service providers.",
    });
  }
}

// =====================================================
// GET SERVICE PROVIDER BY ID
// GET /api/v1/service-providers/:id
// =====================================================

export async function getServiceProviderById(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);
    const serviceProviderId = getServiceProviderId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required.",
      });
    }

    if (!serviceProviderId) {
      return res.status(400).json({
        success: false,
        message: "Invalid service provider ID.",
      });
    }

    const provider = await service.getById(
      serviceProviderId,
      organizationId,
      userId
    );

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Service provider not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: provider,
    });
  } catch (error) {
    console.error("Get service provider error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve service provider.",
    });
  }
}

// =====================================================
// CREATE SERVICE PROVIDER
// POST /api/v1/service-providers
// =====================================================

export async function createServiceProvider(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const validation = createServiceProviderSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid service provider information.",
        errors: validation.error.flatten(),
      });
    }

    const provider = await service.create(validation.data, userId);

    if (!provider) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to create service providers.",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Service provider created successfully.",
      data: provider,
    });
  } catch (error) {
    console.error("Create service provider error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create service provider.",
    });
  }
}

// =====================================================
// UPDATE SERVICE PROVIDER
// PUT /api/v1/service-providers/:id
// =====================================================

export async function updateServiceProvider(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);
    const serviceProviderId = getServiceProviderId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required.",
      });
    }

    if (!serviceProviderId) {
      return res.status(400).json({
        success: false,
        message: "Invalid service provider ID.",
      });
    }

    const validation = updateServiceProviderSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid service provider information.",
        errors: validation.error.flatten(),
      });
    }

    const provider = await service.update(
      serviceProviderId,
      organizationId,
      userId,
      validation.data
    );

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Service provider not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Service provider updated successfully.",
      data: provider,
    });
  } catch (error) {
    console.error("Update service provider error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update service provider.",
    });
  }
}

// =====================================================
// UPDATE SERVICE PROVIDER STATUS
// PATCH /api/v1/service-providers/:id/status
// =====================================================

export async function updateServiceProviderStatus(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);
    const serviceProviderId = getServiceProviderId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required.",
      });
    }

    if (!serviceProviderId) {
      return res.status(400).json({
        success: false,
        message: "Invalid service provider ID.",
      });
    }

    const validation = updateServiceProviderStatusSchema.safeParse(
      req.body
    );

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid service provider status.",
        errors: validation.error.flatten(),
      });
    }

    const provider = await service.updateStatus(
      serviceProviderId,
      organizationId,
      userId,
      validation.data
    );

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Service provider not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Service provider status updated successfully.",
      data: provider,
    });
  } catch (error) {
    console.error("Update service provider status error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update service provider status.",
    });
  }
}
