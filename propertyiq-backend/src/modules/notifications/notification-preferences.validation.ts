import { z } from "zod";

// =====================================================
// UUID VALIDATION
// =====================================================

export const notificationPreferenceIdSchema = z
  .string()
  .uuid("Invalid notification preference ID.");

export const notificationUserIdSchema = z
  .string()
  .uuid("Invalid user ID.");

export const notificationOrganizationIdSchema = z
  .string()
  .uuid("Invalid organization ID.");

// =====================================================
// NOTIFICATION PREFERENCES
// =====================================================

export const updateNotificationPreferencesSchema = z
  .object({
    emailEnabled: z.boolean().optional(),

    smsEnabled: z.boolean().optional(),

    pushEnabled: z.boolean().optional(),

    criticalAlertsOnly: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message: "At least one notification preference must be provided.",
    }
  );

// =====================================================
// TYPES
// =====================================================

export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;