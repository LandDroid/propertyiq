
import { z } from "zod";

// =====================================================
// RECIPIENT RESOLUTION INPUT
// =====================================================

export const resolveNotificationRecipientsSchema = z
  .object({
    organizationId: z.string().uuid(),
    alertId: z.string().uuid(),
  })
  .strict();

// =====================================================
// RESOLVED RECIPIENT
// =====================================================

export const notificationRecipientSchema = z
  .object({
    userId: z.string().uuid(),
    email: z.string().email(),
    firstName: z.string(),
    lastName: z.string().nullable(),
  })
  .strict();

// =====================================================
// TYPES
// =====================================================

export type ResolveNotificationRecipientsInput =
  z.infer<typeof resolveNotificationRecipientsSchema>;

export type NotificationRecipient =
  z.infer<typeof notificationRecipientSchema>;
