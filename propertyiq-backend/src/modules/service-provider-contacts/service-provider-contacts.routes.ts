
import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware";
import { requireOrganizationMembership } from "../../middleware/organization.middleware";

import {
  getServiceProviderContacts,
  getServiceProviderContactById,
  createServiceProviderContact,
  updateServiceProviderContact,
  updateServiceProviderContactStatus,
} from "./service-provider-contacts.controller";

const router = Router();

// =====================================================
// AUTHENTICATION AND ORGANIZATION ACCESS
// =====================================================

router.use(requireAuth);
router.use(requireOrganizationMembership);

// =====================================================
// READ CONTACTS
// Owner / Administrator / Member / Viewer
// =====================================================

router.get(
  "/provider/:serviceProviderId",
  getServiceProviderContacts
);

router.get(
  "/:id",
  getServiceProviderContactById
);

// =====================================================
// WRITE CONTACTS
// Owner / Administrator only
// Repository also enforces these permissions.
// =====================================================

router.post(
  "/provider/:serviceProviderId",
  createServiceProviderContact
);

router.put(
  "/:id",
  updateServiceProviderContact
);

router.patch(
  "/:id/status",
  updateServiceProviderContactStatus
);

export default router;
