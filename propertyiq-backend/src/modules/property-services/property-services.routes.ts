
import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware";
import {
  requireOrganizationMembership,
  requireOrganizationRole,
} from "../../middleware/organization.middleware";

import {
  getPropertyServices,
  getPropertyServiceById,
  createPropertyService,
  updatePropertyService,
  updatePropertyServiceStatus,
} from "./property-services.controller";

const router = Router();

// All routes require authentication and organization membership.
router.use(requireAuth);
router.use(requireOrganizationMembership);

// =====================================================
// GET PROPERTY SERVICES
// Owner / Administrator / Member / Viewer
// =====================================================

router.get("/", getPropertyServices);

router.get("/:id", getPropertyServiceById);

// =====================================================
// CREATE PROPERTY SERVICE
// Owner / Administrator only
// =====================================================

router.post(
  "/",
  requireOrganizationRole("Owner", "Administrator"),
  createPropertyService
);

// =====================================================
// UPDATE PROPERTY SERVICE
// Owner / Administrator only
// =====================================================

router.put(
  "/:id",
  requireOrganizationRole("Owner", "Administrator"),
  updatePropertyService
);

// =====================================================
// UPDATE PROPERTY SERVICE STATUS
// Owner / Administrator only
// =====================================================

router.patch(
  "/:id/status",
  requireOrganizationRole("Owner", "Administrator"),
  updatePropertyServiceStatus
);

export default router;
