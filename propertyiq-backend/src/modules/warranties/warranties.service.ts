
import * as repository from "./warranties.repository";
import type {
  CreateWarrantyInput,
  UpdateWarrantyInput,
} from "./warranties.validation";
import type { WarrantyAccessContext } from "./warranties.repository";

export function getAllWarranties(context: WarrantyAccessContext) {
  return repository.getAllWarranties(context);
}

export function getWarrantyById(
  warrantyId: string,
  context: WarrantyAccessContext
) {
  return repository.getWarrantyById(warrantyId, context);
}

export function createWarranty(
  data: CreateWarrantyInput,
  context: WarrantyAccessContext
) {
  return repository.createWarranty(data, context);
}

export function updateWarranty(
  warrantyId: string,
  context: WarrantyAccessContext,
  data: UpdateWarrantyInput
) {
  return repository.updateWarranty(warrantyId, context, data);
}

export function deleteWarranty(
  warrantyId: string,
  context: WarrantyAccessContext
) {
  return repository.deleteWarranty(warrantyId, context);
}
