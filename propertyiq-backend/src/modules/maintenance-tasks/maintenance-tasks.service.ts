
import {
  getAllMaintenanceTasks,
  getMaintenanceTaskById,
  createMaintenanceTask,
  updateMaintenanceTask,
  deleteMaintenanceTask,
  type MaintenanceTaskAccessContext,
} from "./maintenance-tasks.repository";

import type {
  CreateMaintenanceTaskInput,
  UpdateMaintenanceTaskInput,
} from "./maintenance-tasks.validation";

export class MaintenanceTasksService {
  async getAll(
    context: MaintenanceTaskAccessContext,
    filters?: {
      propertyId?: string;
      status?: string;
    }
  ) {
    return getAllMaintenanceTasks(context, filters);
  }

  async getById(
    context: MaintenanceTaskAccessContext,
    maintenanceTaskId: string
  ) {
    return getMaintenanceTaskById(context, maintenanceTaskId);
  }

  async create(
    context: MaintenanceTaskAccessContext,
    input: CreateMaintenanceTaskInput
  ) {
    return createMaintenanceTask(context, input);
  }

  async update(
    context: MaintenanceTaskAccessContext,
    maintenanceTaskId: string,
    input: UpdateMaintenanceTaskInput
  ) {
    return updateMaintenanceTask(context, maintenanceTaskId, input);
  }

  async delete(
    context: MaintenanceTaskAccessContext,
    maintenanceTaskId: string
  ) {
    return deleteMaintenanceTask(context, maintenanceTaskId);
  }
}
