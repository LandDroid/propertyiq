
import { getDatabase, sql } from "../../config/database";

export type AlertAssignmentAccessContext = {
  organizationId: string;
  membershipId: string;
  userId: string;
  role: string;
};

export type CreateAlertAssignmentData = {
  alertId: string;
  propertyId: string;
  membershipId?: string | null;
  serviceProviderId?: string | null;
  notes?: string | null;
};

export type UnassignAlertData = {
  notes?: string | null;
};

function isPrivileged(role: string) {
  const normalizedRole = role.trim().toLowerCase();

  return (
    normalizedRole === "owner" ||
    normalizedRole === "administrator"
  );
}

function assertWritePermission(context: AlertAssignmentAccessContext) {
  if (!isPrivileged(context.role)) {
    throw new Error(
      "You do not have permission to manage alert assignments."
    );
  }
}

function addContextParameters(
  request: any,
  context: AlertAssignmentAccessContext
) {
  request
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      context.organizationId
    )
    .input(
      "requesterMembershipId",
      sql.UniqueIdentifier,
      context.membershipId
    )
    .input(
      "requesterUserId",
      sql.UniqueIdentifier,
      context.userId
    );
}

const ASSIGNMENT_SELECT = `
  SELECT
    aa.AlertAssignmentId AS alertAssignmentId,
    aa.OrganizationId AS organizationId,
    aa.AlertId AS alertId,
    aa.PropertyId AS propertyId,
    aa.MembershipId AS membershipId,
    aa.ServiceProviderId AS serviceProviderId,
    aa.AssignedByUserId AS assignedByUserId,
    aa.AssignedAt AS assignedAt,
    aa.UnassignedAt AS unassignedAt,
    aa.IsActive AS isActive,
    aa.Notes AS notes,
    assignedUser.FirstName AS assignedUserFirstName,
    assignedUser.LastName AS assignedUserLastName,
    assignedUser.Email AS assignedUserEmail,
    sp.CompanyName AS serviceProviderName
  FROM dbo.AlertAssignments aa
  LEFT JOIN dbo.Memberships assignedMembership
    ON assignedMembership.MembershipId = aa.MembershipId
    AND assignedMembership.OrganizationId = aa.OrganizationId
  LEFT JOIN dbo.Users assignedUser
    ON assignedUser.UserId = assignedMembership.UserId
  LEFT JOIN dbo.ServiceProviders sp
    ON sp.ServiceProviderId = aa.ServiceProviderId
    AND sp.OrganizationId = aa.OrganizationId
`;

const ALERT_PROPERTY_ACCESS = `
  AND (
    LOWER(LTRIM(RTRIM(@requesterRole))) IN ('owner', 'administrator')
    OR EXISTS (
      SELECT 1
      FROM dbo.UserPropertyAccess upa
      INNER JOIN dbo.Memberships accessMembership
        ON accessMembership.MembershipId = upa.MembershipId
        AND accessMembership.OrganizationId = @organizationId
      WHERE
        upa.MembershipId = @requesterMembershipId
        AND upa.PropertyId = aa.PropertyId
    )
  )
`;

function addRoleParameter(
  request: any,
  context: AlertAssignmentAccessContext
) {
  request.input(
    "requesterRole",
    sql.NVarChar(50),
    context.role
  );
}

function rollbackSafely(transaction: any) {
  return transaction.rollback().catch(() => undefined);
}

// =====================================================
// GET ASSIGNMENTS FOR ALERT
// =====================================================

export async function getAlertAssignments(
  alertId: string,
  context: AlertAssignmentAccessContext
) {
  const pool = await getDatabase();

  const request = pool
    .request()
    .input("alertId", sql.UniqueIdentifier, alertId);

  addContextParameters(request, context);
  addRoleParameter(request, context);

  const result = await request.query(`
    ${ASSIGNMENT_SELECT}
    WHERE
      aa.AlertId = @alertId
      AND aa.OrganizationId = @organizationId
      ${ALERT_PROPERTY_ACCESS}
    ORDER BY
      aa.AssignedAt DESC;
  `);

  return result.recordset;
}

// =====================================================
// GET ASSIGNMENT BY ID
// =====================================================

export async function getAlertAssignmentById(
  alertAssignmentId: string,
  context: AlertAssignmentAccessContext
) {
  const pool = await getDatabase();

  const request = pool
    .request()
    .input(
      "alertAssignmentId",
      sql.UniqueIdentifier,
      alertAssignmentId
    );

  addContextParameters(request, context);
  addRoleParameter(request, context);

  const result = await request.query(`
    ${ASSIGNMENT_SELECT}
    WHERE
      aa.AlertAssignmentId = @alertAssignmentId
      AND aa.OrganizationId = @organizationId
      ${ALERT_PROPERTY_ACCESS};
  `);

  return result.recordset[0] ?? null;
}

// =====================================================
// CREATE / REASSIGN ALERT
// =====================================================

export async function createAlertAssignment(
  data: CreateAlertAssignmentData,
  context: AlertAssignmentAccessContext
) {
  assertWritePermission(context);

  const hasMembership =
    typeof data.membershipId === "string";

  const hasServiceProvider =
    typeof data.serviceProviderId === "string";

  if (hasMembership === hasServiceProvider) {
    throw new Error(
      "Exactly one active assignee is required."
    );
  }

  const pool = await getDatabase();
  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const request = new sql.Request(transaction);

    request
      .input(
        "alertId",
        sql.UniqueIdentifier,
        data.alertId
      )
      .input(
        "propertyId",
        sql.UniqueIdentifier,
        data.propertyId
      )
      .input(
        "organizationId",
        sql.UniqueIdentifier,
        context.organizationId
      )
      .input(
        "requesterMembershipId",
        sql.UniqueIdentifier,
        context.membershipId
      )
      .input(
        "requesterUserId",
        sql.UniqueIdentifier,
        context.userId
      )
      .input(
        "membershipId",
        sql.UniqueIdentifier,
        data.membershipId ?? null
      )
      .input(
        "serviceProviderId",
        sql.UniqueIdentifier,
        data.serviceProviderId ?? null
      )
      .input(
        "notes",
        sql.NVarChar(1000),
        data.notes ?? null
      );

    const alertResult = await request.query(`
      SELECT
        a.AlertId,
        a.PropertyId
      FROM dbo.Alerts a WITH (UPDLOCK, HOLDLOCK)
      INNER JOIN dbo.Properties p
        ON p.PropertyId = a.PropertyId
        AND p.OrganizationId = a.OrganizationId
      INNER JOIN dbo.Memberships requesterMembership
        ON requesterMembership.MembershipId = @requesterMembershipId
        AND requesterMembership.OrganizationId = @organizationId
      INNER JOIN dbo.Users requesterUser
        ON requesterUser.UserId = @requesterUserId
        AND requesterUser.UserId = requesterMembership.UserId
      INNER JOIN dbo.Organizations requesterOrganization
        ON requesterOrganization.OrganizationId = @organizationId
      WHERE
        a.AlertId = @alertId
        AND a.OrganizationId = @organizationId
        AND a.PropertyId = @propertyId
        AND LOWER(LTRIM(RTRIM(requesterOrganization.Status))) = 'active'
        AND LOWER(LTRIM(RTRIM(requesterUser.Status))) = 'active'
        AND (
          LOWER(LTRIM(RTRIM(requesterMembership.Role))) IN ('owner', 'administrator')
          OR EXISTS (
            SELECT 1
            FROM dbo.UserPropertyAccess upa
            WHERE
              upa.MembershipId = @requesterMembershipId
              AND upa.PropertyId = a.PropertyId
          )
        );
    `);

    const alert = alertResult.recordset[0];

   if (!alert) {
  throw new Error("Alert not found.");
}

    if (hasMembership) {
      const membershipResult = await request.query(`
        SELECT TOP 1 m.MembershipId
        FROM dbo.Memberships m
        INNER JOIN dbo.Users u
          ON u.UserId = m.UserId
        WHERE
          m.MembershipId = @membershipId
          AND m.OrganizationId = @organizationId
          AND LOWER(LTRIM(RTRIM(u.Status))) = 'active';
      `);

      if (!membershipResult.recordset[0]) {
        throw new Error(
          "The selected membership is invalid or inactive."
        );
      }
    } else {
      const providerResult = await request.query(`
        SELECT TOP 1 ServiceProviderId
        FROM dbo.ServiceProviders
        WHERE
          ServiceProviderId = @serviceProviderId
          AND OrganizationId = @organizationId
          AND LOWER(LTRIM(RTRIM(Status))) = 'active';
      `);

      if (!providerResult.recordset[0]) {
        throw new Error(
          "The selected service provider is invalid or inactive."
        );
      }
    }

    await request.query(`
      UPDATE dbo.AlertAssignments
      SET
        IsActive = 0,
        UnassignedAt = SYSUTCDATETIME()
      WHERE
        AlertId = @alertId
        AND OrganizationId = @organizationId
        AND IsActive = 1;
    `);

    const insertResult = await request.query(`
      INSERT INTO dbo.AlertAssignments (
        OrganizationId,
        AlertId,
        PropertyId,
        MembershipId,
        ServiceProviderId,
        AssignedByUserId,
        AssignedAt,
        IsActive,
        Notes
      )
      OUTPUT
        INSERTED.AlertAssignmentId AS alertAssignmentId
      VALUES (
        @organizationId,
        @alertId,
        @propertyId,
        @membershipId,
        @serviceProviderId,
        @requesterUserId,
        SYSUTCDATETIME(),
        1,
        @notes
      );
    `);

    const alertAssignmentId =
      insertResult.recordset[0]?.alertAssignmentId;

    if (!alertAssignmentId) {
      throw new Error("Unable to create alert assignment.");
    }

    await transaction.commit();

    return getAlertAssignmentById(
      alertAssignmentId,
      context
    );
  } catch (error) {
    await rollbackSafely(transaction);
    throw error;
  }
}

// =====================================================
// UNASSIGN ALERT
// =====================================================

export async function unassignAlert(
  alertAssignmentId: string,
  context: AlertAssignmentAccessContext,
  data: UnassignAlertData
) {
  assertWritePermission(context);

  const pool = await getDatabase();
  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const request = new sql.Request(transaction);

    request
      .input(
        "alertAssignmentId",
        sql.UniqueIdentifier,
        alertAssignmentId
      )
      .input(
        "organizationId",
        sql.UniqueIdentifier,
        context.organizationId
      )
      .input(
        "requesterMembershipId",
        sql.UniqueIdentifier,
        context.membershipId
      )
      .input(
        "requesterUserId",
        sql.UniqueIdentifier,
        context.userId
      )
      .input(
        "notes",
        sql.NVarChar(1000),
        data.notes ?? null
      );

    const result = await request.query(`
      UPDATE aa
      SET
        IsActive = 0,
        UnassignedAt = SYSUTCDATETIME(),
        Notes = COALESCE(@notes, aa.Notes)
      OUTPUT
        INSERTED.AlertAssignmentId AS alertAssignmentId
      FROM dbo.AlertAssignments aa
      INNER JOIN dbo.Alerts a
        ON a.AlertId = aa.AlertId
        AND a.OrganizationId = aa.OrganizationId
      INNER JOIN dbo.Memberships requesterMembership
        ON requesterMembership.MembershipId = @requesterMembershipId
        AND requesterMembership.OrganizationId = @organizationId
      INNER JOIN dbo.Users requesterUser
        ON requesterUser.UserId = requesterMembership.UserId
        AND requesterUser.UserId = @requesterUserId
      INNER JOIN dbo.Organizations requesterOrganization
        ON requesterOrganization.OrganizationId = @organizationId
      WHERE
        aa.AlertAssignmentId = @alertAssignmentId
        AND aa.OrganizationId = @organizationId
        AND aa.IsActive = 1
        AND LOWER(LTRIM(RTRIM(requesterOrganization.Status))) = 'active'
        AND LOWER(LTRIM(RTRIM(requesterUser.Status))) = 'active'
        AND LOWER(LTRIM(RTRIM(requesterMembership.Role))) IN ('owner', 'administrator')
        AND (
          EXISTS (
            SELECT 1
            FROM dbo.Properties p
            WHERE
              p.PropertyId = aa.PropertyId
              AND p.OrganizationId = @organizationId
          )
        );
    `);

    const updatedId = result.recordset[0]?.alertAssignmentId;

    if (!updatedId) {
      throw new Error(
        "Alert assignment not found or already unassigned."
      );
    }

    await transaction.commit();

    return getAlertAssignmentById(
      updatedId,
      context
    );
  } catch (error) {
    await rollbackSafely(transaction);
    throw error;
  }
}
