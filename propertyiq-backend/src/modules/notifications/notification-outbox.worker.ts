
import {
  claimNotificationEvents,
  completeNotificationEvent,
  failNotificationEvent,
  renewNotificationEventLock,
} from "./notification-outbox.service";

export interface NotificationOutboxEvent {
  eventId: string;
  organizationId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  idempotencyKey: string;
  payload: string | Record<string, unknown>;
  status: string;
  attempts: number;
  availableAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  processedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}

export type NotificationOutboxEventHandler = (
  event: NotificationOutboxEvent
) => Promise<void>;

export interface NotificationOutboxHeartbeatErrorContext {
  eventId: string;
  workerId: string;
  error: unknown;
}

export interface NotificationOutboxWorkerOptions {
  workerId: string;
  batchSize?: number;
  retryDelaySeconds?: number;
  lockTimeoutMinutes?: number;
  heartbeatIntervalSeconds?: number;
  handlers?: Record<string, NotificationOutboxEventHandler>;
  onHeartbeatError?: (
    context: NotificationOutboxHeartbeatErrorContext
  ) => void;
}

export interface NotificationOutboxBatchResult {
  claimed: number;
  processed: number;
  failed: number;
  skipped: number;
}

export class NotificationOutboxWorker {
  private readonly workerId: string;
  private readonly batchSize: number;
  private readonly retryDelaySeconds: number;
  private readonly lockTimeoutMinutes: number;
  private readonly heartbeatIntervalSeconds: number;

  private readonly handlers: Map<
    string,
    NotificationOutboxEventHandler
  >;

  private readonly onHeartbeatError?: (
    context: NotificationOutboxHeartbeatErrorContext
  ) => void;

  constructor(options: NotificationOutboxWorkerOptions) {
    if (!options.workerId.trim()) {
      throw new Error("Worker ID is required.");
    }

    this.workerId = options.workerId;
    this.batchSize = options.batchSize ?? 10;
    this.retryDelaySeconds = options.retryDelaySeconds ?? 60;
    this.lockTimeoutMinutes = options.lockTimeoutMinutes ?? 5;

    this.heartbeatIntervalSeconds =
      options.heartbeatIntervalSeconds ??
      Math.max(
        1,
        Math.floor(
          (this.lockTimeoutMinutes * 60) / 3
        )
      );

    if (
      !Number.isInteger(this.batchSize) ||
      this.batchSize < 1 ||
      this.batchSize > 100
    ) {
      throw new Error(
        "Batch size must be between 1 and 100."
      );
    }

    if (
      !Number.isInteger(this.retryDelaySeconds) ||
      this.retryDelaySeconds < 1 ||
      this.retryDelaySeconds > 86400
    ) {
      throw new Error(
        "Retry delay must be between 1 and 86400 seconds."
      );
    }

    if (
      !Number.isInteger(this.lockTimeoutMinutes) ||
      this.lockTimeoutMinutes < 1 ||
      this.lockTimeoutMinutes > 1440
    ) {
      throw new Error(
        "Lock timeout must be between 1 and 1440 minutes."
      );
    }

    if (
      !Number.isInteger(this.heartbeatIntervalSeconds) ||
      this.heartbeatIntervalSeconds < 1 ||
      this.heartbeatIntervalSeconds >=
        this.lockTimeoutMinutes * 60
    ) {
      throw new Error(
        "Heartbeat interval must be positive and shorter than the lock timeout."
      );
    }

    this.handlers = new Map(
      Object.entries(options.handlers ?? {})
    );

    this.onHeartbeatError = options.onHeartbeatError;
  }

  // =====================================================
  // REGISTER EVENT HANDLER
  // =====================================================

  registerHandler(
    eventType: string,
    handler: NotificationOutboxEventHandler
  ) {
    const normalizedEventType = eventType.trim();

    if (!normalizedEventType) {
      throw new Error("Event type is required.");
    }

    this.handlers.set(normalizedEventType, handler);
  }

  // =====================================================
  // REPORT HEARTBEAT DATABASE ERRORS
  // =====================================================

  private reportHeartbeatError(
    context: NotificationOutboxHeartbeatErrorContext
  ) {
    try {
      if (this.onHeartbeatError) {
        this.onHeartbeatError(context);
        return;
      }

      console.error(
        "[NotificationOutboxWorker] Heartbeat renewal failed.",
        {
          eventId: context.eventId,
          workerId: context.workerId,
          error: context.error,
        }
      );
    } catch (loggingError) {
      console.error(
        "[NotificationOutboxWorker] Heartbeat error logging failed.",
        {
          eventId: context.eventId,
          workerId: context.workerId,
          error: loggingError,
          originalError: context.error,
        }
      );
    }
  }

  // =====================================================
  // PROCESS EVENT WITH HEARTBEAT
  //
  // A failed renewal means ownership cannot be trusted.
  // The worker must not complete or fail the event when
  // ownership cannot be verified.
  // =====================================================

  private async processWithHeartbeat(
    event: NotificationOutboxEvent,
    handler: NotificationOutboxEventHandler
  ): Promise<"processed" | "failed" | "skipped"> {
    let ownershipLost = false;

    let heartbeatPromise: Promise<void> | null = null;

    const renewLock = async () => {
      if (heartbeatPromise || ownershipLost) {
        return;
      }

      heartbeatPromise = (async () => {
        try {
          const renewed =
            await renewNotificationEventLock(
              event.eventId,
              this.workerId,
              this.lockTimeoutMinutes
            );

          if (!renewed) {
            ownershipLost = true;
          }
        } catch (error) {
          ownershipLost = true;

          this.reportHeartbeatError({
            eventId: event.eventId,
            workerId: this.workerId,
            error,
          });
        } finally {
          heartbeatPromise = null;
        }
      })();

      await heartbeatPromise;
    };

    const heartbeat = setInterval(() => {
      void renewLock();
    }, this.heartbeatIntervalSeconds * 1000);

    // Stop future renewals and wait for any active renewal.
    const stopHeartbeat = async () => {
      clearInterval(heartbeat);

      const activeHeartbeat = heartbeatPromise;

      if (activeHeartbeat) {
        await activeHeartbeat;
      }
    };

    try {
      await handler(event);

      // Stop heartbeat before attempting completion.
      await stopHeartbeat();

      if (ownershipLost) {
        return "skipped";
      }

      const completed = await completeNotificationEvent({
        eventId: event.eventId,
        workerId: this.workerId,
      });

      if (!completed) {
        return "skipped";
      }

      return "processed";
    } catch (error) {
      await stopHeartbeat();

      // Do not modify an event when ownership cannot
      // be confirmed.
      if (ownershipLost) {
        return "skipped";
      }

      const errorMessage =
        error instanceof Error
          ? error.message
          : String(error);

      await failNotificationEvent({
        eventId: event.eventId,
        workerId: this.workerId,
        errorMessage: errorMessage.slice(0, 2000),
        retryDelaySeconds: this.retryDelaySeconds,
      });

      return "failed";
    } finally {
      await stopHeartbeat();
    }
  }

  // =====================================================
  // PROCESS INDIVIDUAL EVENT
  // =====================================================

  private async processEvent(
    event: NotificationOutboxEvent
  ): Promise<"processed" | "failed" | "skipped"> {
    const handler = this.handlers.get(event.eventType);

    if (!handler) {
      await failNotificationEvent({
        eventId: event.eventId,
        workerId: this.workerId,
        errorMessage:
          `No handler registered for event type: ${event.eventType}`,
        retryDelaySeconds: this.retryDelaySeconds,
      });

      return "failed";
    }

    return this.processWithHeartbeat(event, handler);
  }

  // =====================================================
  // PROCESS BATCH
  // =====================================================

  async processBatch(): Promise<NotificationOutboxBatchResult> {
    const events = await claimNotificationEvents(
      {
        workerId: this.workerId,
        batchSize: this.batchSize,
      },
      this.lockTimeoutMinutes
    );

    const result: NotificationOutboxBatchResult = {
      claimed: events.length,
      processed: 0,
      failed: 0,
      skipped: 0,
    };

    for (const event of events) {
      const outcome = await this.processEvent(
        event as NotificationOutboxEvent
      );

      result[outcome]++;
    }

    return result;
  }
}
