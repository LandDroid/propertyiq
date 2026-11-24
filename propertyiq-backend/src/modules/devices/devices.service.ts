
import * as repository from "./devices.repository";

import type {
  CreateDeviceInput,
  UpdateDeviceInput,
} from "./devices.validation";

export type DeviceAccessContext = {
  organizationId: string;
  membershipId: string;
  role: string;
};

// =====================================================
// GET ALL DEVICES
// =====================================================

export async function getAll(context: DeviceAccessContext) {
  return repository.getAllDevices(context);
}

// =====================================================
// GET DEVICE BY ID
// =====================================================

export async function getById(
  deviceId: string,
  context: DeviceAccessContext
) {
  return repository.getDeviceById(deviceId, context);
}

// =====================================================
// CREATE DEVICE
// =====================================================

export async function create(
  data: CreateDeviceInput,
  organizationId: string
) {
  return repository.createDevice(data, organizationId);
}

// =====================================================
// UPDATE DEVICE
// =====================================================

export async function update(
  deviceId: string,
  organizationId: string,
  data: UpdateDeviceInput
) {
  return repository.updateDevice(deviceId, organizationId, data);
}

// =====================================================
// DELETE DEVICE
// =====================================================

export async function remove(
  deviceId: string,
  organizationId: string
) {
  return repository.deleteDevice(deviceId, organizationId);
}
