
import type { Request, Response } from "express";
import { ZodError } from "zod";

import * as service from "./assets.service";

import {
  createAssetSchema,
  updateAssetSchema,
} from "./assets.validation";

function getVerifiedOrganizationId(req: Request): string | null {
  return req.organizationContext?.organizationId ?? null;
}

function isValidGuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function handleError(res: Response, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Please check the submitted information.",
      errors: error.issues,
    });
  }

  const sqlError = error as { number?: number };

  if (sqlError?.number === 547) {
    return res.status(409).json({
      success: false,
      message:
        "This asset is linked to another record or references an invalid property or device.",
    });
  }

  console.error("Assets API error:", error);

  return res.status(500).json({
    success: false,
    message: "An unexpected error occurred while processing the asset.",
  });
}

// =====================================================
// GET ALL ASSETS
// =====================================================

export async function getAssets(req: Request, res: Response) {
  try {
    const organizationId = getVerifiedOrganizationId(req);
    const membershipId = req.organizationContext?.membershipId;
    const role = req.organizationContext?.role;

    if (!organizationId || !membershipId || !role) {
      return res.status(403).json({
        success: false,
        message: "Verified organization access is required.",
      });
    }

    const assets = await service.getAllAssets({
      organizationId,
      membershipId,
      role,
    });

    return res.json({
      success: true,
      data: assets,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// =====================================================
// GET ONE ASSET
// =====================================================

export async function getAsset(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const organizationId = getVerifiedOrganizationId(req);
    const membershipId = req.organizationContext?.membershipId;
    const role = req.organizationContext?.role;

    if (!isValidGuid(id)) {
      return res.status(400).json({
        success: false,
        message: "A valid asset ID is required.",
      });
    }

    if (!organizationId || !membershipId || !role) {
      return res.status(403).json({
        success: false,
        message: "Verified organization access is required.",
      });
    }

    const asset = await service.getAssetById(id, {
      organizationId,
      membershipId,
      role,
    });

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: "Asset not found.",
      });
    }

    return res.json({
      success: true,
      data: asset,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// =====================================================
// CREATE ASSET
// =====================================================

export async function createAsset(req: Request, res: Response) {
  try {
    const organizationId = getVerifiedOrganizationId(req);

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        message: "Verified organization access is required.",
      });
    }

    const data = createAssetSchema.parse(req.body);

    // Never trust the organization ID submitted by the frontend.
    const asset = await service.createAsset(data, organizationId);

    if (!asset) {
      return res.status(400).json({
        success: false,
        message:
          "The selected property or device could not be found for this organization.",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Asset created successfully.",
      data: asset,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// =====================================================
// UPDATE ASSET
// =====================================================

export async function updateAsset(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const organizationId = getVerifiedOrganizationId(req);

    if (!isValidGuid(id) || !organizationId) {
      return res.status(400).json({
        success: false,
        message: "A valid asset ID and verified organization are required.",
      });
    }

    const data = updateAssetSchema.parse(req.body);

    const asset = await service.updateAsset(id, organizationId, data);

    if (!asset) {
      return res.status(404).json({
        success: false,
        message:
          "Asset not found or the selected property/device is invalid.",
      });
    }

    return res.json({
      success: true,
      message: "Asset updated successfully.",
      data: asset,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// =====================================================
// DELETE ASSET
// =====================================================

export async function deleteAsset(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const organizationId = getVerifiedOrganizationId(req);

    if (!isValidGuid(id) || !organizationId) {
      return res.status(400).json({
        success: false,
        message: "A valid asset ID and verified organization are required.",
      });
    }

    const deleted = await service.deleteAsset(id, organizationId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Asset not found.",
      });
    }

    return res.json({
      success: true,
      message: "Asset deleted successfully.",
    });
  } catch (error) {
    return handleError(res, error);
  }
}
