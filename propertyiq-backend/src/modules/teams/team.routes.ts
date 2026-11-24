import { Router } from "express";

import {
  requireAuth,
  optionalAuth,
} from "../../middleware/auth.middleware";

import {
  requireOrganizationMembership,
  requireOrganizationRole,
} from "../../middleware/organization.middleware";

import {
  getTeamMembersController,
  getMemberPropertiesController,
  createInvitationController,
  getInvitationsController,
  getInvitationPreviewController,
  acceptInvitationController,
  revokeInvitationController,
  updateMemberRoleController,
  updateMemberProfileController,
  updateMemberPropertyAccessController,
  removeTeamMemberController,
} from "./team.controller";

const router = Router();

// Public invitation routes.
router.get(
  "/invitations/:token",
  getInvitationPreviewController
);

router.post(
  "/invitations/accept",
  optionalAuth,
  acceptInvitationController
);

// All remaining routes require an authenticated organization member.
router.use(requireAuth);
router.use(requireOrganizationMembership);

// Team members.
router.get("/members", getTeamMembersController);

router.get(
  "/members/:membershipId/properties",
  getMemberPropertiesController
);

// Invitations.
router.post(
  "/invitations",
  requireOrganizationRole("Owner", "Administrator"),
  createInvitationController
);

router.get(
  "/invitations",
  requireOrganizationRole("Owner", "Administrator"),
  getInvitationsController
);

router.post(
  "/invitations/:invitationId/revoke",
  requireOrganizationRole("Owner", "Administrator"),
  revokeInvitationController
);

// Member management.
router.patch(
  "/members/:membershipId/role",
  requireOrganizationRole("Owner", "Administrator"),
  updateMemberRoleController
);

router.patch(
  "/members/:membershipId/profile",
  requireOrganizationRole("Owner", "Administrator"),
  updateMemberProfileController
);

router.put(
  "/members/:membershipId/properties",
  requireOrganizationRole("Owner", "Administrator"),
  updateMemberPropertyAccessController
);

router.delete(
  "/members/:membershipId",
  requireOrganizationRole("Owner", "Administrator"),
  removeTeamMemberController
);

export default router;