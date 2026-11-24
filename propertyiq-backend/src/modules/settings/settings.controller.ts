
import type { Request, Response } from "express";
import { SettingsService } from "./settings.service";

const service = new SettingsService();

// =====================================================
// GET ACCOUNT SETTINGS
// =====================================================

export async function getSettings(
  req: Request,
  res: Response
) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const settings = await service.getSettings(userId);

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: "User account could not be found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("Get settings error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load account settings.",
    });
  }
}

// =====================================================
// UPDATE ORGANIZATION NAME
// =====================================================

export async function updateOrganizationName(
  req: Request,
  res: Response
) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const { organizationId, organizationName } = req.body ?? {};

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (
      typeof organizationId !== "string" ||
      !uuidRegex.test(organizationId)
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid organization ID is required.",
      });
    }

    if (typeof organizationName !== "string") {
      return res.status(400).json({
        success: false,
        message: "Organization name is required.",
      });
    }

    const normalizedName = organizationName.trim();

    if (!normalizedName) {
      return res.status(400).json({
        success: false,
        message: "Organization name cannot be empty.",
      });
    }

    if (normalizedName.length > 150) {
      return res.status(400).json({
        success: false,
        message: "Organization name cannot exceed 150 characters.",
      });
    }

    const updated = await service.updateOrganizationName(
      userId,
      organizationId,
      normalizedName
    );

    if (!updated) {
      return res.status(403).json({
        success: false,
        message:
          "Organization could not be updated. Verify your membership and permissions.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Organization name updated successfully.",
      data: updated,
    });
  } catch (error) {
    console.error("Update organization name error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update organization name.",
    });
  }
}
