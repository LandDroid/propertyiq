import { z } from "zod";

// =====================================================
// UUID VALIDATION
// =====================================================

export const alertAssignmentIdSchema = z
  .string()
  .uuid("Invalid alert assignment ID.");

export const alertIdSchema = z
  .string()
  .uuid("Invalid alert ID.");

export const organizationIdSchema = z
  .string()
  .uuid("Invalid organization ID.");

export const membershipIdSchema = z
  .string()
  .uuid("Invalid membership ID.");

export const serviceProviderIdSchema = z
  .string()
  .uuid("Invalid service provider ID.");

// =====================================================
// ASSIGNMENT VALIDATION
// =====================================================

const assigneeFieldsSchema = z.object({
  membershipId: membershipIdSchema
    .nullable()
    .optional(),

  serviceProviderId:
    serviceProviderIdSchema
      .nullable()
      .optional(),
});

type AssigneeValidationData = {
  membershipId?:
    | string
    | null
    | undefined;

  serviceProviderId?:
    | string
    | null
    | undefined;
};

function validateExactlyOneAssignee(
  data: AssigneeValidationData
): boolean {
  const hasMembership =
    typeof data.membershipId ===
    "string";

  const hasServiceProvider =
    typeof data.serviceProviderId ===
    "string";

  return (
    hasMembership !==
    hasServiceProvider
  );
}

export const createAlertAssignmentSchema =
  assigneeFieldsSchema
    .extend({
      organizationId:
        organizationIdSchema,

      alertId:
        alertIdSchema,

      propertyId: z
        .string()
        .uuid(
          "Invalid property ID."
        ),

      notes: z
        .string()
        .trim()
        .max(
          1000,
          "Notes cannot exceed 1000 characters."
        )
        .nullable()
        .optional(),
    })
    .refine(
      validateExactlyOneAssignee,
      {
        message:
          "Exactly one assignee is required: membershipId or serviceProviderId.",
        path: [
          "membershipId",
        ],
      }
    );

// =====================================================
// UNASSIGN VALIDATION
// =====================================================

export const unassignAlertSchema =
  z.object({
    notes: z
      .string()
      .trim()
      .max(
        1000,
        "Notes cannot exceed 1000 characters."
      )
      .nullable()
      .optional(),
  });

// =====================================================
// INFERRED TYPES
// =====================================================

export type CreateAlertAssignmentInput =
  z.infer<
    typeof createAlertAssignmentSchema
  >;

export type UnassignAlertInput =
  z.infer<
    typeof unassignAlertSchema
  >;