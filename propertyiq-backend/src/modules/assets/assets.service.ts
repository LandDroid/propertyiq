
import * as repository from "./assets.repository";

import type {
  CreateAssetInput,
  UpdateAssetInput,
} from "./assets.validation";

export type AssetAccessContext = {
  organizationId: string;
  membershipId: string;
  role: string;
};

export function getAllAssets(context: AssetAccessContext) {
  return repository.getAllAssets(context);
}

export function getAssetById(
  assetId: string,
  context: AssetAccessContext
) {
  return repository.getAssetById(assetId, context);
}

export function createAsset(
  data: CreateAssetInput,
  organizationId: string
) {
  return repository.createAsset(data, organizationId);
}

export function updateAsset(
  assetId: string,
  organizationId: string,
  data: UpdateAssetInput
) {
  return repository.updateAsset(assetId, organizationId, data);
}

export function deleteAsset(
  assetId: string,
  organizationId: string
) {
  return repository.deleteAsset(assetId, organizationId);
}
