
import {
  getAssignmentsByTask,
  getTaskAssignmentById,
  createTaskAssignment,
  updateTaskAssignmentStatus,
  type TaskAssignmentAccessContext,
} from "./maintenance-task-assignments.repository";

import type {
  CreateTaskAssignmentInput,
  UpdateTaskAssignmentStatusInput,
} from "./maintenance-task-assignments.validation";

export class MaintenanceTaskAssignmentsService {
  async getAssignmentsByTask(
    context: TaskAssignmentAccessContext,
    maintenanceTaskId: string
  ) {
    return getAssignmentsByTask(context, maintenanceTaskId);
  }

  async getTaskAssignmentById(
    context: TaskAssignmentAccessContext,
    taskAssignmentId: string
  ) {
    return getTaskAssignmentById(context, taskAssignmentId);
  }

  async createTaskAssignment(
    context: TaskAssignmentAccessContext,
    input: CreateTaskAssignmentInput
  ) {
    return createTaskAssignment(context, input);
  }

  async updateTaskAssignmentStatus(
    context: TaskAssignmentAccessContext,
    taskAssignmentId: string,
    input: UpdateTaskAssignmentStatusInput
  ) {
    return updateTaskAssignmentStatus(context, taskAssignmentId, input);
  }
}
