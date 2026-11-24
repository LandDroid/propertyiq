
import { z } from "zod";

export const maintenanceTaskIdSchema = z.string().uuid();

export const maintenanceTaskPrioritySchema = z.enum([
  "low",
  "normal",
  "high",
  "urgent",
]);

export const maintenanceTaskStatusSchema = z.enum([
  "open",
  "in_progress",
  "completed",
  "cancelled",
]);

export const createMaintenanceTaskSchema = z.object({
  propertyId: z.string().uuid(),

  deviceId: z.string().uuid().nullable().optional(),

  assignedToUserId: z.string().uuid().nullable().optional(),

  title: z.string().trim().min(1).max(200),

  description: z.string().max(2000).nullable().optional(),

  priority: maintenanceTaskPrioritySchema.optional(),

  status: maintenanceTaskStatusSchema.optional(),

  scheduledDate: z.string().datetime().nullable().optional(),
});

export const updateMaintenanceTaskSchema = z.object({
  propertyId: z.string().uuid().optional(),

  deviceId: z.string().uuid().nullable().optional(),

  assignedToUserId: z.string().uuid().nullable().optional(),

  title: z.string().trim().min(1).max(200).optional(),

  description: z.string().max(2000).nullable().optional(),

  priority: maintenanceTaskPrioritySchema.optional(),

  status: maintenanceTaskStatusSchema.optional(),

  scheduledDate: z.string().datetime().nullable().optional(),
});

export type CreateMaintenanceTaskInput = z.infer<
  typeof createMaintenanceTaskSchema
>;

export type UpdateMaintenanceTaskInput = z.infer<
  typeof updateMaintenanceTaskSchema
>;
