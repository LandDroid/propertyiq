
import { NotificationPolicyResolverRepository } from "./notification-policy-resolver.repository";

import {
  resolveNotificationPolicySchema,
} from "./notification-policy-resolver.validation";

import type {
  ResolveNotificationPolicyInput,
} from "./notification-policy-resolver.validation";

const notificationPolicyResolverRepository =
  new NotificationPolicyResolverRepository();

export async function resolveNotificationPolicy(
  input: ResolveNotificationPolicyInput
) {
  const validatedInput =
    resolveNotificationPolicySchema.parse(input);

  return notificationPolicyResolverRepository.resolve(
    validatedInput
  );
}
