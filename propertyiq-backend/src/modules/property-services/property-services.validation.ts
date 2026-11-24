import { z } from "zod";

// =====================================================
// UUID VALIDATION
// =====================================================

export const propertyServiceIdSchema = z.string().uuid();

export const organizationIdSchema = z.string().uuid();

// =====================================================
// SERVICE STATUS
// =====================================================

export const propertyServiceStatusSchema = z.enum([
  "active",
  "inactive",
  "completed",
]);

// =====================================================
// CREATE PROPERTY SERVICE
// =====================================================

export const createPropertyServiceSchema = z
  .object({
    organizationId: z.string().uuid(),
    propertyId: z.string().uuid(),

    serviceProviderId: z.string().uuid().nullable().optional(),

    assignedMembershipId: z.string().uuid().nullable().optional(),

    serviceName: z.string().trim().min(1).max(150),

    serviceCategory: z.string().trim().min(1).max(100),

    description: z.string().max(2000).nullable().optional(),

    serviceFrequency: z.string().max(100).nullable().optional(),

    contractReference: z.string().max(100).nullable().optional(),

    contractStartDate: z.string().date().nullable().optional(),

    contractEndDate: z.string().date().nullable().optional(),

    nextServiceDate: z.string().datetime({ offset: true }).nullable().optional(),

    notes: z.string().nullable().optional(),

    status: propertyServiceStatusSchema.optional(),
  })
  .refine(
    (data) => {
      const hasProvider = Boolean(data.serviceProviderId);
      const hasMembership = Boolean(data.assignedMembershipId);

      return hasProvider !== hasMembership;
    },
    {
      message:
        "Exactly one assignee is required: a service provider or an organization membership.",
      path: ["assignedMembershipId"],
    }
  )
  .refine(
    (data) => {
      if (!data.contractStartDate || !data.contractEndDate) {
        return true;
      }

      return data.contractEndDate >= data.contractStartDate;
    },
    {
      message: "Contract end date cannot be before contract start date.",
      path: ["contractEndDate"],
    }
  );

// =====================================================
// UPDATE PROPERTY SERVICE
// Full update: both assignee fields are supplied so the
// exactly-one-assignee rule can be validated.
// =====================================================

export const updatePropertyServiceSchema = z
  .object({
    serviceProviderId: z.string().uuid().nullable(),

    assignedMembershipId: z.string().uuid().nullable(),

    serviceName: z.string().trim().min(1).max(150),

    serviceCategory: z.string().trim().min(1).max(100),

    description: z.string().max(2000).nullable(),

    serviceFrequency: z.string().max(100).nullable(),

    contractReference: z.string().max(100).nullable(),

    contractStartDate: z.string().date().nullable(),

    contractEndDate: z.string().date().nullable(),

    nextServiceDate: z.string().datetime({ offset: true }).nullable(),

    notes: z.string().nullable(),

    status: propertyServiceStatusSchema,
  })
  .refine(
    (data) => {
      const hasProvider = Boolean(data.serviceProviderId);
      const hasMembership = Boolean(data.assignedMembershipId);

      return hasProvider !== hasMembership;
    },
    {
      message:
        "Exactly one assignee is required: a service provider or an organization membership.",
      path: ["assignedMembershipId"],
    }
  )
  .refine(
    (data) => {
      if (!data.contractStartDate || !data.contractEndDate) {
        return true;
      }

      return data.contractEndDate >= data.contractStartDate;
    },
    {
      message: "Contract end date cannot be before contract start date.",
      path: ["contractEndDate"],
    }
  );

// =====================================================
// UPDATE SERVICE STATUS
// =====================================================

export const updatePropertyServiceStatusSchema = z.object({
  status: propertyServiceStatusSchema,
});

// =====================================================
// TYPES
// =====================================================

export type CreatePropertyServiceInput = z.infer<
  typeof createPropertyServiceSchema
>;

export type UpdatePropertyServiceInput = z.infer<
  typeof updatePropertyServiceSchema
>;

export type UpdatePropertyServiceStatusInput = z.infer<
  typeof updatePropertyServiceStatusSchema
>;