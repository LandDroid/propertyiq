
"use client";

import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/components/auth/AuthProvider";

import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Download,
  FileBarChart,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";

import { useCallback, useEffect, useMemo, useState } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1";

type Property = {
  propertyId: string;
  propertyName: string;
  propertyType: string;
  status: string;
  city?: string;
};

type Device = {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  status: string;
  propertyId: string;
  propertyName?: string;
  lastSeenAt?: string;
};

type Alert = {
  alertId: string;
  title: string;
  severity: string;
  status: string;
  propertyName?: string;
  triggeredAt: string;
};

type ReportData = {
  properties: Property[];
  devices: Device[];
  alerts: Alert[];
};

type Period = "7" | "30" | "90" | "all";

type ApiFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

function value(
  item: Record<string, unknown>,
  camel: string,
  pascal: string
) {
  return item[camel] ?? item[pascal];
}

function normalizeRows<T>(
  rows: unknown[],
  type: "property" | "device" | "alert"
): T[] {
  return rows.map((raw) => {
    const item = raw as Record<string, unknown>;

    if (type === "property") {
      return {
        propertyId: String(value(item, "propertyId", "PropertyId") ?? ""),
        propertyName: String(
          value(item, "propertyName", "PropertyName") ?? "Unnamed property"
        ),
        propertyType: String(
          value(item, "propertyType", "PropertyType") ?? "Other"
        ),
        status: String(value(item, "status", "Status") ?? "Unknown"),
        city: String(value(item, "city", "City") ?? ""),
      } as T;
    }

    if (type === "device") {
      return {
        deviceId: String(value(item, "deviceId", "DeviceId") ?? ""),
        deviceName: String(
          value(item, "deviceName", "DeviceName") ?? "Unnamed device"
        ),
        deviceType: String(
          value(item, "deviceType", "DeviceType") ?? "Other"
        ),
        status: String(value(item, "status", "Status") ?? "Unknown"),
        propertyId: String(value(item, "propertyId", "PropertyId") ?? ""),
        propertyName: String(
          value(item, "propertyName", "PropertyName") ?? ""
        ),
        lastSeenAt: String(value(item, "lastSeenAt", "LastSeenAt") ?? ""),
      } as T;
    }

    return {
      alertId: String(value(item, "alertId", "AlertId") ?? ""),
      title: String(value(item, "title", "Title") ?? "Untitled alert"),
      severity: String(value(item, "severity", "Severity") ?? "Unknown"),
      status: String(value(item, "status", "Status") ?? "Unknown"),
      propertyName: String(
        value(item, "propertyName", "PropertyName") ?? ""
      ),
      triggeredAt: String(
        value(item, "triggeredAt", "TriggeredAt") ?? ""
      ),
    } as T;
  });
}

async function fetchRows<T>(
  apiFetch: ApiFetch,
  endpoint: string,
  organizationId: string,
  type: "property" | "device" | "alert"
): Promise<T[]> {
  const response = await apiFetch(
    `${API_URL}/${endpoint}?organizationId=${encodeURIComponent(
      organizationId
    )}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  const result = await response.json().catch(() => null);

  if (!response.ok || result?.success === false) {
    throw new Error(
      result?.message || `Unable to load ${endpoint}.`
    );
  }

  const rows = Array.isArray(result?.data) ? result.data : [];

  return normalizeRows<T>(rows, type);
}

function formatDate(dateString: string) {
  if (!dateString) return "—";

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function exportCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const {
    apiFetch,
    memberships,
    isLoading: authLoading,
    isAuthenticated,
  } = useAuth();

  // Use the signed-in user's organization.
  // Do not hardcode the Demo Organization ID.
  const organizationId = memberships[0]?.organizationId;

  const [data, setData] = useState<ReportData>({
    properties: [],
    devices: [],
    alerts: [],
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [period, setPeriod] = useState<Period>("30");

  const [filteredAlerts, setFilteredAlerts] = useState<Alert[]>([]);

  const loadReports = useCallback(
    async (refresh = false) => {
      if (authLoading) return;

      if (!isAuthenticated) {
        setLoading(false);
        setRefreshing(false);
        setErrors(["Please log in to view reports."]);
        return;
      }

      if (!organizationId) {
        setLoading(false);
        setRefreshing(false);
        setErrors([
          "Your account is not currently linked to an organization.",
        ]);
        return;
      }

      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setErrors([]);

      try {
        const results = await Promise.allSettled([
          fetchRows<Property>(
            apiFetch,
            "properties",
            organizationId,
            "property"
          ),
          fetchRows<Device>(
            apiFetch,
            "devices",
            organizationId,
            "device"
          ),
          fetchRows<Alert>(
            apiFetch,
            "alerts",
            organizationId,
            "alert"
          ),
        ]);

        const nextErrors: string[] = [];

        const properties =
          results[0].status === "fulfilled"
            ? results[0].value
            : (nextErrors.push("Properties could not be loaded."), []);

        const devices =
          results[1].status === "fulfilled"
            ? results[1].value
            : (nextErrors.push("Devices could not be loaded."), []);

        const alerts =
          results[2].status === "fulfilled"
            ? results[2].value
            : (nextErrors.push("Alerts could not be loaded."), []);

        setData({ properties, devices, alerts });
        setErrors(nextErrors);
      } catch {
        setErrors(["Unable to load report data. Please try again."]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      apiFetch,
      authLoading,
      isAuthenticated,
      organizationId,
    ]
  );

  useEffect(() => {
    if (!authLoading) {
      loadReports();
    }
  }, [authLoading, loadReports]);

  useEffect(() => {
    if (period === "all") {
      setFilteredAlerts(data.alerts);
      return;
    }

    const days = Number(period);
    const cutoff = new Date();

    cutoff.setDate(cutoff.getDate() - days);

    const filtered = data.alerts.filter((alert) => {
      if (!alert.triggeredAt) return false;

      const date = new Date(alert.triggeredAt);

      return !Number.isNaN(date.getTime()) && date >= cutoff;
    });

    setFilteredAlerts(filtered);
  }, [data.alerts, period]);

  const stats = useMemo(() => {
    const online = data.devices.filter(
      (device) => device.status.toLowerCase() === "online"
    ).length;

    const offline = data.devices.filter(
      (device) => device.status.toLowerCase() === "offline"
    ).length;

    const openAlerts = filteredAlerts.filter(
      (alert) => alert.status.toLowerCase() === "open"
    ).length;

    const criticalAlerts = filteredAlerts.filter(
      (alert) =>
        alert.severity.toLowerCase() === "critical" &&
        alert.status.toLowerCase() !== "resolved"
    ).length;

    const activeProperties = data.properties.filter(
      (property) => property.status.toLowerCase() === "active"
    ).length;

    return {
      properties: data.properties.length,
      activeProperties,
      devices: data.devices.length,
      online,
      offline,
      openAlerts,
      criticalAlerts,
      resolvedAlerts: filteredAlerts.filter(
        (alert) => alert.status.toLowerCase() === "resolved"
      ).length,
    };
  }, [data, filteredAlerts]);

  const propertyReport = useMemo(() => {
    return data.properties.map((property) => {
      const propertyDevices = data.devices.filter(
        (device) => device.propertyId === property.propertyId
      );

      const propertyAlerts = filteredAlerts.filter(
        (alert) =>
          alert.propertyName?.toLowerCase() ===
          property.propertyName.toLowerCase()
      );

      return {
        ...property,
        devices: propertyDevices.length,
        online: propertyDevices.filter(
          (device) => device.status.toLowerCase() === "online"
        ).length,
        alerts: propertyAlerts.length,
      };
    });
  }, [data, filteredAlerts]);

  const severityCounts = useMemo(() => {
    return {
      critical: filteredAlerts.filter(
        (alert) => alert.severity.toLowerCase() === "critical"
      ).length,
      warning: filteredAlerts.filter(
        (alert) => alert.severity.toLowerCase() === "warning"
      ).length,
      info: filteredAlerts.filter(
        (alert) =>
          ["info", "information"].includes(
            alert.severity.toLowerCase()
          )
      ).length,
    };
  }, [filteredAlerts]);

  const maxSeverity = Math.max(
    severityCounts.critical,
    severityCounts.warning,
    severityCounts.info,
    1
  );

  function downloadPropertyReport() {
    const rows = [
      ["Property", "Type", "Status", "Devices", "Online Devices", "Alerts"],
      ...propertyReport.map((property) => [
        property.propertyName,
        property.propertyType,
        property.status,
        String(property.devices),
        String(property.online),
        String(property.alerts),
      ]),
    ];

    exportCsv("propertyiq-property-report.csv", rows);
  }

  function downloadAlertReport() {
    const rows = [
      ["Alert", "Property", "Severity", "Status", "Triggered"],
      ...filteredAlerts.map((alert) => [
        alert.title,
        alert.propertyName || "",
        alert.severity,
        alert.status,
        formatDate(alert.triggeredAt),
      ]),
    ];

    exportCsv("propertyiq-alert-report.csv", rows);
  }

  return (
    <AppLayout>
      <div className="piq-page">
        <div className="piq-page-header">
          <div>
            <div className="piq-breadcrumb">
              Dashboard <span>/</span> Reports
            </div>

            <h1 className="piq-page-title">Reports</h1>

            <p className="piq-page-subtitle">
              Understand property performance, device health,
              and alert activity.
            </p>
          </div>

          <button
            type="button"
            className="piq-btn piq-btn-outline"
            onClick={() => loadReports(true)}
            disabled={loading || refreshing || authLoading}
          >
            <RefreshCw
              size={16}
              className={refreshing ? "piq-spinning" : ""}
            />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {errors.length > 0 && (
          <div className="piq-report-error">
            <AlertTriangle size={18} />
            <div>
              <strong>Some report data could not be loaded.</strong>
              {errors.map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          </div>
        )}

        <div className="piq-report-toolbar">
          <div>
            <strong>Reporting period</strong>
            <span>Applies to alert activity</span>
          </div>

          <select
            value={period}
            onChange={(event) =>
              setPeriod(event.target.value as Period)
            }
            aria-label="Select reporting period"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All available time</option>
          </select>
        </div>

        {/* Summary cards */}
        <div className="row g-3 mb-4">
          <div className="col-12 col-sm-6 col-xl-3">
            <div className="piq-card piq-report-stat">
              <div>
                <span className="piq-stat-label">Properties</span>
                <div className="piq-stat-value">
                  {loading ? "—" : stats.properties}
                </div>
                <span className="piq-stat-description">
                  {stats.activeProperties} active
                </span>
              </div>
              <div className="piq-stat-icon piq-stat-icon-blue">
                <Building2 size={22} />
              </div>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <div className="piq-card piq-report-stat">
              <div>
                <span className="piq-stat-label">Registered Devices</span>
                <div className="piq-stat-value">
                  {loading ? "—" : stats.devices}
                </div>
                <span className="piq-stat-description">
                  {stats.online} currently online
                </span>
              </div>
              <div className="piq-stat-icon piq-stat-icon-green">
                <Activity size={22} />
              </div>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <div className="piq-card piq-report-stat">
              <div>
                <span className="piq-stat-label">Open Alerts</span>
                <div className="piq-stat-value">
                  {loading ? "—" : stats.openAlerts}
                </div>
                <span className="piq-stat-description">
                  {stats.criticalAlerts} unresolved critical
                </span>
              </div>
              <div className="piq-stat-icon piq-stat-icon-orange">
                <AlertTriangle size={22} />
              </div>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <div className="piq-card piq-report-stat">
              <div>
                <span className="piq-stat-label">Resolved Alerts</span>
                <div className="piq-stat-value">
                  {loading ? "—" : stats.resolvedAlerts}
                </div>
                <span className="piq-stat-description">
                  In selected period
                </span>
              </div>
              <div className="piq-stat-icon piq-stat-icon-green">
                <CheckCircle2 size={22} />
              </div>
            </div>
          </div>
        </div>

        {/* Device health and alert breakdown */}
        <div className="row g-3 mb-4">
          <div className="col-12 col-lg-6">
            <div className="piq-card piq-report-card">
              <div className="piq-report-card-heading">
                <div>
                  <h2>Device Health</h2>
                  <p>Current device connectivity</p>
                </div>
                <Wifi size={20} />
              </div>

              <div className="piq-report-health-total">
                <strong>{loading ? "—" : stats.devices}</strong>
                <span>Total registered devices</span>
              </div>

              <div className="piq-report-progress">
                <div
                  className="piq-report-progress-online"
                  style={{
                    width: `${
                      stats.devices
                        ? (stats.online / stats.devices) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>

              <div className="piq-report-legend">
                <span>
                  <i className="piq-dot piq-dot-green" />
                  Online <strong>{stats.online}</strong>
                </span>
                <span>
                  <i className="piq-dot piq-dot-red" />
                  Offline <strong>{stats.offline}</strong>
                </span>
                <span>
                  <i className="piq-dot piq-dot-gray" />
                  Other{" "}
                  <strong>
                    {Math.max(
                      0,
                      stats.devices - stats.online - stats.offline
                    )}
                  </strong>
                </span>
              </div>

              <div className="piq-report-note">
                <WifiOff size={15} />
                Device status reflects the latest status saved in the database.
              </div>
            </div>
          </div>

          <div className="col-12 col-lg-6">
            <div className="piq-card piq-report-card">
              <div className="piq-report-card-heading">
                <div>
                  <h2>Alert Breakdown</h2>
                  <p>Alerts by severity in the selected period</p>
                </div>
                <FileBarChart size={20} />
              </div>

              {[
                {
                  label: "Critical",
                  count: severityCounts.critical,
                  className: "piq-bar-critical",
                },
                {
                  label: "Warning",
                  count: severityCounts.warning,
                  className: "piq-bar-warning",
                },
                {
                  label: "Information",
                  count: severityCounts.info,
                  className: "piq-bar-info",
                },
              ].map((item) => (
                <div className="piq-report-bar-row" key={item.label}>
                  <div className="piq-report-bar-label">
                    <span>{item.label}</span>
                    <strong>{item.count}</strong>
                  </div>
                  <div className="piq-report-bar-track">
                    <div
                      className={`piq-report-bar-fill ${item.className}`}
                      style={{
                        width: `${(item.count / maxSeverity) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}

              <div className="piq-report-note">
                Alert totals are based on records returned by the Alerts API.
              </div>
            </div>
          </div>
        </div>

        {/* Property performance */}
        <div className="piq-card piq-report-table-card mb-4">
          <div className="piq-report-table-heading">
            <div>
              <h2>Property Performance</h2>
              <p>Device coverage and alert activity by property</p>
            </div>

            <button
              type="button"
              className="piq-btn piq-btn-outline piq-btn-small"
              onClick={downloadPropertyReport}
              disabled={propertyReport.length === 0}
            >
              <Download size={15} />
              Export CSV
            </button>
          </div>

          <div className="table-responsive">
            <table className="table piq-report-table align-middle">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Devices</th>
                  <th>Online</th>
                  <th>Alerts</th>
                </tr>
              </thead>
              <tbody>
                {propertyReport.map((property) => (
                  <tr key={property.propertyId}>
                    <td>
                      <strong>{property.propertyName}</strong>
                      {property.city && <small>{property.city}</small>}
                    </td>
                    <td>{property.propertyType}</td>
                    <td>
                      <span className="piq-report-status">
                        {property.status}
                      </span>
                    </td>
                    <td>{property.devices}</td>
                    <td>{property.online}</td>
                    <td>{property.alerts}</td>
                  </tr>
                ))}

                {!loading && propertyReport.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-5">
                      No property records available yet.
                    </td>
                  </tr>
                )}

                {loading && (
                  <tr>
                    <td colSpan={6} className="text-center py-5">
                      Loading property report...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent alert report */}
        <div className="piq-card piq-report-table-card">
          <div className="piq-report-table-heading">
            <div>
              <h2>Recent Alert Activity</h2>
              <p>Latest alerts in the selected reporting period</p>
            </div>

            <button
              type="button"
              className="piq-btn piq-btn-outline piq-btn-small"
              onClick={downloadAlertReport}
              disabled={filteredAlerts.length === 0}
            >
              <Download size={15} />
              Export CSV
            </button>
          </div>

          <div className="table-responsive">
            <table className="table piq-report-table align-middle">
              <thead>
                <tr>
                  <th>Alert</th>
                  <th>Property</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {[...filteredAlerts]
                  .sort(
                    (a, b) =>
                      new Date(b.triggeredAt).getTime() -
                      new Date(a.triggeredAt).getTime()
                  )
                  .slice(0, 10)
                  .map((alert) => (
                    <tr key={alert.alertId}>
                      <td>
                        <strong>{alert.title}</strong>
                      </td>
                      <td>{alert.propertyName || "—"}</td>
                      <td>
                        <span
                          className={`piq-report-severity piq-report-severity-${alert.severity.toLowerCase()}`}
                        >
                          {alert.severity}
                        </span>
                      </td>
                      <td>{alert.status}</td>
                      <td>{formatDate(alert.triggeredAt)}</td>
                    </tr>
                  ))}

                {!loading && filteredAlerts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-5">
                      No alerts in this reporting period.
                    </td>
                  </tr>
                )}

                {loading && (
                  <tr>
                    <td colSpan={5} className="text-center py-5">
                      Loading alert report...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
