
import { z } from "zod";

// =====================================================
// UUID VALIDATION
// =====================================================

export const notificationOutboxEventIdSchema = z
  .string()
  .uuid("Invalid notification event ID.");

export const notificationOutboxOrganizationIdSchema = z
  .string()
  .uuid("Invalid organization ID.");

export const notificationOutboxAggregateIdSchema = z
  .string()
  .uuid("Invalid aggregate ID.");

// =====================================================
// EVENT CREATION
// =====================================================

export const createNotificationOutboxEventSchema = z
  .object({
    eventType: z
      .string()
      .trim()
      .min(1, "Event type is required.")
      .max(100),

    aggregateType: z
      .string()
      .trim()
      .min(1, "Aggregate type is required.")
      .max(50),

    aggregateId: notificationOutboxAggregateIdSchema,

    idempotencyKey: z
      .string()
      .trim()
      .min(1, "Idempotency key is required.")
      .max(255),

    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

// =====================================================
// EVENT PROCESSING
// =====================================================

export const claimNotificationOutboxEventsSchema = z
  .object({
    workerId: z
      .string()
      .trim()
      .min(1, "Worker ID is required.")
      .max(100),

    batchSize: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(10),
  })
  .strict();

// =====================================================
// EVENT COMPLETION
// =====================================================

export const completeNotificationOutboxEventSchema = z
  .object({
    eventId: notificationOutboxEventIdSchema,
    workerId: z
      .string()
      .trim()
      .min(1)
      .max(100),
  })
  .strict();

// =====================================================
// EVENT FAILURE
// =====================================================

export const failNotificationOutboxEventSchema = z
  .object({
    eventId: notificationOutboxEventIdSchema,

    workerId: z
      .string()
      .trim()
      .min(1)
      .max(100),

    errorMessage: z
      .string()
      .trim()
      .min(1)
      .max(2000),

    retryDelaySeconds: z
      .number()
      .int()
      .min(1)
      .max(86400)
      .default(60),
  })
  .strict();

// =====================================================
// TYPES
// =====================================================

export type CreateNotificationOutboxEventInput = z.infer<
  typeof createNotificationOutboxEventSchema
>;

export type ClaimNotificationOutboxEventsInput = z.infer<
  typeof claimNotificationOutboxEventsSchema
>;

export type CompleteNotificationOutboxEventInput = z.infer<
  typeof completeNotificationOutboxEventSchema
>;

export type FailNotificationOutboxEventInput = z.infer<
  typeof failNotificationOutboxEventSchema
>;
