
import { getDatabase, sql } from "../../config/database";

import type {
  CreateDeviceInput,
  UpdateDeviceInput,
} from "./devices.validation";

import type { DeviceAccessContext } from "./devices.service";

// =====================================================
// SHARED HELPERS
// =====================================================

function getRolePermissions(role: string) {
  const normalizedRole = role.trim().toLowerCase();

  const isPrivileged =
    normalizedRole === "owner" ||
    normalizedRole === "administrator";

  return {
    isPrivileged,
  };
}

function addAccessParameters(request: any, context: DeviceAccessContext) {
  const permissions = getRolePermissions(context.role);

  return request
    .input("organizationId", sql.UniqueIdentifier, context.organizationId)
    .input("membershipId", sql.UniqueIdentifier, context.membershipId)
    .input("isPrivileged", sql.Bit, permissions.isPrivileged);
}

function installationDate(value?: string | null) {
  if (!value) return null;

  return new Date(`${value}T00:00:00.000Z`);
}

// =====================================================
// SHARED DEVICE SELECT
// =====================================================

const deviceSelect = `
  SELECT
    d.DeviceId AS deviceId,
    d.OrganizationId AS organizationId,
    d.PropertyId AS propertyId,
    d.ZoneId AS zoneId,
    d.GatewayId AS gatewayId,
    d.DeviceName AS deviceName,
    d.SerialNumber AS serialNumber,
    d.Manufacturer AS manufacturer,
    d.Model AS model,
    d.DeviceType AS deviceType,
    d.FirmwareVersion AS firmwareVersion,
    d.Status AS status,
    d.LastSeenAt AS lastSeenAt,
    d.InstalledAt AS installedAt,
    d.CreatedAt AS createdAt
  FROM dbo.Devices AS d
  INNER JOIN dbo.Properties AS p
    ON p.PropertyId = d.PropertyId
    AND p.OrganizationId = d.OrganizationId
  WHERE d.OrganizationId = @organizationId
`;

// =====================================================
// GET ALL DEVICES
// OWNER / ADMIN: ALL ORGANIZATION DEVICES
// MEMBER / VIEWER: ASSIGNED PROPERTIES ONLY
// =====================================================

export async function getAllDevices(context: DeviceAccessContext) {
  const pool = await getDatabase();

  const request = addAccessParameters(pool.request(), context);

  const result = await request.query(`
    ${deviceSelect}
      AND (
        @isPrivileged = 1
        OR EXISTS (
          SELECT 1
          FROM dbo.UserPropertyAccess AS upa
          INNER JOIN dbo.Memberships AS membership
            ON membership.MembershipId = upa.MembershipId
            AND membership.OrganizationId = @organizationId
          INNER JOIN dbo.Properties AS assignedProperty
            ON assignedProperty.PropertyId = upa.PropertyId
            AND assignedProperty.OrganizationId = @organizationId
          WHERE upa.MembershipId = @membershipId
            AND upa.PropertyId = d.PropertyId
        )
      )
    ORDER BY d.CreatedAt DESC;
  `);

  return result.recordset;
}

// =====================================================
// GET DEVICE BY ID
// =====================================================

export async function getDeviceById(
  deviceId: string,
  context: DeviceAccessContext
) {
  const pool = await getDatabase();

  const request = addAccessParameters(pool.request(), context);

  const result = await request
    .input("deviceId", sql.UniqueIdentifier, deviceId)
    .query(`
      ${deviceSelect}
        AND d.DeviceId = @deviceId
        AND (
          @isPrivileged = 1
          OR EXISTS (
            SELECT 1
            FROM dbo.UserPropertyAccess AS upa
            INNER JOIN dbo.Memberships AS membership
              ON membership.MembershipId = upa.MembershipId
              AND membership.OrganizationId = @organizationId
            INNER JOIN dbo.Properties AS assignedProperty
              ON assignedProperty.PropertyId = upa.PropertyId
              AND assignedProperty.OrganizationId = @organizationId
            WHERE upa.MembershipId = @membershipId
              AND upa.PropertyId = d.PropertyId
          )
        );
    `);

  return result.recordset[0] ?? null;
}

// =====================================================
// CREATE DEVICE
// OWNER AND ADMINISTRATOR ONLY
//
// PROPERTY, ZONE AND GATEWAY MUST ALL BELONG
// TO THE SAME ORGANIZATION AND PROPERTY.
// =====================================================

export async function createDevice(
  data: CreateDeviceInput,
  organizationId: string
) {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input("OrganizationId", sql.UniqueIdentifier, organizationId)
    .input("PropertyId", sql.UniqueIdentifier, data.propertyId)
    .input("ZoneId", sql.UniqueIdentifier, data.zoneId || null)
    .input("GatewayId", sql.UniqueIdentifier, data.gatewayId || null)
    .input("DeviceName", sql.NVarChar(150), data.deviceName)
    .input("SerialNumber", sql.NVarChar(150), data.serialNumber)
    .input("Manufacturer", sql.NVarChar(100), data.manufacturer || null)
    .input("Model", sql.NVarChar(100), data.model || null)
    .input("DeviceType", sql.NVarChar(50), data.deviceType)
    .input("FirmwareVersion", sql.NVarChar(100), data.firmwareVersion || null)
    .input("Status", sql.NVarChar(30), data.status)
    .input("InstalledAt", sql.DateTime2, installationDate(data.installedAt))
    .query(`
      INSERT INTO dbo.Devices (
        OrganizationId,
        PropertyId,
        ZoneId,
        GatewayId,
        DeviceName,
        SerialNumber,
        Manufacturer,
        Model,
        DeviceType,
        FirmwareVersion,
        Status,
        InstalledAt
      )
      OUTPUT
        INSERTED.DeviceId AS deviceId,
        INSERTED.OrganizationId AS organizationId,
        INSERTED.PropertyId AS propertyId,
        INSERTED.ZoneId AS zoneId,
        INSERTED.GatewayId AS gatewayId,
        INSERTED.DeviceName AS deviceName,
        INSERTED.SerialNumber AS serialNumber,
        INSERTED.Manufacturer AS manufacturer,
        INSERTED.Model AS model,
        INSERTED.DeviceType AS deviceType,
        INSERTED.FirmwareVersion AS firmwareVersion,
        INSERTED.Status AS status,
        INSERTED.LastSeenAt AS lastSeenAt,
        INSERTED.InstalledAt AS installedAt,
        INSERTED.CreatedAt AS createdAt
      SELECT
        @OrganizationId,
        p.PropertyId,
        @ZoneId,
        @GatewayId,
        @DeviceName,
        @SerialNumber,
        @Manufacturer,
        @Model,
        @DeviceType,
        @FirmwareVersion,
        @Status,
        @InstalledAt
      FROM dbo.Properties AS p
      WHERE p.PropertyId = @PropertyId
        AND p.OrganizationId = @OrganizationId

        -- A supplied zone must belong to the selected property.
        AND (
          @ZoneId IS NULL
          OR EXISTS (
            SELECT 1
            FROM dbo.PropertyZones AS z
            INNER JOIN dbo.Properties AS zoneProperty
              ON zoneProperty.PropertyId = z.PropertyId
              AND zoneProperty.OrganizationId = @OrganizationId
            WHERE z.ZoneId = @ZoneId
              AND z.PropertyId = @PropertyId
          )
        )

        -- A supplied gateway must belong to the same
        -- organization and selected property.
        AND (
          @GatewayId IS NULL
          OR EXISTS (
            SELECT 1
            FROM dbo.Gateways AS g
            WHERE g.GatewayId = @GatewayId
              AND g.OrganizationId = @OrganizationId
              AND g.PropertyId = @PropertyId
          )
        );
    `);

  return result.recordset[0] ?? null;
}

// =====================================================
// UPDATE DEVICE
// OWNER AND ADMINISTRATOR ONLY
//
// EXISTING DEVICE AND ALL NEW RELATIONSHIPS MUST
// BELONG TO THE VERIFIED ORGANIZATION.
// =====================================================

export async function updateDevice(
  deviceId: string,
  organizationId: string,
  data: UpdateDeviceInput
) {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input("DeviceId", sql.UniqueIdentifier, deviceId)
    .input("OrganizationId", sql.UniqueIdentifier, organizationId)
    .input("PropertyId", sql.UniqueIdentifier, data.propertyId)
    .input("ZoneId", sql.UniqueIdentifier, data.zoneId || null)
    .input("GatewayId", sql.UniqueIdentifier, data.gatewayId || null)
    .input("DeviceName", sql.NVarChar(150), data.deviceName)
    .input("SerialNumber", sql.NVarChar(150), data.serialNumber)
    .input("Manufacturer", sql.NVarChar(100), data.manufacturer || null)
    .input("Model", sql.NVarChar(100), data.model || null)
    .input("DeviceType", sql.NVarChar(50), data.deviceType)
    .input("FirmwareVersion", sql.NVarChar(100), data.firmwareVersion || null)
    .input("Status", sql.NVarChar(30), data.status)
    .input("InstalledAt", sql.DateTime2, installationDate(data.installedAt))
    .query(`
      UPDATE d
      SET
        PropertyId = @PropertyId,
        ZoneId = @ZoneId,
        GatewayId = @GatewayId,
        DeviceName = @DeviceName,
        SerialNumber = @SerialNumber,
        Manufacturer = @Manufacturer,
        Model = @Model,
        DeviceType = @DeviceType,
        FirmwareVersion = @FirmwareVersion,
        Status = @Status,
        InstalledAt = @InstalledAt
      OUTPUT
        INSERTED.DeviceId AS deviceId,
        INSERTED.OrganizationId AS organizationId,
        INSERTED.PropertyId AS propertyId,
        INSERTED.ZoneId AS zoneId,
        INSERTED.GatewayId AS gatewayId,
        INSERTED.DeviceName AS deviceName,
        INSERTED.SerialNumber AS serialNumber,
        INSERTED.Manufacturer AS manufacturer,
        INSERTED.Model AS model,
        INSERTED.DeviceType AS deviceType,
        INSERTED.FirmwareVersion AS firmwareVersion,
        INSERTED.Status AS status,
        INSERTED.LastSeenAt AS lastSeenAt,
        INSERTED.InstalledAt AS installedAt,
        INSERTED.CreatedAt AS createdAt
      FROM dbo.Devices AS d
      WHERE d.DeviceId = @DeviceId
        AND d.OrganizationId = @OrganizationId

        -- Verify the existing device property.
        AND EXISTS (
          SELECT 1
          FROM dbo.Properties AS currentProperty
          WHERE currentProperty.PropertyId = d.PropertyId
            AND currentProperty.OrganizationId = @OrganizationId
        )

        -- Verify the new property.
        AND EXISTS (
          SELECT 1
          FROM dbo.Properties AS targetProperty
          WHERE targetProperty.PropertyId = @PropertyId
            AND targetProperty.OrganizationId = @OrganizationId
        )

        -- Verify the new zone belongs to the new property.
        AND (
          @ZoneId IS NULL
          OR EXISTS (
            SELECT 1
            FROM dbo.PropertyZones AS z
            INNER JOIN dbo.Properties AS zoneProperty
              ON zoneProperty.PropertyId = z.PropertyId
              AND zoneProperty.OrganizationId = @OrganizationId
            WHERE z.ZoneId = @ZoneId
              AND z.PropertyId = @PropertyId
          )
        )

        -- Verify the new gateway belongs to the new property
        -- and the authenticated organization.
        AND (
          @GatewayId IS NULL
          OR EXISTS (
            SELECT 1
            FROM dbo.Gateways AS g
            WHERE g.GatewayId = @GatewayId
              AND g.OrganizationId = @OrganizationId
              AND g.PropertyId = @PropertyId
          )
        );
    `);

  return result.recordset[0] ?? null;
}

// =====================================================
// DELETE DEVICE
// OWNER AND ADMINISTRATOR ONLY
// =====================================================

export async function deleteDevice(
  deviceId: string,
  organizationId: string
) {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input("DeviceId", sql.UniqueIdentifier, deviceId)
    .input("OrganizationId", sql.UniqueIdentifier, organizationId)
    .query(`
      DELETE d
      OUTPUT DELETED.DeviceId AS deviceId
      FROM dbo.Devices AS d
      INNER JOIN dbo.Properties AS p
        ON p.PropertyId = d.PropertyId
        AND p.OrganizationId = @OrganizationId
      WHERE d.DeviceId = @DeviceId
        AND d.OrganizationId = @OrganizationId;
    `);

  return result.recordset[0] ?? null;
}
