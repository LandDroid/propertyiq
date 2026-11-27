import { z } from "zod";

// =====================================================
// IDS
// =====================================================

export const sensorIdSchema = z.uuid();

export const telemetryIdSchema = z.coerce.number().int().positive();

// =====================================================
// CREATE TELEMETRY
// =====================================================

export const createTelemetrySchema = z.object({
  sensorId: z.uuid(),

  numericValue: z
    .number()
    .finite()
    .optional(),

  textValue: z
    .string()
    .trim()
    .max(500)
    .optional(),

  unit: z
    .string()
    .trim()
    .max(50)
    .optional(),
});

// =====================================================
// QUERY LIMIT
// =====================================================

export const telemetryHistoryLimitSchema =
  z.coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(100);

// =====================================================
// TYPES
// =====================================================

export type CreateTelemetryInput =
  z.infer<typeof createTelemetrySchema>;