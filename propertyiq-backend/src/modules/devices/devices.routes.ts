
import { Router } from "express";
import * as controller from "./devices.controller";

import {
  requireOrganizationMembership,
  requireOrganizationRole,
} from "../../middleware/organization.middleware";

const router = Router();

// Every device request requires an active organization membership.
router.use(requireOrganizationMembership);

// Read access: Owner, Administrator, Member and Viewer.
router.get("/", controller.getAll);
router.get("/:id", controller.getById);

// Write access: Owner and Administrator only.
const requireDeviceManagementAccess =
  requireOrganizationRole("Owner", "Administrator");

router.post("/", requireDeviceManagementAccess, controller.create);
router.put("/:id", requireDeviceManagementAccess, controller.update);
router.delete("/:id", requireDeviceManagementAccess, controller.remove);

export default router;
