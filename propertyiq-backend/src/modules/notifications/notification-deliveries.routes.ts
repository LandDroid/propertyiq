
import { Router } from "express";

import { requireOrganizationMembership } from "../../middleware/organization.middleware";

import {
  getNotificationDeliveriesController,
  getNotificationDeliveryController,
} from "./notification-deliveries.controller";

const router = Router();

// All delivery history routes require organization membership.
router.use(requireOrganizationMembership);

// GET /api/v1/notifications/deliveries
router.get("/", getNotificationDeliveriesController);

// GET /api/v1/notifications/deliveries/:id
router.get("/:id", getNotificationDeliveryController);

export default router;
