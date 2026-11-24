
import { getDatabase, sql } from "../../config/database";
import { NotificationOutboxRepository } from "../notifications/notification-outbox.repository";

export type AlertAccessContext = {
  organizationId: string;
  membershipId: string;
  role: string;
};

export type CreateAlertInput = {
  propertyId: string;
  deviceId?: string | null;
  sensorId?: string | null;
  alertRuleId?: string | null;
  title: string;
  message?: string | null;
  severity?: string;
  idempotencyKey: string;
};

const notificationOutboxRepository =
  new NotificationOutboxRepository();

function getRolePermissions(role: string) {
  const normalizedRole = role.trim().toLowerCase();

  return {
    isPrivileged:
      normalizedRole === "owner" ||
      normalizedRole === "administrator",
    canWrite:
      normalizedRole === "owner" ||
      normalizedRole === "administrator" ||
      normalizedRole === "member",
  };
}

function addAccessParameters(
  request: any,
  context: AlertAccessContext
) {
  const permissions = getRolePermissions(context.role);

  request
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      context.organizationId
    )
    .input(
      "membershipId",
      sql.UniqueIdentifier,
      context.membershipId
    )
    .input(
      "isPrivileged",
      sql.Bit,
      permissions.isPrivileged ? 1 : 0
    );

  return permissions;
}

const ALERT_SELECT = `
  SELECT
    a.AlertId AS alertId,
    a.OrganizationId AS organizationId,
    a.PropertyId AS propertyId,
    a.DeviceId AS deviceId,
    a.SensorId AS sensorId,
    a.AlertRuleId AS alertRuleId,
    a.Title AS title,
    a.Message AS message,
    a.Severity AS severity,
    a.Status AS status,
    a.TriggeredAt AS triggeredAt,
    a.AcknowledgedAt AS acknowledgedAt,
    a.ResolvedAt AS resolvedAt,
    p.PropertyName AS propertyName,
    d.DeviceName AS deviceName
  FROM dbo.Alerts a
  INNER JOIN dbo.Properties p
    ON p.PropertyId = a.PropertyId
    AND p.OrganizationId = a.OrganizationId
  LEFT JOIN dbo.Devices d
    ON d.DeviceId = a.DeviceId
    AND d.OrganizationId = a.OrganizationId
    AND d.PropertyId = a.PropertyId
`;

const PROPERTY_ACCESS_FILTER = `
  AND (
    @isPrivileged = 1
    OR EXISTS (
      SELECT 1
      FROM dbo.UserPropertyAccess upa
      INNER JOIN dbo.Memberships membership
        ON membership.MembershipId = upa.MembershipId
      INNER JOIN dbo.Properties assignedProperty
        ON assignedProperty.PropertyId = upa.PropertyId
      WHERE
        upa.MembershipId = @membershipId
        AND membership.OrganizationId = @organizationId
        AND upa.PropertyId = a.PropertyId
        AND assignedProperty.OrganizationId = @organizationId
    )
  )
`;

// =====================================================
// SAFE TRANSACTION ROLLBACK
// =====================================================

async function rollbackTransaction(
  transaction: sql.Transaction
) {
  try {
    await transaction.rollback();
  } catch {
    // Preserve the original database error.
  }
}

// =====================================================
// GET ALERT INSIDE EXISTING TRANSACTION
// =====================================================

async function getAlertInTransaction(
  transaction: sql.Transaction,
  alertId: string,
  organizationId: string
) {
  const result = await transaction
    .request()
    .input("alertId", sql.UniqueIdentifier, alertId)
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      organizationId
    )
    .query(`
      ${ALERT_SELECT}
      WHERE
        a.AlertId = @alertId
        AND a.OrganizationId = @organizationId;
    `);

  return result.recordset[0] ?? null;
}

// =====================================================
// VALIDATE PROPERTY ACCESS
// =====================================================

async function validateAlertPropertyAccess(
  transaction: sql.Transaction,
  organizationId: string,
  propertyId: string,
  context: AlertAccessContext
) {
  if (context.organizationId !== organizationId) {
    throw new Error("Alert organization access is invalid.");
  }

  const permissions = getRolePermissions(context.role);

  const result = await transaction
    .request()
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      organizationId
    )
    .input(
      "propertyId",
      sql.UniqueIdentifier,
      propertyId
    )
    .input(
      "membershipId",
      sql.UniqueIdentifier,
      context.membershipId
    )
    .input(
      "isPrivileged",
      sql.Bit,
      permissions.isPrivileged ? 1 : 0
    )
    .query(`
      SELECT p.PropertyId
      FROM dbo.Properties p
      WHERE
        p.PropertyId = @propertyId
        AND p.OrganizationId = @organizationId
        AND (
          @isPrivileged = 1
          OR EXISTS (
            SELECT 1
            FROM dbo.UserPropertyAccess upa
            INNER JOIN dbo.Memberships m
              ON m.MembershipId = upa.MembershipId
            WHERE
              upa.MembershipId = @membershipId
              AND upa.PropertyId = p.PropertyId
              AND m.OrganizationId = @organizationId
          )
        );
    `);

  if (result.recordset.length === 0) {
    throw new Error(
      "You do not have access to create alerts for this property."
    );
  }
}

// =====================================================
// CREATE ALERT + NOTIFICATION OUTBOX EVENT
//
// Both records are committed in the same transaction.
//
// Idempotency is checked before inserting the alert so
// retries cannot create duplicate alerts.
// =====================================================

export async function createAlert(
  organizationId: string,
  data: CreateAlertInput,
  accessContext?: AlertAccessContext
) {
  if (!accessContext) {
    throw new Error(
      "Alert access context is required."
    );
  }

  if (accessContext.organizationId !== organizationId) {
    throw new Error(
      "Alert organization access is invalid."
    );
  }

  if (!data.idempotencyKey?.trim()) {
    throw new Error(
      "Alert idempotency key is required."
    );
  }

  const pool = await getDatabase();
  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    // -------------------------------------------------
    // CHECK EXISTING IDEMPOTENCY KEY
    // -------------------------------------------------

    const existingEvent = await transaction
      .request()
      .input(
        "organizationId",
        sql.UniqueIdentifier,
        organizationId
      )
      .input(
        "idempotencyKey",
        sql.NVarChar(255),
        data.idempotencyKey.trim()
      )
      .query(`
        SELECT TOP 1
          AggregateType AS aggregateType,
          AggregateId AS aggregateId
        FROM dbo.NotificationOutbox
          WITH (UPDLOCK, HOLDLOCK)
        WHERE
          OrganizationId = @organizationId
          AND IdempotencyKey = @idempotencyKey;
      `);

    if (existingEvent.recordset.length > 0) {
      const existing = existingEvent.recordset[0];

      if (existing.aggregateType !== "alert") {
        throw new Error(
          "This idempotency key has already been used for another event."
        );
      }

      const existingAlert = await getAlertInTransaction(
        transaction,
        existing.aggregateId,
        organizationId
      );

      if (!existingAlert) {
        throw new Error(
          "An existing notification event references an alert that could not be found."
        );
      }

      // Do not allow an idempotency replay to bypass
      // property-level authorization.
      await validateAlertPropertyAccess(
        transaction,
        organizationId,
        existingAlert.propertyId,
        accessContext
      );

      await transaction.commit();

      return existingAlert;
    }

    // -------------------------------------------------
    // VALIDATE PROPERTY ACCESS
    // -------------------------------------------------

    await validateAlertPropertyAccess(
      transaction,
      organizationId,
      data.propertyId,
      accessContext
    );

    // -------------------------------------------------
    // VALIDATE OPTIONAL DEVICE OWNERSHIP
    // -------------------------------------------------

    if (data.deviceId) {
      const deviceResult = await transaction
        .request()
        .input(
          "organizationId",
          sql.UniqueIdentifier,
          organizationId
        )
        .input(
          "propertyId",
          sql.UniqueIdentifier,
          data.propertyId
        )
        .input(
          "deviceId",
          sql.UniqueIdentifier,
          data.deviceId
        )
        .query(`
          SELECT DeviceId
          FROM dbo.Devices
          WHERE
            DeviceId = @deviceId
            AND OrganizationId = @organizationId
            AND PropertyId = @propertyId;
        `);

      if (deviceResult.recordset.length === 0) {
        throw new Error(
          "The selected device does not belong to this property and organization."
        );
      }
    }

    // -------------------------------------------------
    // VALIDATE OPTIONAL SENSOR OWNERSHIP
    //
    // Sensors inherit organization and property
    // ownership through their parent device.
    // -------------------------------------------------

    if (data.sensorId) {
      const sensorResult = await transaction
        .request()
        .input(
          "organizationId",
          sql.UniqueIdentifier,
          organizationId
        )
        .input(
          "propertyId",
          sql.UniqueIdentifier,
          data.propertyId
        )
        .input(
          "sensorId",
          sql.UniqueIdentifier,
          data.sensorId
        )
        .input(
          "deviceId",
          sql.UniqueIdentifier,
          data.deviceId ?? null
        )
        .query(`
          SELECT s.SensorId
          FROM dbo.Sensors s
          INNER JOIN dbo.Devices d
            ON d.DeviceId = s.DeviceId
          WHERE
            s.SensorId = @sensorId
            AND d.OrganizationId = @organizationId
            AND d.PropertyId = @propertyId
            AND (
              @deviceId IS NULL
              OR d.DeviceId = @deviceId
            );
        `);

      if (sensorResult.recordset.length === 0) {
        throw new Error(
          "The selected sensor does not belong to this property and organization."
        );
      }
    }

    // -------------------------------------------------
    // VALIDATE OPTIONAL ALERT RULE OWNERSHIP
    // -------------------------------------------------

    if (data.alertRuleId) {
      const ruleResult = await transaction
        .request()
        .input(
          "organizationId",
          sql.UniqueIdentifier,
          organizationId
        )
        .input(
          "propertyId",
          sql.UniqueIdentifier,
          data.propertyId
        )
        .input(
          "sensorId",
          sql.UniqueIdentifier,
          data.sensorId ?? null
        )
        .input(
          "alertRuleId",
          sql.UniqueIdentifier,
          data.alertRuleId
        )
        .query(`
          SELECT AlertRuleId
          FROM dbo.AlertRules
          WHERE
            AlertRuleId = @alertRuleId
            AND OrganizationId = @organizationId
            AND (
              PropertyId IS NULL
              OR PropertyId = @propertyId
            )
            AND (
              SensorId IS NULL
              OR SensorId = @sensorId
            );
        `);

      if (ruleResult.recordset.length === 0) {
        throw new Error(
          "The selected alert rule does not belong to this organization, property, or sensor."
        );
      }
    }

    // -------------------------------------------------
    // INSERT ALERT
    // -------------------------------------------------

    const insertResult = await transaction
      .request()
      .input(
        "organizationId",
        sql.UniqueIdentifier,
        organizationId
      )
      .input(
        "propertyId",
        sql.UniqueIdentifier,
        data.propertyId
      )
      .input(
        "deviceId",
        sql.UniqueIdentifier,
        data.deviceId ?? null
      )
      .input(
        "sensorId",
        sql.UniqueIdentifier,
        data.sensorId ?? null
      )
      .input(
        "alertRuleId",
        sql.UniqueIdentifier,
        data.alertRuleId ?? null
      )
      .input(
        "title",
        sql.NVarChar(200),
        data.title.trim()
      )
      .input(
        "message",
        sql.NVarChar(1000),
        data.message?.trim() || null
      )
      .input(
        "severity",
        sql.NVarChar(30),
        data.severity?.trim() || "warning"
      )
      .query(`
        INSERT INTO dbo.Alerts (
          OrganizationId,
          PropertyId,
          DeviceId,
          SensorId,
          AlertRuleId,
          Title,
          Message,
          Severity
        )
        OUTPUT
          INSERTED.AlertId AS alertId
        VALUES (
          @organizationId,
          @propertyId,
          @deviceId,
          @sensorId,
          @alertRuleId,
          @title,
          @message,
          @severity
        );
      `);

    const alertId = insertResult.recordset[0]?.alertId;

    if (!alertId) {
      throw new Error("Alert creation failed.");
    }

    // -------------------------------------------------
    // LOAD CREATED ALERT
    // -------------------------------------------------

    const alert = await getAlertInTransaction(
      transaction,
      alertId,
      organizationId
    );

    if (!alert) {
      throw new Error(
        "The created alert could not be retrieved."
      );
    }

    // -------------------------------------------------
    // ENQUEUE NOTIFICATION EVENT
    // -------------------------------------------------

    const event = await notificationOutboxRepository
      .createInTransaction(
        transaction,
        organizationId,
        {
          eventType: "alert.created",
          aggregateType: "alert",
          aggregateId: alertId,
          idempotencyKey: data.idempotencyKey.trim(),
          payload: {
            alertId: alert.alertId,
            organizationId: alert.organizationId,
            propertyId: alert.propertyId,
            deviceId: alert.deviceId,
            sensorId: alert.sensorId,
            alertRuleId: alert.alertRuleId,
            title: alert.title,
            message: alert.message,
            severity: alert.severity,
            status: alert.status,
            triggeredAt: alert.triggeredAt,
          },
        }
      );

    if (!event) {
      throw new Error(
        "The notification event already exists. Alert creation was rolled back."
      );
    }

    // -------------------------------------------------
    // COMMIT BOTH OPERATIONS
    // -------------------------------------------------

    await transaction.commit();

    return alert;
  } catch (error) {
    await rollbackTransaction(transaction);
    throw error;
  }
}

// =====================================================
// GET ALL ALERTS
// =====================================================

export async function getAllAlerts(
  context: AlertAccessContext
) {
  const pool = await getDatabase();
  const request = pool.request();

  addAccessParameters(request, context);

  const result = await request.query(`
    ${ALERT_SELECT}
    WHERE
      a.OrganizationId = @organizationId
      ${PROPERTY_ACCESS_FILTER}
    ORDER BY
      CASE
        WHEN LOWER(a.Status) = 'open' THEN 0
        WHEN LOWER(a.Status) = 'acknowledged' THEN 1
        ELSE 2
      END,
      a.TriggeredAt DESC;
  `);

  return result.recordset;
}

// =====================================================
// GET ALERT BY ID
// =====================================================

export async function getAlertById(
  alertId: string,
  context: AlertAccessContext
) {
  const pool = await getDatabase();

  const request = pool
    .request()
    .input("alertId", sql.UniqueIdentifier, alertId);

  addAccessParameters(request, context);

  const result = await request.query(`
    ${ALERT_SELECT}
    WHERE
      a.AlertId = @alertId
      AND a.OrganizationId = @organizationId
      ${PROPERTY_ACCESS_FILTER};
  `);

  return result.recordset[0] ?? null;
}

// =====================================================
// UPDATE ALERT STATUS
// =====================================================

export async function updateAlertStatus(
  alertId: string,
  context: AlertAccessContext,
  status: "acknowledged" | "resolved"
) {
  const permissions = getRolePermissions(context.role);

  if (!permissions.canWrite) {
    throw new Error(
      "You do not have permission to update alerts."
    );
  }

  const pool = await getDatabase();

  const request = pool
    .request()
    .input("alertId", sql.UniqueIdentifier, alertId);

  addAccessParameters(request, context);

  if (status === "acknowledged") {
    await request.query(`
      UPDATE a
      SET
        Status = 'acknowledged',
        AcknowledgedAt = SYSUTCDATETIME()
      FROM dbo.Alerts a
      WHERE
        a.AlertId = @alertId
        AND a.OrganizationId = @organizationId
        AND LOWER(a.Status) = 'open'
        ${PROPERTY_ACCESS_FILTER};
    `);
  } else {
    await request.query(`
      UPDATE a
      SET
        Status = 'resolved',
        ResolvedAt = SYSUTCDATETIME(),
        AcknowledgedAt = COALESCE(
          AcknowledgedAt,
          SYSUTCDATETIME()
        )
      FROM dbo.Alerts a
      WHERE
        a.AlertId = @alertId
        AND a.OrganizationId = @organizationId
        AND LOWER(a.Status) IN ('open', 'acknowledged')
        ${PROPERTY_ACCESS_FILTER};
    `);
  }

  return getAlertById(alertId, context);
}
