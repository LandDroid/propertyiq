
import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware";
import {
  requireOrganizationMembership,
} from "../../middleware/organization.middleware";

import {
  listMaintenanceTasks,
  getMaintenanceTask,
  addMaintenanceTask,
  editMaintenanceTask,
  removeMaintenanceTask,
} from "./maintenance-tasks.controller";

const router = Router();

router.use(requireAuth);
router.use(requireOrganizationMembership);

router.get("/", listMaintenanceTasks);
router.get("/:id", getMaintenanceTask);
router.post("/", addMaintenanceTask);
router.patch("/:id", editMaintenanceTask);
router.delete("/:id", removeMaintenanceTask);

export default router;
