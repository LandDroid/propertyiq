import { getDatabase, sql } from "../../config/database";
import type { CreateTelemetryInput } from "./telemetry.validation";

export class TelemetryRepository {
  // =====================================================
  // CREATE TELEMETRY READING
  // =====================================================

  async create(
    data: CreateTelemetryInput
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input(
        "SensorId",
        sql.UniqueIdentifier,
        data.sensorId
      )
      .input(
        "NumericValue",
        sql.Decimal(18, 4),
        data.numericValue ?? null
      )
      .input(
        "TextValue",
        sql.NVarChar(500),
        data.textValue ?? null
      )
      .input(
        "Unit",
        sql.NVarChar(50),
        data.unit ?? null
      )
      .query(`
        INSERT INTO dbo.Telemetry
        (
          SensorId,
          NumericValue,
          TextValue,
          Unit
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @SensorId,
          @NumericValue,
          @TextValue,
          @Unit
        );
      `);

    return result.recordset[0] ?? null;
  }

  // =====================================================
  // GET LATEST READING
  // =====================================================

  async getLatest(
    sensorId: string
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input(
        "SensorId",
        sql.UniqueIdentifier,
        sensorId
      )
      .query(`
        SELECT TOP 1
          TelemetryId,
          SensorId,
          RecordedAt,
          NumericValue,
          TextValue,
          Unit
        FROM dbo.Telemetry
        WHERE SensorId = @SensorId
        ORDER BY RecordedAt DESC;
      `);

    return result.recordset[0] ?? null;
  }

  // =====================================================
  // GET HISTORY
  // =====================================================

  async getHistory(
    sensorId: string,
    limit = 100
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input(
        "SensorId",
        sql.UniqueIdentifier,
        sensorId
      )
      .input(
        "Limit",
        sql.Int,
        limit
      )
      .query(`
        SELECT TOP (@Limit)
          TelemetryId,
          SensorId,
          RecordedAt,
          NumericValue,
          TextValue,
          Unit
        FROM dbo.Telemetry
        WHERE SensorId = @SensorId
        ORDER BY RecordedAt DESC;
      `);

    return result.recordset;
  }

  // =====================================================
  // VALIDATE SENSOR ACCESS
  // =====================================================

  async getSensor(
    sensorId: string,
    organizationId: string,
    userId: string
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input(
        "SensorId",
        sql.UniqueIdentifier,
        sensorId
      )
      .input(
        "OrganizationId",
        sql.UniqueIdentifier,
        organizationId
      )
      .input(
        "UserId",
        sql.UniqueIdentifier,
        userId
      )
      .query(`
        SELECT TOP 1
          s.SensorId,
          s.SensorName,
          s.SensorType,
          s.Status,

          d.DeviceId,
          d.DeviceName,

          p.PropertyId,
          p.PropertyName

        FROM dbo.Sensors s

        INNER JOIN dbo.Devices d
          ON d.DeviceId = s.DeviceId

        INNER JOIN dbo.Properties p
          ON p.PropertyId = d.PropertyId

        INNER JOIN dbo.Memberships m
          ON m.OrganizationId = p.OrganizationId

        LEFT JOIN dbo.UserPropertyAccess upa
          ON upa.MembershipId = m.MembershipId
          AND upa.PropertyId = p.PropertyId

        WHERE
          s.SensorId = @SensorId
          AND p.OrganizationId = @OrganizationId
          AND m.UserId = @UserId
          AND (
            LOWER(LTRIM(RTRIM(m.Role)))
            IN ('owner', 'administrator')

            OR

            upa.AccessId IS NOT NULL
          );
      `);

    return result.recordset[0] ?? null;
  }

  // =====================================================
  // GET PROPERTY DASHBOARD READINGS
  // =====================================================

  async getPropertyReadings(
    propertyId: string,
    organizationId: string,
    userId: string
  ) {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input(
        "PropertyId",
        sql.UniqueIdentifier,
        propertyId
      )
      .input(
        "OrganizationId",
        sql.UniqueIdentifier,
        organizationId
      )
      .input(
        "UserId",
        sql.UniqueIdentifier,
        userId
      )
      .query(`
        SELECT

          p.PropertyId,
          p.PropertyName,

          d.DeviceId,
          d.DeviceName,

          s.SensorId,
          s.SensorName,
          s.SensorType,

          t.NumericValue,
          t.TextValue,
          t.Unit,

          t.RecordedAt

        FROM dbo.Properties p

        INNER JOIN dbo.Devices d
          ON d.PropertyId = p.PropertyId

        INNER JOIN dbo.Sensors s
          ON s.DeviceId = d.DeviceId

        OUTER APPLY
        (
          SELECT TOP 1 *
          FROM dbo.Telemetry tt
          WHERE tt.SensorId = s.SensorId
          ORDER BY tt.RecordedAt DESC
        ) t

        INNER JOIN dbo.Memberships m
          ON m.OrganizationId = p.OrganizationId

        LEFT JOIN dbo.UserPropertyAccess upa
          ON upa.MembershipId = m.MembershipId
          AND upa.PropertyId = p.PropertyId

        WHERE
          p.PropertyId = @PropertyId
          AND p.OrganizationId = @OrganizationId
          AND m.UserId = @UserId
          AND (
            LOWER(LTRIM(RTRIM(m.Role)))
            IN ('owner', 'administrator')

            OR

            upa.AccessId IS NOT NULL
          )

        ORDER BY
          d.DeviceName,
          s.SensorName;
      `);

    return result.recordset;
  }
}