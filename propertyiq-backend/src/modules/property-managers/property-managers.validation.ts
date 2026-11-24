
import { z } from "zod";

// =====================================================
// UUID VALIDATION
// =====================================================

export const propertyManagerIdSchema = z.string().uuid();

export const organizationIdSchema = z.string().uuid();

// =====================================================
// CREATE PROPERTY MANAGER ASSIGNMENT
// =====================================================

export const createPropertyManagerSchema = z.object({
  organizationId: z.string().uuid(),
  propertyId: z.string().uuid(),
  membershipId: z.string().uuid(),
});

export type CreatePropertyManagerInput = z.infer<
  typeof createPropertyManagerSchema
>;
