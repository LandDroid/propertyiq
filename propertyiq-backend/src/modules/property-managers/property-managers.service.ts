
import { PropertyManagersRepository } from "./property-managers.repository";
import type { CreatePropertyManagerInput } from "./property-managers.validation";

const repository = new PropertyManagersRepository();

export class PropertyManagersService {
  getAll(organizationId: string, userId: string) {
    return repository.getAll(organizationId, userId);
  }

  getById(
    propertyManagerId: string,
    organizationId: string,
    userId: string
  ) {
    return repository.getById(
      propertyManagerId,
      organizationId,
      userId
    );
  }

  create(data: CreatePropertyManagerInput, userId: string) {
    return repository.create(data, userId);
  }

  end(
    propertyManagerId: string,
    organizationId: string,
    userId: string
  ) {
    return repository.end(
      propertyManagerId,
      organizationId,
      userId
    );
  }
}
