
import { NotificationOutboxRepository } from "./notification-outbox.repository";

import type {
  CreateNotificationOutboxEventInput,
  ClaimNotificationOutboxEventsInput,
  CompleteNotificationOutboxEventInput,
  FailNotificationOutboxEventInput,
} from "./notification-outbox.validation";

const notificationOutboxRepository =
  new NotificationOutboxRepository();

export function createNotificationEvent(
  organizationId: string,
  data: CreateNotificationOutboxEventInput
) {
  return notificationOutboxRepository.create(
    organizationId,
    data
  );
}

export function claimNotificationEvents(
  data: ClaimNotificationOutboxEventsInput,
  lockTimeoutMinutes?: number
) {
  return notificationOutboxRepository.claim(
    data,
    lockTimeoutMinutes
  );
}

export function renewNotificationEventLock(
  eventId: string,
  workerId: string,
  lockTimeoutMinutes?: number
) {
  return notificationOutboxRepository.renewLock(
    eventId,
    workerId,
    lockTimeoutMinutes
  );
}

export function completeNotificationEvent(
  data: CompleteNotificationOutboxEventInput
) {
  return notificationOutboxRepository.complete(data);
}

export function failNotificationEvent(
  data: FailNotificationOutboxEventInput
) {
  return notificationOutboxRepository.fail(data);
}
