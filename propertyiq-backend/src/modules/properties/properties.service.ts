
import { PropertiesRepository } from "./properties.repository";
import type {
  CreatePropertyInput,
  UpdatePropertyInput,
} from "./properties.validation";

const repository = new PropertiesRepository();

export class PropertiesService {
  getAll(organizationId: string, userId: string) {
    return repository.getAll(organizationId, userId);
  }

  getById(
    propertyId: string,
    organizationId: string,
    userId: string
  ) {
    return repository.getById(propertyId, organizationId, userId);
  }

  create(data: CreatePropertyInput, userId: string) {
    return repository.create(data, userId);
  }

  update(
    propertyId: string,
    organizationId: string,
    userId: string,
    data: UpdatePropertyInput
  ) {
    return repository.update(propertyId, organizationId, userId, data);
  }

  delete(
    propertyId: string,
    organizationId: string,
    userId: string
  ) {
    return repository.delete(propertyId, organizationId, userId);
  }
}
