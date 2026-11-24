
import type { Request, Response } from "express";

import { NotificationDeliveriesService } from "./notification-deliveries.service";

const notificationDeliveriesService =
  new NotificationDeliveriesService();

// =====================================================
// ACCESS CONTEXT
// =====================================================

function getAccessContext(req: Request) {
  const organizationContext = req.organizationContext;
  const userId = req.user?.userId;

  if (!organizationContext?.organizationId || !userId) {
    return null;
  }

  return {
    organizationId: organizationContext.organizationId,
    userId,
  };
}

// =====================================================
// GET CURRENT USER'S NOTIFICATION HISTORY
// GET /api/v1/notifications/deliveries
// =====================================================

export async function getNotificationDeliveriesController(
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

    const deliveries =
      await notificationDeliveriesService.getDeliveries(
        context.organizationId,
        context.userId
      );

    return res.status(200).json({
      data: deliveries,
    });
  } catch (error) {
    console.error("Get notification deliveries error:", error);

    return res.status(500).json({
      message: "Failed to retrieve notification deliveries.",
    });
  }
}

// =====================================================
// GET CURRENT USER'S NOTIFICATION DELIVERY
// GET /api/v1/notifications/deliveries/:id
// =====================================================

export async function getNotificationDeliveryController(
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

    const notificationDeliveryId = String(req.params.id);

    const delivery =
      await notificationDeliveriesService.getDelivery(
        notificationDeliveryId,
        context.organizationId,
        context.userId
      );

    if (!delivery) {
      return res.status(404).json({
        message: "Notification delivery not found.",
      });
    }

    return res.status(200).json({
      data: delivery,
    });
  } catch (error) {
    console.error("Get notification delivery error:", error);

    return res.status(500).json({
      message: "Failed to retrieve notification delivery.",
    });
  }
}
