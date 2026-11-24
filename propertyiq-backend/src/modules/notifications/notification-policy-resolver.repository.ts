
import { getDatabase, sql } from "../../config/database";

import type {
  NotificationChannel,
  NotificationPolicyResult,
  ResolveNotificationPolicyInput,
} from "./notification-policy-resolver.validation";

export class NotificationPolicyResolverRepository {
  async resolve(
    input: ResolveNotificationPolicyInput
  ): Promise<NotificationPolicyResult> {
    const db = await getDatabase();

    const result = await db.request()
      .input(
        "organizationId",
        sql.UniqueIdentifier,
        input.organizationId
      )
      .input(
        "userId",
        sql.UniqueIdentifier,
        input.userId
      )
      .input(
        "severity",
        sql.NVarChar(30),
        input.severity
      )
      .query(`
        SELECT
          @userId AS userId,

          CASE
            WHEN EXISTS (
              SELECT 1
              FROM dbo.Memberships m
              INNER JOIN dbo.Organizations o
                ON o.OrganizationId = m.OrganizationId
              INNER JOIN dbo.Users u
                ON u.UserId = m.UserId
              WHERE m.OrganizationId = @organizationId
                AND m.UserId = @userId
                AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
                AND LOWER(LTRIM(RTRIM(u.Status))) = 'active'
            )
            AND (
              ISNULL(np.CriticalAlertsOnly, 0) = 0
              OR LOWER(@severity) = 'critical'
            )
            THEN 1
            ELSE 0
          END AS eligible,

          ISNULL(np.EmailEnabled, 1) AS emailEnabled,
          ISNULL(np.SmsEnabled, 0) AS smsEnabled,
          ISNULL(np.PushEnabled, 1) AS pushEnabled,

          ISNULL(np.CriticalAlertsOnly, 0)
            AS criticalAlertsOnly

        FROM (SELECT 1 AS singleton) s

        LEFT JOIN dbo.NotificationPreferences np
          ON np.OrganizationId = @organizationId
          AND np.UserId = @userId;
      `);

    const row = result.recordset[0];

    if (!row) {
      return {
        userId: input.userId,
        eligible: false,
        channels: [],
        criticalAlertsOnly: false,
      };
    }

    const eligible = row.eligible === 1;

    const channels: NotificationChannel[] = eligible
      ? [
          ...(row.emailEnabled ? ["email" as const] : []),
          ...(row.smsEnabled ? ["sms" as const] : []),
          ...(row.pushEnabled ? ["push" as const] : []),
        ]
      : [];

    return {
      userId: row.userId,
      eligible,
      channels,
      criticalAlertsOnly: row.criticalAlertsOnly === true
        || row.criticalAlertsOnly === 1,
    };
  }
}
