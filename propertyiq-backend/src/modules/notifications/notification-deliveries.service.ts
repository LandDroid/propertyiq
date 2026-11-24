
import { NotificationDeliveriesRepository } from "./notification-deliveries.repository";

import type {
  CreateNotificationDeliveryInput,
  UpdateNotificationDeliveryStatusInput,
} from "./notification-deliveries.validation";

export class NotificationDeliveriesService {
  private readonly repository = new NotificationDeliveriesRepository();

  // =====================================================
  // CREATE DELIVERY
  // Trusted backend workflow only.
  // =====================================================

  async createDelivery(
    organizationId: string,
    data: CreateNotificationDeliveryInput
  ) {
    return this.repository.create(organizationId, data);
  }

  // =====================================================
  // GET USER DELIVERY HISTORY
  // =====================================================

  async getDeliveries(
    organizationId: string,
    userId: string
  ) {
    return this.repository.getAll(organizationId, userId);
  }

  // =====================================================
  // GET USER DELIVERY BY ID
  // =====================================================

  async getDelivery(
    notificationDeliveryId: string,
    organizationId: string,
    userId: string
  ) {
    return this.repository.getById(
      notificationDeliveryId,
      organizationId,
      userId
    );
  }

  // =====================================================
  // UPDATE DELIVERY STATUS
  // Trusted backend workflow only.
  // =====================================================

  async updateDeliveryStatus(
    notificationDeliveryId: string,
    organizationId: string,
    data: UpdateNotificationDeliveryStatusInput
  ) {
    return this.repository.updateStatus(
      notificationDeliveryId,
      organizationId,
      data
    );
  }
}
