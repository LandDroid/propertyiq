
import { ServiceProvidersRepository } from "./service-providers.repository";

import type {
  CreateServiceProviderInput,
  UpdateServiceProviderInput,
  UpdateServiceProviderStatusInput,
} from "./service-providers.validation";

export class ServiceProvidersService {
  private repository = new ServiceProvidersRepository();

  // =====================================================
  // GET ALL SERVICE PROVIDERS
  // =====================================================

  async getAll(organizationId: string, userId: string) {
    return this.repository.getAll(organizationId, userId);
  }

  // =====================================================
  // GET SERVICE PROVIDER BY ID
  // =====================================================

  async getById(
    serviceProviderId: string,
    organizationId: string,
    userId: string
  ) {
    return this.repository.getById(
      serviceProviderId,
      organizationId,
      userId
    );
  }

  // =====================================================
  // CREATE SERVICE PROVIDER
  // =====================================================

  async create(data: CreateServiceProviderInput, userId: string) {
    return this.repository.create(data, userId);
  }

  // =====================================================
  // UPDATE SERVICE PROVIDER
  // =====================================================

  async update(
    serviceProviderId: string,
    organizationId: string,
    userId: string,
    data: UpdateServiceProviderInput
  ) {
    return this.repository.update(
      serviceProviderId,
      organizationId,
      userId,
      data
    );
  }

  // =====================================================
  // UPDATE SERVICE PROVIDER STATUS
  // =====================================================

  async updateStatus(
    serviceProviderId: string,
    organizationId: string,
    userId: string,
    data: UpdateServiceProviderStatusInput
  ) {
    return this.repository.updateStatus(
      serviceProviderId,
      organizationId,
      userId,
      data
    );
  }
}
