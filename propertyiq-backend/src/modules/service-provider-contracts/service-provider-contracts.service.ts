
import { ServiceProviderContractsRepository } from "./service-provider-contracts.repository";

import type {
  CreateServiceProviderContractInput,
  UpdateServiceProviderContractInput,
  UpdateServiceProviderContractStatusInput,
} from "./service-provider-contracts.validation";

export class ServiceProviderContractsService {
  private readonly repository = new ServiceProviderContractsRepository();

  // =====================================================
  // GET ALL CONTRACTS FOR A SERVICE PROVIDER
  // =====================================================

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

  // =====================================================
  // GET CONTRACT BY ID
  // =====================================================

  async getById(
    contractId: string,
    organizationId: string,
    userId: string
  ) {
    return this.repository.getById(
      contractId,
      organizationId,
      userId
    );
  }

  // =====================================================
  // CREATE CONTRACT
  // =====================================================

  async create(
    data: CreateServiceProviderContractInput,
    userId: string
  ) {
    return this.repository.create(data, userId);
  }

  // =====================================================
  // UPDATE CONTRACT
  // =====================================================

  async update(
    contractId: string,
    organizationId: string,
    userId: string,
    data: UpdateServiceProviderContractInput
  ) {
    return this.repository.update(
      contractId,
      organizationId,
      userId,
      data
    );
  }

  // =====================================================
  // UPDATE CONTRACT STATUS
  // =====================================================

  async updateStatus(
    contractId: string,
    organizationId: string,
    userId: string,
    data: UpdateServiceProviderContractStatusInput
  ) {
    return this.repository.updateStatus(
      contractId,
      organizationId,
      userId,
      data
    );
  }
}
