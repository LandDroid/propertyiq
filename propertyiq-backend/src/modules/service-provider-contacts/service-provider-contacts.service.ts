
import { ServiceProviderContactsRepository } from "./service-provider-contacts.repository";

import type {
  CreateServiceProviderContactInput,
  UpdateServiceProviderContactInput,
  UpdateServiceProviderContactStatusInput,
} from "./service-provider-contacts.validation";

export class ServiceProviderContactsService {
  private repository = new ServiceProviderContactsRepository();

  async getAll(
    serviceProviderId: string,
    organizationId: string,
    userId: string
  ) {
    return this.repository.getAll(
      serviceProviderId,
      organizationId,
      userId
    );
  }

  async getById(
    providerContactId: string,
    organizationId: string,
    userId: string
  ) {
    return this.repository.getById(
      providerContactId,
      organizationId,
      userId
    );
  }

  async create(
    data: CreateServiceProviderContactInput,
    userId: string
  ) {
    return this.repository.create(data, userId);
  }

  async update(
    providerContactId: string,
    organizationId: string,
    userId: string,
    data: UpdateServiceProviderContactInput
  ) {
    return this.repository.update(
      providerContactId,
      organizationId,
      userId,
      data
    );
  }

  async updateStatus(
    providerContactId: string,
    organizationId: string,
    userId: string,
    data: UpdateServiceProviderContactStatusInput
  ) {
    return this.repository.updateStatus(
      providerContactId,
      organizationId,
      userId,
      data
    );
  }
}
