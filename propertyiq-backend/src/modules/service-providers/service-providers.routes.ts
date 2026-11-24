
import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware";

import {
  requireOrganizationMembership,
  requireOrganizationRole,
} from "../../middleware/organization.middleware";

import {
  getServiceProviders,
  getServiceProviderById,
  createServiceProvider,
  updateServiceProvider,
  updateServiceProviderStatus,
} from "./service-providers.controller";

const router = Router();

// =====================================================
// AUTHENTICATION AND ORGANIZATION MEMBERSHIP
// =====================================================

router.use(requireAuth);
router.use(requireOrganizationMembership);

// =====================================================
// READ SERVICE PROVIDERS
// Owner / Administrator / Member / Viewer
// =====================================================

router.get("/", getServiceProviders);

router.get("/:id", getServiceProviderById);

// =====================================================
// CREATE SERVICE PROVIDER
// Owner / Administrator only
// =====================================================

router.post(
  "/",
  requireOrganizationRole("Owner", "Administrator"),
  createServiceProvider
);

// =====================================================
// UPDATE SERVICE PROVIDER
// Owner / Administrator only
// =====================================================

router.put(
  "/:id",
  requireOrganizationRole("Owner", "Administrator"),
  updateServiceProvider
);

// =====================================================
// ACTIVATE / DEACTIVATE SERVICE PROVIDER
// Owner / Administrator only
// =====================================================

router.patch(
  "/:id/status",
  requireOrganizationRole("Owner", "Administrator"),
  updateServiceProviderStatus
);

export default router;
