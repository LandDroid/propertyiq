
import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware";
import { requireOrganizationMembership } from "../../middleware/organization.middleware";

import {
  getServiceProviderContracts,
  getServiceProviderContractById,
  createServiceProviderContract,
  updateServiceProviderContract,
  updateServiceProviderContractStatus,
} from "./service-provider-contracts.controller";

const router = Router();

// =====================================================
// AUTHORIZATION
// =====================================================

router.use(requireAuth);
router.use(requireOrganizationMembership);

// =====================================================
// SERVICE PROVIDER CONTRACT ROUTES
// =====================================================

// Get all contracts for a provider
router.get(
  "/provider/:serviceProviderId",
  getServiceProviderContracts
);

// Get contract by ID
router.get(
  "/:id",
  getServiceProviderContractById
);

// Create contract for provider
router.post(
  "/provider/:serviceProviderId",
  createServiceProviderContract
);

// Update contract
router.put(
  "/:id",
  updateServiceProviderContract
);

// Update contract status
router.patch(
  "/:id/status",
  updateServiceProviderContractStatus
);

export default router;
