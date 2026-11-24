
import { Router } from "express";

import {
  getAlertAssignmentsController,
  getAlertAssignmentController,
  createAlertAssignmentController,
  unassignAlertController,
} from "./alert-assignments.controller";

import {
  requireOrganizationMembership,
  requireOrganizationRole,
} from "../../middleware/organization.middleware";

const router = Router();

// All assignment requests require verified organization membership.
router.use(requireOrganizationMembership);

// All organization members can view assignments,
// subject to property-level access.
router.get(
  "/alert/:alertId",
  getAlertAssignmentsController
);

router.get(
  "/:id",
  getAlertAssignmentController
);

// Only Owners and Administrators can assign or unassign alerts.
const requireAssignmentManagement =
  requireOrganizationRole("Owner", "Administrator");

router.post(
  "/",
  requireAssignmentManagement,
  createAlertAssignmentController
);

router.patch(
  "/:id/unassign",
  requireAssignmentManagement,
  unassignAlertController
);

export default router;
