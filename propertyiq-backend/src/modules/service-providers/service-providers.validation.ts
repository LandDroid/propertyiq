
import { z } from "zod";

// =====================================================
// IDENTIFIERS
// =====================================================

export const serviceProviderIdSchema = z.string().uuid();

export const organizationIdSchema = z.string().uuid();

// =====================================================
// STATUS
// =====================================================

export const serviceProviderStatusSchema = z.enum([
  "active",
  "inactive",
]);

// =====================================================
// CREATE SERVICE PROVIDER
// =====================================================

export const createServiceProviderSchema = z.object({
  organizationId: z.string().uuid(),

  companyName: z.string().trim().min(1).max(200),

  contactName: z.string().trim().max(200).nullable().optional(),

  email: z.string().trim().email().max(255).nullable().optional(),

  phone: z.string().trim().max(50).nullable().optional(),

  website: z.string().trim().max(500).nullable().optional(),

  address: z.string().trim().max(255).nullable().optional(),

  city: z.string().trim().max(100).nullable().optional(),

  province: z.string().trim().max(100).nullable().optional(),

  postalCode: z.string().trim().max(30).nullable().optional(),

  country: z.string().trim().max(100).nullable().optional(),

  notes: z.string().nullable().optional(),
});

// =====================================================
// UPDATE SERVICE PROVIDER
// =====================================================

export const updateServiceProviderSchema = z.object({
  companyName: z.string().trim().min(1).max(200),

  contactName: z.string().trim().max(200).nullable(),

  email: z.string().trim().email().max(255).nullable(),

  phone: z.string().trim().max(50).nullable(),

  website: z.string().trim().max(500).nullable(),

  address: z.string().trim().max(255).nullable(),

  city: z.string().trim().max(100).nullable(),

  province: z.string().trim().max(100).nullable(),

  postalCode: z.string().trim().max(30).nullable(),

  country: z.string().trim().max(100).nullable(),

  notes: z.string().nullable(),
});

// =====================================================
// UPDATE SERVICE PROVIDER STATUS
// =====================================================

export const updateServiceProviderStatusSchema = z.object({
  status: serviceProviderStatusSchema,
});

// =====================================================
// TYPES
// =====================================================

export type CreateServiceProviderInput = z.infer<
  typeof createServiceProviderSchema
>;

export type UpdateServiceProviderInput = z.infer<
  typeof updateServiceProviderSchema
>;

export type UpdateServiceProviderStatusInput = z.infer<
  typeof updateServiceProviderStatusSchema
>;
