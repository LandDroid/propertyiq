

import { z } from "zod";

const deviceFields = {
  propertyId: z.string().uuid("A valid property is required."),
  zoneId: z.string().uuid().nullable().optional(),
  gatewayId: z.string().uuid().nullable().optional(),

  deviceName: z
    .string()
    .trim()
    .min(1, "Device name is required.")
    .max(150),

  serialNumber: z
    .string()
    .trim()
    .min(1, "Serial number is required.")
    .max(150),

  manufacturer: z.string().trim().max(100).nullable().optional(),
  model: z.string().trim().max(100).nullable().optional(),

  deviceType: z
    .string()
    .trim()
    .min(1, "Device type is required.")
    .max(50),

  firmwareVersion: z.string().trim().max(100).nullable().optional(),

  status: z
    .enum(["online", "offline", "maintenance", "pending"])
    .default("offline"),

  installedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Installation date must use YYYY-MM-DD format.")
    .nullable()
    .optional(),
};

export const createDeviceSchema = z.object({
  organizationId: z.string().uuid("A valid organization is required."),
  ...deviceFields,
});

export const updateDeviceSchema = z.object({
  ...deviceFields,
});

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
