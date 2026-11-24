
import { Router } from "express";

import {
  listMaintenance,
  getMaintenance,
  addMaintenance,
  editMaintenance,
  markMaintenanceComplete,
  removeMaintenance,
} from "./maintenance.controller";

import {
  requireOrganizationMembership,
  requireOrganizationRole,
} from "../../middleware/organization.middleware";

const router = Router();

// All endpoints require verified organization membership.
router.use(requireOrganizationMembership);

// All organization members can read maintenance.
router.get("/", listMaintenance);
router.get("/:id", getMaintenance);

// Owners, Administrators and Members can create, edit and complete.
const requireMaintenanceWriteAccess =
  requireOrganizationRole("Owner", "Administrator", "Member");

// Only Owners and Administrators can delete.
const requireMaintenanceDeleteAccess =
  requireOrganizationRole("Owner", "Administrator");

router.post("/", requireMaintenanceWriteAccess, addMaintenance);

router.put("/:id", requireMaintenanceWriteAccess, editMaintenance);

router.patch(
  "/:id/complete",
  requireMaintenanceWriteAccess,
  markMaintenanceComplete
);

router.delete("/:id", requireMaintenanceDeleteAccess, removeMaintenance);

export default router;
