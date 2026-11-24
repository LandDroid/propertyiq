
import { Router } from "express";

import {
  getAlerts,
  getAlert,
  createAlertController,
  acknowledgeAlertController,
  resolveAlertController,
} from "./alerts.controller";

import {
  requireOrganizationMembership,
  requireOrganizationRole,
} from "../../middleware/organization.middleware";

const router = Router();

// Every alert request must belong to an authenticated organization member.
router.use(requireOrganizationMembership);

// All organization members can view alerts,
// subject to their property-level access.
router.get("/", getAlerts);
router.get("/:id", getAlert);

// Owners, Administrators, and Members can create,
// acknowledge, or resolve alerts.
// Viewers have read-only access.
const requireAlertActionAccess =
  requireOrganizationRole("Owner", "Administrator", "Member");

router.post(
  "/",
  requireAlertActionAccess,
  createAlertController
);

router.patch(
  "/:id/acknowledge",
  requireAlertActionAccess,
  acknowledgeAlertController
);

router.patch(
  "/:id/resolve",
  requireAlertActionAccess,
  resolveAlertController
);

export default router;
