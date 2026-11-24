
import { z } from "zod";

const optionalText = (max: number) =>
  z.string().max(max).nullable().optional();

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD")
  .nullable()
  .optional();

export const createAssetSchema = z.object({
  organizationId: z.string().uuid(),
  propertyId: z.string().uuid(),
  deviceId: z.string().uuid().nullable().optional(),

  assetName: z.string().min(1).max(150),
  category: z.string().min(1).max(75),

  manufacturer: optionalText(100),
  model: optionalText(100),
  serialNumber: optionalText(150),

  purchaseDate: optionalDate,
  installedAt: optionalDate,

  expectedLifespanYears: z.number().int().positive().nullable().optional(),

  status: z.enum(["active", "inactive", "retired"]).default("active"),
  notes: z.string().nullable().optional(),
});

export const updateAssetSchema = createAssetSchema
  .omit({ organizationId: true })
  .partial();

export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
