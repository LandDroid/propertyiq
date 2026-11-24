
import { NotificationPreferencesRepository } from "./notification-preferences.repository";

import type {
  UpdateNotificationPreferencesInput,
} from "./notification-preferences.validation";

export class NotificationPreferencesService {
  private readonly repository =
    new NotificationPreferencesRepository();

  // =====================================================
  // GET USER NOTIFICATION PREFERENCES
  // =====================================================

  async getPreferences(
    organizationId: string,
    userId: string
  ) {
    return this.repository.getOrCreate(
      organizationId,
      userId
    );
  }

  // =====================================================
  // UPDATE USER NOTIFICATION PREFERENCES
  // =====================================================

  async updatePreferences(
    organizationId: string,
    userId: string,
    data: UpdateNotificationPreferencesInput
  ) {
    return this.repository.update(
      organizationId,
      userId,
      data
    );
  }
}
