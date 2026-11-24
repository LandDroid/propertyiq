
import { Router } from "express";
import {
  getWarranties,
  getWarranty,
  createWarranty,
  updateWarranty,
  deleteWarranty,
} from "./warranties.controller";

import {
  requireOrganizationMembership,
  requireOrganizationRole,
} from "../../middleware/organization.middleware";

const router = Router();

router.use(requireOrganizationMembership);

router.get("/", getWarranties);
router.get("/:id", getWarranty);

const requireWarrantyManagementAccess =
  requireOrganizationRole("Owner", "Administrator");

router.post("/", requireWarrantyManagementAccess, createWarranty);
router.put("/:id", requireWarrantyManagementAccess, updateWarranty);
router.delete("/:id", requireWarrantyManagementAccess, deleteWarranty);

export default router;
