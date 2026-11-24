
import { z } from "zod";

// =====================================================
// UUID VALIDATION
// =====================================================

export const contractIdSchema = z
  .string()
  .uuid("Invalid contract ID.");

export const serviceProviderIdSchema = z
  .string()
  .uuid("Invalid service provider ID.");

export const organizationIdSchema = z
  .string()
  .uuid("Invalid organization ID.");

export const propertyIdSchema = z
  .string()
  .uuid("Invalid property ID.");

export const propertyServiceIdSchema = z
  .string()
  .uuid("Invalid property service ID.");

// =====================================================
// CONTRACT STATUS
// =====================================================

export const contractStatusSchema = z.enum([
  "draft",
  "active",
  "expired",
  "terminated",
]);

// =====================================================
// SHARED FIELD VALIDATION
// =====================================================

const contractNameSchema = z
  .string()
  .trim()
  .min(1, "Contract name is required.")
  .max(200, "Contract name cannot exceed 200 characters.");

const contractNumberSchema = z
  .string()
  .trim()
  .max(150, "Contract number cannot exceed 150 characters.")
  .nullable()
  .optional();

const descriptionSchema = z
  .string()
  .trim()
  .max(2000, "Description cannot exceed 2000 characters.")
  .nullable()
  .optional();

const contractValueSchema = z
  .number()
  .finite()
  .nonnegative("Contract value cannot be negative.")
  .max(9999999999999999.99, "Contract value is too large.")
  .nullable()
  .optional();

const currencyCodeSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z]{3}$/,
    "Currency code must contain exactly three letters."
  )
  .transform((value) => value.toUpperCase())
  .nullable()
  .optional();

const dateSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}$/,
    "Date must use YYYY-MM-DD format."
  )
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);

    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Invalid calendar date.");

const nullableDateSchema = dateSchema.nullable().optional();

const autoRenewSchema = z.boolean().default(false);

const noticePeriodDaysSchema = z
  .number()
  .int()
  .nonnegative("Notice period cannot be negative.")
  .max(3650, "Notice period cannot exceed 3650 days.")
  .nullable()
  .optional();

const notesSchema = z
  .string()
  .max(10000, "Notes cannot exceed 10000 characters.")
  .nullable()
  .optional();

// =====================================================
// DATE RELATIONSHIP VALIDATION
// =====================================================

function validateContractDates(data: {
  startDate: string;
  endDate?: string | null;
  renewalDate?: string | null;
}) {
  if (data.endDate && data.endDate < data.startDate) {
    return false;
  }

  if (data.renewalDate && data.renewalDate < data.startDate) {
    return false;
  }

  if (data.endDate && data.renewalDate) {
    if (data.renewalDate > data.endDate) {
      return false;
    }
  }

  return true;
}

function addContractDateIssues(
  data: {
    startDate: string;
    endDate?: string | null;
    renewalDate?: string | null;
  },
  ctx: z.RefinementCtx
) {
  if (data.endDate && data.endDate < data.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "End date cannot be before the start date.",
    });
  }

  if (data.renewalDate && data.renewalDate < data.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["renewalDate"],
      message: "Renewal date cannot be before the start date.",
    });
  }

  if (
    data.endDate &&
    data.renewalDate &&
    data.renewalDate > data.endDate
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["renewalDate"],
      message: "Renewal date cannot be after the contract end date.",
    });
  }
}

// =====================================================
// CREATE CONTRACT
// =====================================================

export const createServiceProviderContractSchema = z
  .object({
    organizationId: organizationIdSchema,

    serviceProviderId: serviceProviderIdSchema,

    propertyId: propertyIdSchema.nullable().optional(),

    propertyServiceId: propertyServiceIdSchema.nullable().optional(),

    contractName: contractNameSchema,

    contractNumber: contractNumberSchema,

    description: descriptionSchema,

    contractValue: contractValueSchema,

    currencyCode: currencyCodeSchema,

    startDate: dateSchema,

    endDate: nullableDateSchema,

    renewalDate: nullableDateSchema,

    autoRenew: autoRenewSchema,

    noticePeriodDays: noticePeriodDaysSchema,

    status: contractStatusSchema.optional().default("draft"),

    notes: notesSchema,
  })
  .superRefine(addContractDateIssues);

// =====================================================
// UPDATE CONTRACT
//
// Full replacement of editable contract details.
// Provider and organization ownership cannot change.
// =====================================================

export const updateServiceProviderContractSchema = z
  .object({
    propertyId: propertyIdSchema.nullable(),

    propertyServiceId: propertyServiceIdSchema.nullable(),

    contractName: contractNameSchema,

    contractNumber: contractNumberSchema,

    description: descriptionSchema,

    contractValue: contractValueSchema,

    currencyCode: currencyCodeSchema,

    startDate: dateSchema,

    endDate: nullableDateSchema,

    renewalDate: nullableDateSchema,

    autoRenew: z.boolean(),

    noticePeriodDays: noticePeriodDaysSchema,

    notes: notesSchema,
  })
  .superRefine(addContractDateIssues);

// =====================================================
// UPDATE CONTRACT STATUS
// =====================================================

export const updateServiceProviderContractStatusSchema = z.object({
  status: contractStatusSchema,
});

// =====================================================
// EXPORTED TYPES
// =====================================================

export type CreateServiceProviderContractInput = z.infer<
  typeof createServiceProviderContractSchema
>;

export type UpdateServiceProviderContractInput = z.infer<
  typeof updateServiceProviderContractSchema
>;

export type UpdateServiceProviderContractStatusInput = z.infer<
  typeof updateServiceProviderContractStatusSchema
>;
