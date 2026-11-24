
import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware";

import {
  requireOrganizationMembership,
} from "../../middleware/organization.middleware";

import {
  listTaskAssignments,
  getTaskAssignment,
  addTaskAssignment,
  editTaskAssignmentStatus,
} from "./maintenance-task-assignments.controller";

const router = Router();

router.use(requireAuth);
router.use(requireOrganizationMembership);

// Read assignment history
router.get(
  "/task/:maintenanceTaskId",
  listTaskAssignments
);

// Read individual assignment
router.get(
  "/:id",
  getTaskAssignment
);

// Create or reassign a maintenance task
router.post(
  "/",
  addTaskAssignment
);

// Update assignment status
router.patch(
  "/:id/status",
  editTaskAssignmentStatus
);

export default router;
