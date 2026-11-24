
import { z } from "zod";

// =====================================================
// UUID VALIDATION
// =====================================================

export const notificationDeliveryIdSchema = z
  .string()
  .uuid("Invalid notification delivery ID.");

export const notificationAlertIdSchema = z
  .string()
  .uuid("Invalid alert ID.");

export const notificationDeliveryUserIdSchema = z
  .string()
  .uuid("Invalid user ID.");

export const notificationDeliveryOrganizationIdSchema = z
  .string()
  .uuid("Invalid organization ID.");

// =====================================================
// NOTIFICATION CHANNELS
// =====================================================

export const notificationChannelSchema = z.enum([
  "email",
  "sms",
  "push",
]);

// =====================================================
// NOTIFICATION DELIVERY STATUSES
// =====================================================

export const notificationDeliveryStatusSchema = z.enum([
  "queued",
  "sent",
  "delivered",
  "failed",
]);

// =====================================================
// CREATE NOTIFICATION DELIVERY
// =====================================================

export const createNotificationDeliverySchema = z
  .object({
    userId: notificationDeliveryUserIdSchema,

    alertId: notificationAlertIdSchema
      .nullable()
      .optional(),

    channel: notificationChannelSchema,

    recipient: z
      .string()
      .trim()
      .min(1, "Recipient is required.")
      .max(255),

    subject: z
      .string()
      .trim()
      .max(255)
      .nullable()
      .optional(),

    message: z
      .string()
      .max(2000)
      .nullable()
      .optional(),

    // Optional for backward compatibility.
    // Notification dispatch will provide a stable key.
    idempotencyKey: z
      .string()
      .trim()
      .min(1, "Idempotency key cannot be empty.")
      .max(255)
      .nullable()
      .optional(),
  })
  .strict();

// =====================================================
// UPDATE DELIVERY STATUS
// =====================================================

export const updateNotificationDeliveryStatusSchema = z
  .object({
    status: notificationDeliveryStatusSchema,

    providerMessageId: z
      .string()
      .trim()
      .max(255)
      .nullable()
      .optional(),

    errorMessage: z
      .string()
      .max(1000)
      .nullable()
      .optional(),
  })
  .strict();

// =====================================================
// TYPES
// =====================================================

export type NotificationChannel = z.infer<
  typeof notificationChannelSchema
>;

export type NotificationDeliveryStatus = z.infer<
  typeof notificationDeliveryStatusSchema
>;

export type CreateNotificationDeliveryInput = z.infer<
  typeof createNotificationDeliverySchema
>;

export type UpdateNotificationDeliveryStatusInput = z.infer<
  typeof updateNotificationDeliveryStatusSchema
>;
