
import {
  getAlertAssignments,
  getAlertAssignmentById,
  createAlertAssignment,
  unassignAlert,
  type AlertAssignmentAccessContext,
  type CreateAlertAssignmentData,
  type UnassignAlertData,
} from "./alert-assignments.repository";

// =====================================================
// GET ASSIGNMENTS FOR ALERT
// =====================================================

export function listAlertAssignments(
  alertId: string,
  context: AlertAssignmentAccessContext
) {
  return getAlertAssignments(alertId, context);
}

// =====================================================
// GET ASSIGNMENT BY ID
// =====================================================

export function findAlertAssignment(
  alertAssignmentId: string,
  context: AlertAssignmentAccessContext
) {
  return getAlertAssignmentById(
    alertAssignmentId,
    context
  );
}

// =====================================================
// CREATE / REASSIGN ALERT
// =====================================================

export function assignAlert(
  data: CreateAlertAssignmentData,
  context: AlertAssignmentAccessContext
) {
  return createAlertAssignment(data, context);
}

// =====================================================
// UNASSIGN ALERT
// =====================================================

export function unassignAlertAssignment(
  alertAssignmentId: string,
  context: AlertAssignmentAccessContext,
  data: UnassignAlertData
) {
  return unassignAlert(
    alertAssignmentId,
    context,
    data
  );
}
