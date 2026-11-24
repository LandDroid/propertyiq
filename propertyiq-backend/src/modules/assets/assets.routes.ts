
import { Router } from "express";

import {
  getAssets,
  getAsset,
  createAsset,
  updateAsset,
  deleteAsset,
} from "./assets.controller";

import {
  requireOrganizationMembership,
  requireOrganizationRole,
} from "../../middleware/organization.middleware";

const router = Router();

// Every endpoint requires verified organization membership.
router.use(requireOrganizationMembership);

// All organization members can view assets.
// Property-level access is enforced by the repository.
router.get("/", getAssets);
router.get("/:id", getAsset);

// Only Owners and Administrators can manage assets.
const requireAssetManagementAccess =
  requireOrganizationRole("Owner", "Administrator");

router.post("/", requireAssetManagementAccess, createAsset);
router.put("/:id", requireAssetManagementAccess, updateAsset);
router.delete("/:id", requireAssetManagementAccess, deleteAsset);

export default router;
