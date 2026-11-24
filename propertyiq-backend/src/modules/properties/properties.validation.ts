
import { z } from "zod";

const propertyFields = {
  propertyName: z.string().trim().min(1).max(200),
  propertyType: z.enum([
    "cottage",
    "residential",
    "rental",
    "commercial",
    "industrial",
    "other"
  ]),
  address: z.string().trim().max(300).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  province: z.string().trim().max(100).nullable().optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  country: z.string().trim().min(1).max(100).default("Canada"),
  timeZone: z.string().trim().min(1).max(100).default("America/Toronto"),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  status: z.string().trim().min(1).max(50).default("Active")
};

export const createPropertySchema = z.object({
  organizationId: z.string().uuid(),
  ...propertyFields
});

export const updatePropertySchema = z.object(propertyFields);

export const propertyIdSchema = z.string().uuid();

export const organizationIdSchema = z.string().uuid();

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
