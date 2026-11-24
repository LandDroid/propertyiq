
import type { Request, Response } from "express";
import { z } from "zod";

import * as deviceService from "./devices.service";

import {
  createDeviceSchema,
  updateDeviceSchema,
} from "./devices.validation";

const uuidSchema = z.string().uuid();

function validUuid(value: unknown): value is string {
  return typeof value === "string" && uuidSchema.safeParse(value).success;
}

function getVerifiedOrganizationId(req: Request): string | null {
  return req.organizationContext?.organizationId ?? null;
}

function handleError(res: Response, error: unknown) {
  const databaseError = error as {
    number?: number;
    message?: string;
  };

  if (
    databaseError.number === 2601 ||
    databaseError.number === 2627
  ) {
    return res.status(409).json({
      success: false,
      message: "That serial number is already registered.",
    });
  }

  if (databaseError.number === 547) {
    return res.status(409).json({
      success: false,
      message:
        "This device is linked to another record, or one of its related records does not exist.",
    });
  }

  console.error("Devices API error:", error);

  return res.status(500).json({
    success: false,
    message:
      "An unexpected error occurred while processing the device request.",
  });
}

// =====================================================
// GET ALL DEVICES
// =====================================================

export async function getAll(req: Request, res: Response) {
  const organizationId = getVerifiedOrganizationId(req);
  const membershipId = req.organizationContext?.membershipId;
  const role = req.organizationContext?.role;

  if (!organizationId || !membershipId || !role) {
    return res.status(403).json({
      success: false,
      message: "Organization access could not be verified.",
    });
  }

  try {
    const devices = await deviceService.getAll({
      organizationId,
      membershipId,
      role,
    });

    return res.status(200).json({
      success: true,
      data: devices,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// =====================================================
// GET DEVICE BY ID
// =====================================================

export async function getById(req: Request, res: Response) {
  const deviceId = req.params.id;
  const organizationId = getVerifiedOrganizationId(req);
  const membershipId = req.organizationContext?.membershipId;
  const role = req.organizationContext?.role;

  if (!validUuid(deviceId)) {
    return res.status(400).json({
      success: false,
      message: "A valid device ID is required.",
    });
  }

  if (!organizationId || !membershipId || !role) {
    return res.status(403).json({
      success: false,
      message: "Organization access could not be verified.",
    });
  }

  try {
    const device = await deviceService.getById(deviceId, {
      organizationId,
      membershipId,
      role,
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: "Device not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: device,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// =====================================================
// CREATE DEVICE
// OWNER AND ADMINISTRATOR ONLY
// =====================================================

export async function create(req: Request, res: Response) {
  const organizationId = getVerifiedOrganizationId(req);

  if (!organizationId) {
    return res.status(403).json({
      success: false,
      message: "Organization access could not be verified.",
    });
  }

  const validation = createDeviceSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Device validation failed.",
      errors: validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  if (
    validation.data.organizationId.toLowerCase() !==
    organizationId.toLowerCase()
  ) {
    return res.status(403).json({
      success: false,
      message: "The requested organization does not match your membership.",
    });
  }

  try {
    const device = await deviceService.create(
      validation.data,
      organizationId
    );

    if (!device) {
      return res.status(400).json({
        success: false,
        message:
          "The selected property was not found in this organization.",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Device created successfully.",
      data: device,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// =====================================================
// UPDATE DEVICE
// OWNER AND ADMINISTRATOR ONLY
// =====================================================

export async function update(req: Request, res: Response) {
  const deviceId = req.params.id;
  const organizationId = getVerifiedOrganizationId(req);

  if (!validUuid(deviceId)) {
    return res.status(400).json({
      success: false,
      message: "A valid device ID is required.",
    });
  }

  if (!organizationId) {
    return res.status(403).json({
      success: false,
      message: "Organization access could not be verified.",
    });
  }

  const validation = updateDeviceSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Device validation failed.",
      errors: validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  try {
    const device = await deviceService.update(
      deviceId,
      organizationId,
      validation.data
    );

    if (!device) {
      return res.status(404).json({
        success: false,
        message:
          "Device or selected property was not found in this organization.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Device updated successfully.",
      data: device,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// =====================================================
// DELETE DEVICE
// OWNER AND ADMINISTRATOR ONLY
// =====================================================

export async function remove(req: Request, res: Response) {
  const deviceId = req.params.id;
  const organizationId = getVerifiedOrganizationId(req);

  if (!validUuid(deviceId)) {
    return res.status(400).json({
      success: false,
      message: "A valid device ID is required.",
    });
  }

  if (!organizationId) {
    return res.status(403).json({
      success: false,
      message: "Organization access could not be verified.",
    });
  }

  try {
    const device = await deviceService.remove(
      deviceId,
      organizationId
    );

    if (!device) {
      return res.status(404).json({
        success: false,
        message: "Device not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Device deleted successfully.",
      data: device,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
