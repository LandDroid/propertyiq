
import { getDatabase, sql } from "../../config/database";

import type {
  UpdateNotificationPreferencesInput,
} from "./notification-preferences.validation";

export class NotificationPreferencesRepository {
  // =====================================================
  // ACTIVE ORGANIZATION MEMBERSHIP CHECK
  //
  // Users can only access their own preferences within
  // an active organization where they are a member.
  // =====================================================

  private readonly accessCheck = `
    EXISTS (
      SELECT 1
      FROM dbo.Memberships m

      INNER JOIN dbo.Organizations o
        ON o.OrganizationId = m.OrganizationId

      INNER JOIN dbo.Users u
        ON u.UserId = m.UserId

      WHERE m.UserId = @userId
        AND m.OrganizationId = @organizationId
        AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
        AND LOWER(LTRIM(RTRIM(u.Status))) = 'active'
    )
  `;

  // =====================================================
  // SAFE TRANSACTION ROLLBACK
  // =====================================================

  private async rollback(transaction: sql.Transaction) {
    try {
      await transaction.rollback();
    } catch {
      // Preserve the original database error.
    }
  }

  // =====================================================
  // CHECK ORGANIZATION ACCESS
  // =====================================================

  private async hasAccess(
    transaction: sql.Transaction,
    organizationId: string,
    userId: string
  ): Promise<boolean> {
    const result = await transaction
      .request()
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        SELECT
          CASE
            WHEN ${this.accessCheck}
            THEN 1
            ELSE 0
          END AS hasAccess;
      `);

    return result.recordset[0]?.hasAccess === 1;
  }

  // =====================================================
  // GET OR CREATE USER PREFERENCES
  //
  // Creates database defaults when no preferences exist.
  // SERIALIZABLE prevents concurrent duplicate creation.
  // =====================================================

  async getOrCreate(
    organizationId: string,
    userId: string
  ) {
    const pool = await getDatabase();
    const transaction = new sql.Transaction(pool);

    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    try {
      const hasAccess = await this.hasAccess(
        transaction,
        organizationId,
        userId
      );

      if (!hasAccess) {
        await this.rollback(transaction);
        return null;
      }

      const existingResult = await transaction
        .request()
        .input("organizationId", sql.UniqueIdentifier, organizationId)
        .input("userId", sql.UniqueIdentifier, userId)
        .query(`
          SELECT
            NotificationPreferenceId AS notificationPreferenceId,
            OrganizationId AS organizationId,
            UserId AS userId,
            EmailEnabled AS emailEnabled,
            SmsEnabled AS smsEnabled,
            PushEnabled AS pushEnabled,
            CriticalAlertsOnly AS criticalAlertsOnly,
            CreatedAt AS createdAt,
            UpdatedAt AS updatedAt

          FROM dbo.NotificationPreferences WITH (UPDLOCK, HOLDLOCK)

          WHERE OrganizationId = @organizationId
            AND UserId = @userId;
        `);

      let preferences = existingResult.recordset[0] ?? null;

      if (!preferences) {
        const insertResult = await transaction
          .request()
          .input("organizationId", sql.UniqueIdentifier, organizationId)
          .input("userId", sql.UniqueIdentifier, userId)
          .query(`
            INSERT INTO dbo.NotificationPreferences (
              OrganizationId,
              UserId
            )

            OUTPUT
              INSERTED.NotificationPreferenceId
                AS notificationPreferenceId,
              INSERTED.OrganizationId AS organizationId,
              INSERTED.UserId AS userId,
              INSERTED.EmailEnabled AS emailEnabled,
              INSERTED.SmsEnabled AS smsEnabled,
              INSERTED.PushEnabled AS pushEnabled,
              INSERTED.CriticalAlertsOnly AS criticalAlertsOnly,
              INSERTED.CreatedAt AS createdAt,
              INSERTED.UpdatedAt AS updatedAt

            VALUES (
              @organizationId,
              @userId
            );
          `);

        preferences = insertResult.recordset[0] ?? null;
      }

      await transaction.commit();

      return preferences;
    } catch (error) {
      await this.rollback(transaction);
      throw error;
    }
  }

  // =====================================================
  // UPDATE USER PREFERENCES
  //
  // Users can only update their own preferences.
  // Missing preferences are initialized with defaults.
  // Only supplied fields are changed.
  // =====================================================

  async update(
    organizationId: string,
    userId: string,
    data: UpdateNotificationPreferencesInput
  ) {
    const pool = await getDatabase();
    const transaction = new sql.Transaction(pool);

    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    try {
      const hasAccess = await this.hasAccess(
        transaction,
        organizationId,
        userId
      );

      if (!hasAccess) {
        await this.rollback(transaction);
        return null;
      }

      // Lock the user's preference row or key range.

      await transaction
        .request()
        .input("organizationId", sql.UniqueIdentifier, organizationId)
        .input("userId", sql.UniqueIdentifier, userId)
        .query(`
          SELECT
            NotificationPreferenceId

          FROM dbo.NotificationPreferences WITH (UPDLOCK, HOLDLOCK)

          WHERE OrganizationId = @organizationId
            AND UserId = @userId;
        `);

      // Initialize defaults if this is the first update.

      await transaction
        .request()
        .input("organizationId", sql.UniqueIdentifier, organizationId)
        .input("userId", sql.UniqueIdentifier, userId)
        .query(`
          IF NOT EXISTS (
            SELECT 1
            FROM dbo.NotificationPreferences
            WHERE OrganizationId = @organizationId
              AND UserId = @userId
          )
          BEGIN
            INSERT INTO dbo.NotificationPreferences (
              OrganizationId,
              UserId
            )
            VALUES (
              @organizationId,
              @userId
            );
          END;
        `);

      const result = await transaction
        .request()
        .input("organizationId", sql.UniqueIdentifier, organizationId)
        .input("userId", sql.UniqueIdentifier, userId)
        .input(
          "emailEnabledProvided",
          sql.Bit,
          data.emailEnabled !== undefined
        )
        .input(
          "emailEnabled",
          sql.Bit,
          data.emailEnabled ?? false
        )
        .input(
          "smsEnabledProvided",
          sql.Bit,
          data.smsEnabled !== undefined
        )
        .input(
          "smsEnabled",
          sql.Bit,
          data.smsEnabled ?? false
        )
        .input(
          "pushEnabledProvided",
          sql.Bit,
          data.pushEnabled !== undefined
        )
        .input(
          "pushEnabled",
          sql.Bit,
          data.pushEnabled ?? false
        )
        .input(
          "criticalAlertsOnlyProvided",
          sql.Bit,
          data.criticalAlertsOnly !== undefined
        )
        .input(
          "criticalAlertsOnly",
          sql.Bit,
          data.criticalAlertsOnly ?? false
        )
        .query(`
          UPDATE dbo.NotificationPreferences

          SET
            EmailEnabled = CASE
              WHEN @emailEnabledProvided = 1
              THEN @emailEnabled
              ELSE EmailEnabled
            END,

            SmsEnabled = CASE
              WHEN @smsEnabledProvided = 1
              THEN @smsEnabled
              ELSE SmsEnabled
            END,

            PushEnabled = CASE
              WHEN @pushEnabledProvided = 1
              THEN @pushEnabled
              ELSE PushEnabled
            END,

            CriticalAlertsOnly = CASE
              WHEN @criticalAlertsOnlyProvided = 1
              THEN @criticalAlertsOnly
              ELSE CriticalAlertsOnly
            END,

            UpdatedAt = SYSUTCDATETIME()

          OUTPUT
            INSERTED.NotificationPreferenceId
              AS notificationPreferenceId,
            INSERTED.OrganizationId AS organizationId,
            INSERTED.UserId AS userId,
            INSERTED.EmailEnabled AS emailEnabled,
            INSERTED.SmsEnabled AS smsEnabled,
            INSERTED.PushEnabled AS pushEnabled,
            INSERTED.CriticalAlertsOnly AS criticalAlertsOnly,
            INSERTED.CreatedAt AS createdAt,
            INSERTED.UpdatedAt AS updatedAt

          WHERE OrganizationId = @organizationId
            AND UserId = @userId;
        `);

      await transaction.commit();

      return result.recordset[0] ?? null;
    } catch (error) {
      await this.rollback(transaction);
      throw error;
    }
  }
}
