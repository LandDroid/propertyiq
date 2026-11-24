
import {
  createAlert as createAlertRepository,
  getAllAlerts,
  getAlertById,
  updateAlertStatus,
  type AlertAccessContext,
  type CreateAlertInput,
} from "./alerts.repository";

// =====================================================
// ALERT PERMISSIONS
// =====================================================

function canWriteAlerts(role: string) {
  const normalizedRole = role.trim().toLowerCase();

  return (
    normalizedRole === "owner" ||
    normalizedRole === "administrator" ||
    normalizedRole === "member"
  );
}

// =====================================================
// CREATE ALERT
// =====================================================

export async function createAlert(
  context: AlertAccessContext,
  data: CreateAlertInput
) {
  if (!canWriteAlerts(context.role)) {
    throw new Error(
      "You do not have permission to create alerts."
    );
  }

  return createAlertRepository(
    context.organizationId,
    data,
    context
  );
}

// =====================================================
// LIST ALERTS
// =====================================================

export function listAlerts(
  context: AlertAccessContext
) {
  return getAllAlerts(context);
}

// =====================================================
// FIND ALERT
// =====================================================

export function findAlert(
  alertId: string,
  context: AlertAccessContext
) {
  return getAlertById(alertId, context);
}

// =====================================================
// ACKNOWLEDGE ALERT
// =====================================================

export function acknowledgeAlert(
  alertId: string,
  context: AlertAccessContext
) {
  return updateAlertStatus(
    alertId,
    context,
    "acknowledged"
  );
}

// =====================================================
// RESOLVE ALERT
// =====================================================

export function resolveAlert(
  alertId: string,
  context: AlertAccessContext
) {
  return updateAlertStatus(
    alertId,
    context,
    "resolved"
  );
}
