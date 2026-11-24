
import { NotificationRecipientResolverRepository } from "./notification-recipient-resolver.repository";

import {
  resolveNotificationRecipientsSchema,
} from "./notification-recipient-resolver.validation";

import type {
  ResolveNotificationRecipientsInput,
} from "./notification-recipient-resolver.validation";

const notificationRecipientResolverRepository =
  new NotificationRecipientResolverRepository();

// =====================================================
// RESOLVE NOTIFICATION RECIPIENTS
// =====================================================

export async function resolveNotificationRecipients(
  input: ResolveNotificationRecipientsInput
) {
  const validatedInput =
    resolveNotificationRecipientsSchema.parse(input);

  return notificationRecipientResolverRepository.resolve(
    validatedInput
  );
}
