import { getDatabase, sql } from "../../config/database";

import type {
  NotificationRecipient,
  ResolveNotificationRecipientsInput,
} from "./notification-recipient-resolver.validation";

export class NotificationRecipientResolverRepository {
  async resolve(
    input: ResolveNotificationRecipientsInput
  ): Promise<NotificationRecipient[]> {
    const db = await getDatabase();

    const result = await db
      .request()
      .input("organizationId", sql.UniqueIdentifier, input.organizationId)
      .input("alertId", sql.UniqueIdentifier, input.alertId)
      .query(`
        WITH TargetAlert AS (
          SELECT
            a.AlertId,
            a.OrganizationId,
            a.PropertyId
          FROM dbo.Alerts a
          WHERE a.AlertId = @alertId
            AND a.OrganizationId = @organizationId
        ),
        EligibleMemberships AS (
          -- Internal members actively assigned to this alert.
          SELECT aa.MembershipId
          FROM dbo.AlertAssignments aa
          INNER JOIN TargetAlert ta
            ON ta.AlertId = aa.AlertId
            AND ta.OrganizationId = aa.OrganizationId
            AND ta.PropertyId = aa.PropertyId
          WHERE aa.MembershipId IS NOT NULL
            AND aa.IsActive = 1
            AND aa.UnassignedAt IS NULL

          UNION

          -- Internal property managers assigned to the alert's property.
          SELECT pm.MembershipId
          FROM dbo.PropertyManagers pm
          INNER JOIN TargetAlert ta
            ON ta.OrganizationId = pm.OrganizationId
            AND ta.PropertyId = pm.PropertyId
        WHERE pm.Status = 'active'
  AND pm.EndedAt IS NULL
        )
        SELECT DISTINCT
          u.UserId AS userId,
          u.Email AS email,
          u.FirstName AS firstName,
          u.LastName AS lastName
        FROM EligibleMemberships em
        INNER JOIN dbo.Memberships m
          ON m.MembershipId = em.MembershipId
          AND m.OrganizationId = @organizationId
        INNER JOIN dbo.Users u
          ON u.UserId = m.UserId
        WHERE u.Status = 'active'
        ORDER BY
          u.FirstName,
          u.LastName,
          u.Email;
      `);

    return result.recordset as NotificationRecipient[];
  }
}