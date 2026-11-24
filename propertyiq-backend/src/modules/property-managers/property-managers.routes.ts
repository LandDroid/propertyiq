import { Router } from "express";

import { PropertyManagersController } from "./property-managers.controller";

import {
  requireOrganizationMembership,
  requireOrganizationRole,
} from "../../middleware/organization.middleware";

import { requireAuth } from "../../middleware/auth.middleware";

const router = Router();
const controller = new PropertyManagersController();

// =====================================================
// AUTHENTICATION
// =====================================================

router.use(requireAuth);

// =====================================================
// GET PROPERTY MANAGER ASSIGNMENTS
// =====================================================

router.get(
  "/",
  requireOrganizationMembership,
  controller.getAll
);

// =====================================================
// GET PROPERTY MANAGER ASSIGNMENT BY ID
// =====================================================

router.get(
  "/:id",
  requireOrganizationMembership,
  controller.getById
);

// =====================================================
// CREATE PROPERTY MANAGER ASSIGNMENT
// Owner / Administrator only
// =====================================================

router.post(
  "/",
  requireOrganizationMembership,
  requireOrganizationRole("Owner", "Administrator"),
  controller.create
);

// =====================================================
// END PROPERTY MANAGER ASSIGNMENT
// Owner / Administrator only
// =====================================================

router.patch(
  "/:id/end",
  requireOrganizationMembership,
  requireOrganizationRole("Owner", "Administrator"),
  controller.end
);

export default router;