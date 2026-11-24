
import { z } from "zod";

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD")
  .nullable()
  .optional();

const warrantyFields = {
  assetId: z.string().uuid(),
  warrantyName: z.string().min(1).max(150),
  warrantyProvider: z.string().max(150).nullable().optional(),
  warrantyType: z.string().min(1).max(50).default("manufacturer"),
  warrantyStartDate: optionalDate,
  warrantyEndDate: optionalDate,
  coverageDetails: z.string().nullable().optional(),
  contractNumber: z.string().max(150).nullable().optional(),
  status: z.enum(["active", "cancelled", "void"]).default("active"),
};

export const createWarrantySchema = z
  .object({
    organizationId: z.string().uuid(),
    ...warrantyFields,
  })
  .superRefine((data, ctx) => {
    if (
      data.warrantyStartDate &&
      data.warrantyEndDate &&
      data.warrantyEndDate < data.warrantyStartDate
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["warrantyEndDate"],
        message: "Warranty end date cannot be before its start date.",
      });
    }
  });

export const updateWarrantySchema = z
  .object({
    ...warrantyFields,
  })
  .partial()
  .superRefine((data, ctx) => {
    if (
      data.warrantyStartDate &&
      data.warrantyEndDate &&
      data.warrantyEndDate < data.warrantyStartDate
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["warrantyEndDate"],
        message: "Warranty end date cannot be before its start date.",
      });
    }
  });

export type CreateWarrantyInput = z.infer<typeof createWarrantySchema>;
export type UpdateWarrantyInput = z.infer<typeof updateWarrantySchema>;
