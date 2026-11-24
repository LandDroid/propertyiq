import crypto from "crypto";
import argon2 from "argon2";

import {
  getTeamMembers,
  getMemberProperties,
  createTeamInvitation,
  getTeamInvitations,
  findInvitationByTokenHash,
  acceptTeamInvitation,
  revokeTeamInvitation,
  updateMemberRole,
  updateMemberProfile,
  replaceMemberPropertyAccess,
  removeTeamMember,
} from "./team.repository";

import { findUserByEmail } from "../auth/auth.repository";

import type { TeamAccessContext } from "./team.repository";

import type {
  CreateTeamInvitationInput,
  AcceptTeamInvitationRequest,
  UpdateMemberRoleInput,
  UpdateMemberProfileInput,
  ReplaceMemberPropertyAccessInput,
} from "./team.validation";

// =====================================================
// CONSTANTS
// =====================================================

const INVITATION_EXPIRY_DAYS = 7;

// =====================================================
// TOKEN HELPERS
// =====================================================

function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashInvitationToken(token: string): string {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

// =====================================================
// TEAM MEMBERS
// =====================================================

export async function listTeamMembers(
  context: TeamAccessContext
) {
  return getTeamMembers(context);
}

export async function listMemberProperties(
  context: TeamAccessContext,
  membershipId: string
) {
  return getMemberProperties(context, membershipId);
}

// =====================================================
// CREATE INVITATION
// =====================================================

export async function inviteTeamMember(
  context: TeamAccessContext,
  input: CreateTeamInvitationInput
) {
  const existingUser = await findUserByEmail(input.email);

  if (existingUser) {
    const members = await getTeamMembers(context);

    const alreadyMember = members.some(
      (member: { email: string }) =>
        member.email?.toLowerCase() === input.email.toLowerCase()
    );

    if (alreadyMember) {
      throw new Error(
        "This user is already a member of the organization."
      );
    }
  }

  const token = generateInvitationToken();
  const tokenHash = hashInvitationToken(token);

  const expiresAt = new Date(
    Date.now() +
      INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  );

  const invitation = await createTeamInvitation(context, {
    email: input.email,
    role: input.role,
    tokenHash,
    expiresAt,
  });

  return {
    invitation,
    invitationToken: token,
  };
}

// =====================================================
// LIST INVITATIONS
// =====================================================

export async function listTeamInvitations(
  context: TeamAccessContext
) {
  return getTeamInvitations(context);
}

// =====================================================
// INVITATION PREVIEW
// =====================================================

export async function getInvitationPreview(token: string) {
  const tokenHash = hashInvitationToken(token);

  const invitation = await findInvitationByTokenHash(
    tokenHash
  );

  if (!invitation) {
    throw new Error(
      "Invitation is invalid, expired, or revoked."
    );
  }

  return {
    invitationId: invitation.invitationId,
    organizationName: invitation.organizationName,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
  };
}

// =====================================================
// ACCEPT INVITATION
//
// Existing users must authenticate as the account
// matching the invitation email.
//
// New users must be unauthenticated and provide
// registration details.
// =====================================================

export async function acceptInvitation(
  input: AcceptTeamInvitationRequest,
  authenticatedUserId?: string
) {
  const tokenHash = hashInvitationToken(input.token);

  const invitation = await findInvitationByTokenHash(
    tokenHash
  );

  if (!invitation) {
    throw new Error(
      "Invitation is invalid, expired, or revoked."
    );
  }

  const existingUser = await findUserByEmail(
    invitation.email
  );

  let passwordHash: string | undefined;

  if (existingUser) {
    if (!authenticatedUserId) {
      throw new Error(
        "You must sign in before accepting this invitation."
      );
    }

    if (existingUser.userId !== authenticatedUserId) {
      throw new Error(
        "You must sign in with the account this invitation was sent to."
      );
    }

    if (existingUser.status !== "active") {
      throw new Error("This user account is inactive.");
    }
  } else {
    if (authenticatedUserId) {
      throw new Error(
        "Sign out before creating a new account with this invitation."
      );
    }

    if (!input.firstName) {
      throw new Error(
        "First name is required to create a new account."
      );
    }

    if (!input.password) {
      throw new Error(
        "Password is required to create a new account."
      );
    }

    passwordHash = await argon2.hash(input.password);
  }

  const accepted = await acceptTeamInvitation({
    tokenHash,
    firstName: existingUser
      ? undefined
      : input.firstName,
    lastName: existingUser
      ? undefined
      : input.lastName,
    passwordHash,
  });

  return {
    message: "Invitation accepted successfully.",
    userId: accepted.userId,
    membershipId: accepted.membershipId,
    organizationId: accepted.organizationId,
    organizationName: invitation.organizationName,
    email: accepted.email,
    role: accepted.role,
  };
}

// =====================================================
// REVOKE INVITATION
// =====================================================

export async function revokeInvitation(
  context: TeamAccessContext,
  invitationId: string
) {
  const revoked = await revokeTeamInvitation(
    context,
    invitationId
  );

  if (!revoked) {
    throw new Error(
      "Invitation could not be revoked. It may not exist, may already be accepted, or you may not have permission."
    );
  }

  return {
    message: "Invitation revoked successfully.",
  };
}

// =====================================================
// UPDATE MEMBER ROLE
// =====================================================

export async function changeMemberRole(
  context: TeamAccessContext,
  membershipId: string,
  input: UpdateMemberRoleInput
) {
  const updated = await updateMemberRole(
    context,
    membershipId,
    input.role
  );

  if (!updated) {
    throw new Error(
      "Team member role could not be updated. Check the member and your permissions."
    );
  }

  return {
    message: "Team member role updated successfully.",
  };
}

// =====================================================
// UPDATE MEMBER PROFILE
// =====================================================

export async function editMemberProfile(
  context: TeamAccessContext,
  membershipId: string,
  input: UpdateMemberProfileInput
) {
  const updated = await updateMemberProfile(
    context,
    membershipId,
    {
      firstName: input.firstName,
      lastName: input.lastName,
    }
  );

  if (!updated) {
    throw new Error(
      "Team member profile could not be updated."
    );
  }

  return {
    message: "Team member profile updated successfully.",
  };
}

// =====================================================
// REPLACE MEMBER PROPERTY ACCESS
// =====================================================

export async function updateMemberPropertyAccess(
  context: TeamAccessContext,
  membershipId: string,
  input: ReplaceMemberPropertyAccessInput
) {
  return replaceMemberPropertyAccess(
    context,
    membershipId,
    input.propertyIds
  );
}

// =====================================================
// REMOVE TEAM MEMBER
// =====================================================

export async function deleteTeamMember(
  context: TeamAccessContext,
  membershipId: string
) {
  const removed = await removeTeamMember(
    context,
    membershipId
  );

  if (!removed) {
    throw new Error(
      "Team member could not be removed."
    );
  }

  return {
    message: "Team member removed successfully.",
  };
}