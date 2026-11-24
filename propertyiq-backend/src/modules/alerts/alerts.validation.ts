
import { z } from "zod";

// =====================================================
// CREATE ALERT
// =====================================================

export const createAlertSchema = z.object({
  propertyId: z.string().uuid(),

  deviceId: z.string().uuid().nullable().optional(),

  sensorId: z.string().uuid().nullable().optional(),

  alertRuleId: z.string().uuid().nullable().optional(),

  title: z.string().trim().min(1).max(200),

  message: z.string().trim().max(1000).nullable().optional(),

  severity: z
    .enum(["critical", "warning", "info"])
    .default("warning"),

  idempotencyKey: z.string().trim().min(1).max(255),
}).strict();

// =====================================================
// ALERT STATUS
// =====================================================

export const updateAlertStatusSchema = z.object({
  status: z.enum(["open", "acknowledged", "resolved"]),
}).strict();

// =====================================================
// TYPES
// =====================================================

export type CreateAlertInput = z.infer<typeof createAlertSchema>;

export type UpdateAlertStatusInput = z.infer<
  typeof updateAlertStatusSchema
>;
