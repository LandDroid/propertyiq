import type { Request, Response, NextFunction } from "express";

import {
  listTeamMembers,
  listMemberProperties,
  inviteTeamMember,
  listTeamInvitations,
  getInvitationPreview,
  acceptInvitation,
  revokeInvitation,
  changeMemberRole,
  editMemberProfile,
  updateMemberPropertyAccess,
  deleteTeamMember,
} from "./team.service";

import type { TeamAccessContext } from "./team.repository";

import {
  createTeamInvitationSchema,
  acceptTeamInvitationSchema,
  updateMemberRoleSchema,
  updateMemberProfileSchema,
  replaceMemberPropertyAccessSchema,
  teamMemberParamsSchema,
  teamInvitationParamsSchema,
} from "./team.validation";

// =====================================================
// VERIFIED TEAM CONTEXT
// =====================================================

function getTeamContext(req: Request): TeamAccessContext {
  const organization = req.organizationContext;
  const user = req.user;

  if (!organization || !user) {
    throw new Error("Verified organization access is required.");
  }

  return {
    organizationId: organization.organizationId,
    membershipId: organization.membershipId,
    role: organization.role,
    userId: user.userId,
  };
}

// =====================================================
// ERROR HANDLING
// =====================================================

function handleControllerError(
  error: unknown,
  res: Response,
  next: NextFunction
) {
  if (error instanceof Error) {
    const message = error.message;
    const normalized = message.toLowerCase();

    // Authentication required.
    if (normalized.includes("must sign in before accepting")) {
      res.status(401).json({
        success: false,
        message,
      });
      return;
    }

    // Permission and authorization failures.
    const forbiddenErrors = [
      "permission",
      "unauthorized",
      "cannot",
      "you cannot",
      "cannot manage",
      "not authorized",
      "not have permission",
      "only administrators",
      "only owners",
      "administrators can only",
      "must sign in with the account",
      "sign out before creating a new account",
    ];

    if (
      forbiddenErrors.some((phrase) =>
        normalized.includes(phrase)
      )
    ) {
      res.status(403).json({
        success: false,
        message,
      });
      return;
    }

    // Invalid requests and business-rule violations.
    const clientErrors = [
      "already",
      "invalid",
      "required",
      "inactive",
      "expired",
      "revoked",
      "not found",
      "could not",
      "unable to",
      "duplicate",
      "only invite",
      "only remove",
      "only change",
      "only assign",
      "one or more properties",
      "owner memberships cannot",
      "you cannot remove your own",
      "you cannot change",
      "invitation is invalid",
      "invitation could not",
      "profile could not",
    ];

    if (
      clientErrors.some((phrase) =>
        normalized.includes(phrase)
      )
    ) {
      res.status(400).json({
        success: false,
        message,
      });
      return;
    }
  }

  next(error);
}

// =====================================================
// LIST TEAM MEMBERS
// GET /teams/members
// =====================================================

export async function getTeamMembersController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const result = await listTeamMembers(getTeamContext(req));

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

// =====================================================
// GET MEMBER PROPERTY ASSIGNMENTS
// GET /teams/members/:membershipId/properties
// =====================================================

export async function getMemberPropertiesController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const params = teamMemberParamsSchema.safeParse(req.params);

    if (!params.success) {
      res.status(400).json({
        success: false,
        message: "Invalid membership ID.",
        errors: params.error.flatten(),
      });
      return;
    }

    const result = await listMemberProperties(
      getTeamContext(req),
      params.data.membershipId
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

// =====================================================
// CREATE INVITATION
// POST /teams/invitations
// =====================================================

export async function createInvitationController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = createTeamInvitationSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid invitation details.",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const result = await inviteTeamMember(
      getTeamContext(req),
      parsed.data
    );

    res.status(201).json({
      success: true,
      message: "Team invitation created successfully.",
      data: result,
    });
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

// =====================================================
// LIST INVITATIONS
// GET /teams/invitations
// =====================================================

export async function getInvitationsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const result = await listTeamInvitations(getTeamContext(req));

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

// =====================================================
// INVITATION PREVIEW
// GET /teams/invitations/:token
// =====================================================

export async function getInvitationPreviewController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const token = req.params.token;

    if (
      typeof token !== "string" ||
      token.trim().length === 0 ||
      token.length > 512
    ) {
      res.status(400).json({
        success: false,
        message: "A valid invitation token is required.",
      });
      return;
    }

    const result = await getInvitationPreview(token);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

// =====================================================
// ACCEPT INVITATION
// POST /teams/invitations/accept
// =====================================================

export async function acceptInvitationController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = acceptTeamInvitationSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid invitation acceptance details.",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const result = await acceptInvitation(
      parsed.data,
      req.user?.userId
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

// =====================================================
// REVOKE INVITATION
// POST /teams/invitations/:invitationId/revoke
// =====================================================

export async function revokeInvitationController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const params = teamInvitationParamsSchema.safeParse(req.params);

    if (!params.success) {
      res.status(400).json({
        success: false,
        message: "Invalid invitation ID.",
      });
      return;
    }

    const result = await revokeInvitation(
      getTeamContext(req),
      params.data.invitationId
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

// =====================================================
// UPDATE MEMBER ROLE
// PATCH /teams/members/:membershipId/role
// =====================================================

export async function updateMemberRoleController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const params = teamMemberParamsSchema.safeParse(req.params);
    const body = updateMemberRoleSchema.safeParse(req.body);

    if (!params.success || !body.success) {
      res.status(400).json({
        success: false,
        message: "Invalid member role update details.",
        errors: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten(),
        },
      });
      return;
    }

    const result = await changeMemberRole(
      getTeamContext(req),
      params.data.membershipId,
      body.data
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

// =====================================================
// UPDATE MEMBER PROFILE
// PATCH /teams/members/:membershipId/profile
// =====================================================

export async function updateMemberProfileController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const params = teamMemberParamsSchema.safeParse(req.params);
    const body = updateMemberProfileSchema.safeParse(req.body);

    if (!params.success || !body.success) {
      res.status(400).json({
        success: false,
        message: "Invalid member profile update details.",
        errors: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten(),
        },
      });
      return;
    }

    const result = await editMemberProfile(
      getTeamContext(req),
      params.data.membershipId,
      body.data
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

// =====================================================
// REPLACE MEMBER PROPERTY ACCESS
// PUT /teams/members/:membershipId/properties
// =====================================================

export async function updateMemberPropertyAccessController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const params = teamMemberParamsSchema.safeParse(req.params);
    const body = replaceMemberPropertyAccessSchema.safeParse(req.body);

    if (!params.success || !body.success) {
      res.status(400).json({
        success: false,
        message: "Invalid property assignment details.",
        errors: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten(),
        },
      });
      return;
    }

    const result = await updateMemberPropertyAccess(
      getTeamContext(req),
      params.data.membershipId,
      body.data
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

// =====================================================
// REMOVE TEAM MEMBER
// DELETE /teams/members/:membershipId
// =====================================================

export async function removeTeamMemberController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const params = teamMemberParamsSchema.safeParse(req.params);

    if (!params.success) {
      res.status(400).json({
        success: false,
        message: "Invalid membership ID.",
      });
      return;
    }

    const result = await deleteTeamMember(
      getTeamContext(req),
      params.data.membershipId
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleControllerError(error, res, next);
  }
}