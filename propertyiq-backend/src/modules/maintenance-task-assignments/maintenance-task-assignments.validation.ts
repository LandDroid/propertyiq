
import { z } from "zod";

export const taskAssignmentIdSchema = z.string().uuid();

export const maintenanceTaskIdSchema = z.string().uuid();

export const organizationIdSchema = z.string().uuid();

export const taskAssignmentStatusSchema = z.enum([
  "assigned",
  "accepted",
  "in_progress",
  "completed",
  "cancelled",
]);

export const createTaskAssignmentSchema = z
  .object({
    organizationId: organizationIdSchema,

    maintenanceTaskId: maintenanceTaskIdSchema,

    membershipId: z.string().uuid().nullable().optional(),

    serviceProviderId: z.string().uuid().nullable().optional(),

    notes: z.string().max(1000).nullable().optional(),
  })
  .refine(
    (data) =>
      (data.membershipId != null && data.serviceProviderId == null) ||
      (data.membershipId == null && data.serviceProviderId != null),
    {
      message:
        "Exactly one assignee is required: either membershipId or serviceProviderId.",
      path: ["membershipId"],
    }
  );

export const updateTaskAssignmentStatusSchema = z.object({
  status: taskAssignmentStatusSchema,

  notes: z.string().max(1000).nullable().optional(),
});

export type CreateTaskAssignmentInput = z.infer<
  typeof createTaskAssignmentSchema
>;

export type UpdateTaskAssignmentStatusInput = z.infer<
  typeof updateTaskAssignmentStatusSchema
>;
