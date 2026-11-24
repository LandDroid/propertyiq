import { z } from "zod";

// =====================================================
// COMMON SCHEMAS
// =====================================================

export const teamMembershipIdSchema = z.string().uuid();

export const teamInvitationIdSchema = z.string().uuid();

export const teamRoleSchema = z.enum([
  "Administrator",
  "Member",
  "Viewer",
]);

// =====================================================
// CREATE TEAM INVITATION
// =====================================================

export const createTeamInvitationSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(255)
    .transform((value) => value.toLowerCase()),

  role: teamRoleSchema,
});

// =====================================================
// ACCEPT TEAM INVITATION
// =====================================================

export const acceptTeamInvitationSchema = z.object({
  token: z.string().trim().min(1).max(512),

  firstName: z.string().trim().min(1).max(100).optional(),

  lastName: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional(),

  password: z.string().min(8).max(128).optional(),
});

// =====================================================
// UPDATE MEMBER ROLE
// =====================================================

export const updateMemberRoleSchema = z.object({
  role: teamRoleSchema,
});

// =====================================================
// UPDATE MEMBER PROFILE
// =====================================================

export const updateMemberProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(100),

  lastName: z
    .string()
    .trim()
    .max(100)
    .nullable(),
});

// =====================================================
// REPLACE MEMBER PROPERTY ACCESS
// =====================================================

export const replaceMemberPropertyAccessSchema = z.object({
  propertyIds: z
    .array(z.string().uuid())
    .max(500)
    .refine(
      (propertyIds) =>
        new Set(propertyIds).size === propertyIds.length,
      {
        message: "Duplicate property IDs are not allowed.",
      }
    ),
});

// =====================================================
// ROUTE PARAMETER SCHEMAS
// =====================================================

export const teamMemberParamsSchema = z.object({
  membershipId: teamMembershipIdSchema,
});

export const teamInvitationParamsSchema = z.object({
  invitationId: teamInvitationIdSchema,
});

// =====================================================
// TYPES
// =====================================================

export type CreateTeamInvitationInput = z.infer<
  typeof createTeamInvitationSchema
>;

export type AcceptTeamInvitationRequest = z.infer<
  typeof acceptTeamInvitationSchema
>;

export type UpdateMemberRoleInput = z.infer<
  typeof updateMemberRoleSchema
>;

export type UpdateMemberProfileInput = z.infer<
  typeof updateMemberProfileSchema
>;

export type ReplaceMemberPropertyAccessInput = z.infer<
  typeof replaceMemberPropertyAccessSchema
>;