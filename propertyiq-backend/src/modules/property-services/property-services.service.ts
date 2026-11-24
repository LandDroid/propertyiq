
import { PropertyServicesRepository } from "./property-services.repository";

import type {
  CreatePropertyServiceInput,
  UpdatePropertyServiceInput,
  UpdatePropertyServiceStatusInput,
} from "./property-services.validation";

export class PropertyServicesService {
  private repository = new PropertyServicesRepository();

  async getAll(organizationId: string, userId: string) {
    return this.repository.getAll(organizationId, userId);
  }

  async getById(
    propertyServiceId: string,
    organizationId: string,
    userId: string
  ) {
    return this.repository.getById(
      propertyServiceId,
      organizationId,
      userId
    );
  }

  async create(data: CreatePropertyServiceInput, userId: string) {
    return this.repository.create(data, userId);
  }

  async update(
    propertyServiceId: string,
    organizationId: string,
    userId: string,
    data: UpdatePropertyServiceInput
  ) {
    return this.repository.update(
      propertyServiceId,
      organizationId,
      userId,
      data
    );
  }

  async updateStatus(
    propertyServiceId: string,
    organizationId: string,
    userId: string,
    data: UpdatePropertyServiceStatusInput
  ) {
    return this.repository.updateStatus(
      propertyServiceId,
      organizationId,
      userId,
      data
    );
  }
}
