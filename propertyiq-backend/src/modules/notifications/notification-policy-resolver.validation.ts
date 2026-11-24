
import { z } from "zod";

export const notificationSeveritySchema = z.enum([
  "critical",
  "warning",
  "info",
]);

export const resolveNotificationPolicySchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  severity: notificationSeveritySchema,
}).strict();

export const notificationChannelSchema = z.enum([
  "email",
  "sms",
  "push",
]);

export const notificationPolicyResultSchema = z.object({
  userId: z.string().uuid(),
  eligible: z.boolean(),
  channels: z.array(notificationChannelSchema),
  criticalAlertsOnly: z.boolean(),
}).strict();

export type NotificationSeverity =
  z.infer<typeof notificationSeveritySchema>;

export type NotificationChannel =
  z.infer<typeof notificationChannelSchema>;

export type ResolveNotificationPolicyInput =
  z.infer<typeof resolveNotificationPolicySchema>;

export type NotificationPolicyResult =
  z.infer<typeof notificationPolicyResultSchema>;
