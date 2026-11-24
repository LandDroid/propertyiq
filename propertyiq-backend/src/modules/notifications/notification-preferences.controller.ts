
import { Request, Response } from "express";

import { NotificationPreferencesService } from "./notification-preferences.service";

import {
  updateNotificationPreferencesSchema,
} from "./notification-preferences.validation";

const service = new NotificationPreferencesService();

// =====================================================
// VERIFIED ORGANIZATION CONTEXT
// =====================================================

function getAccessContext(req: Request) {
  const context = req.organizationContext;
  const userId = req.user?.userId;

  if (!context || !userId) {
    return null;
  }

  return {
    organizationId: context.organizationId,
    userId,
  };
}

// =====================================================
// GET NOTIFICATION PREFERENCES
// =====================================================

export async function getNotificationPreferencesController(
  req: Request,
  res: Response
) {
  try {
    const context = getAccessContext(req);

    if (!context) {
      return res.status(401).json({
        message: "Authentication and organization context are required.",
      });
    }

    const preferences = await service.getPreferences(
      context.organizationId,
      context.userId
    );

    if (!preferences) {
      return res.status(403).json({
        message: "You do not have access to these notification preferences.",
      });
    }

    return res.status(200).json({
      data: preferences,
    });
  } catch (error) {
    console.error("Get notification preferences error:", error);

    return res.status(500).json({
      message: "Failed to retrieve notification preferences.",
    });
  }
}

// =====================================================
// UPDATE NOTIFICATION PREFERENCES
// =====================================================

export async function updateNotificationPreferencesController(
  req: Request,
  res: Response
) {
  try {
    const context = getAccessContext(req);

    if (!context) {
      return res.status(401).json({
        message: "Authentication and organization context are required.",
      });
    }

    const parsed = updateNotificationPreferencesSchema.safeParse(
      req.body
    );

    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid notification preferences.",
        errors: parsed.error.flatten(),
      });
    }

    const preferences = await service.updatePreferences(
      context.organizationId,
      context.userId,
      parsed.data
    );

    if (!preferences) {
      return res.status(403).json({
        message: "You do not have permission to update these notification preferences.",
      });
    }

    return res.status(200).json({
      message: "Notification preferences updated successfully.",
      data: preferences,
    });
  } catch (error) {
    console.error("Update notification preferences error:", error);

    return res.status(500).json({
      message: "Failed to update notification preferences.",
    });
  }
}
