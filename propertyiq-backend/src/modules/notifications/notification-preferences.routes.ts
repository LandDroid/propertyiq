
import { Router } from "express";

import {
  getNotificationPreferencesController,
  updateNotificationPreferencesController,
} from "./notification-preferences.controller";

import { requireOrganizationMembership } from "../../middleware/organization.middleware";

const router = Router();

// All routes require active organization membership.
router.use(requireOrganizationMembership);

// GET /api/v1/notifications/preferences
router.get(
  "/",
  getNotificationPreferencesController
);

// PATCH /api/v1/notifications/preferences
router.patch(
  "/",
  updateNotificationPreferencesController
);

export default router;
