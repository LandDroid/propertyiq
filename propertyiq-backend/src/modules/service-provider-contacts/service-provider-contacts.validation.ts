
import { z } from "zod";

// =====================================================
// UUID VALIDATION
// =====================================================

export const providerContactIdSchema = z
  .string()
  .uuid("Invalid provider contact ID");

export const serviceProviderIdSchema = z
  .string()
  .uuid("Invalid service provider ID");

export const organizationIdSchema = z
  .string()
  .uuid("Invalid organization ID");

// =====================================================
// CREATE CONTACT
// =====================================================

export const createServiceProviderContactSchema = z.object({
  organizationId: organizationIdSchema,

  serviceProviderId: serviceProviderIdSchema,

  contactName: z
    .string()
    .trim()
    .min(1, "Contact name is required")
    .max(200),

  jobTitle: z
    .string()
    .trim()
    .max(150)
    .nullable()
    .optional(),

  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .max(255)
    .nullable()
    .optional(),

  phone: z
    .string()
    .trim()
    .max(50)
    .nullable()
    .optional(),

  isPrimary: z.boolean().optional().default(false),

  notes: z
    .string()
    .max(10000)
    .nullable()
    .optional(),
});

export type CreateServiceProviderContactInput = z.infer<
  typeof createServiceProviderContactSchema
>;

// =====================================================
// UPDATE CONTACT
// =====================================================

export const updateServiceProviderContactSchema = z.object({
  contactName: z
    .string()
    .trim()
    .min(1, "Contact name is required")
    .max(200),

  jobTitle: z
    .string()
    .trim()
    .max(150)
    .nullable(),

  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .max(255)
    .nullable(),

  phone: z
    .string()
    .trim()
    .max(50)
    .nullable(),

  isPrimary: z.boolean(),

  notes: z
    .string()
    .max(10000)
    .nullable(),
});

export type UpdateServiceProviderContactInput = z.infer<
  typeof updateServiceProviderContactSchema
>;

// =====================================================
// UPDATE CONTACT STATUS
// =====================================================

export const updateServiceProviderContactStatusSchema = z.object({
  isActive: z.boolean(),
});

export type UpdateServiceProviderContactStatusInput = z.infer<
  typeof updateServiceProviderContactStatusSchema
>;
