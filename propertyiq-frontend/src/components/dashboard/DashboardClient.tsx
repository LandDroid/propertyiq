"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/components/auth/AuthProvider";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Cpu,
  LogOut,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3000/api/v1";

// =====================================================
// TYPES
// =====================================================

type Property = {
  propertyId: string;
  propertyName: string;
  propertyType: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  timeZone: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
};

type Device = {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  serialNumber: string;
  status: string;
  propertyName: string;
};

type Alert = {
  alertId: string;
  title: string;
  message: string;
  severity: string;
  status: string;
  triggeredAt: string;
  propertyName: string;
  deviceName: string;
};

type DashboardData = {
  properties: Property[];
  devices: Device[];
  alerts: Alert[];
};

type OrganizationOption = {
  organizationId: string;
  organizationName: string;
  role: string;
};

type DashboardLoadResult = {
  data: DashboardData;
  failures: number;
};

type ApiResult = {
  success?: boolean;
  message?: string;
  data?: unknown;
};

const emptyDashboardData: DashboardData = {
  properties: [],
  devices: [],
  alerts: [],
};

// =====================================================
// NORMALIZATION HELPERS
// =====================================================

function getValue(
  item: Record<string, unknown>,
  camel: string,
  pascal: string
): unknown {
  return item[camel] ?? item[pascal] ?? "";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function asString(value: unknown, fallback = ""): string {
  return value === null || value === undefined || value === ""
    ? fallback
    : String(value);
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMemberships(data: unknown): OrganizationOption[] {
  if (!Array.isArray(data)) return [];

  return data
    .map((value) => {
      const item = asRecord(value);

      return {
        organizationId: asString(
          getValue(item, "organizationId", "OrganizationId")
        ),
        organizationName: asString(
          getValue(item, "organizationName", "OrganizationName"),
          "My organization"
        ),
        role: asString(getValue(item, "role", "Role"), "Member"),
      };
    })
    .filter((item) => item.organizationId.length > 0);
}

function normalizeProperties(data: unknown): Property[] {
  if (!Array.isArray(data)) return [];

  return data.map((value) => {
    const item = asRecord(value);

    return {
      propertyId: asString(
        getValue(item, "propertyId", "PropertyId")
      ),
      propertyName: asString(
        getValue(item, "propertyName", "PropertyName"),
        "Unnamed property"
      ),
      propertyType: asString(
        getValue(item, "propertyType", "PropertyType"),
        "other"
      ),
      address: asString(getValue(item, "address", "Address")),
      city: asString(getValue(item, "city", "City")),
      province: asString(getValue(item, "province", "Province")),
      postalCode: asString(
        getValue(item, "postalCode", "PostalCode")
      ),
      country: asString(
        getValue(item, "country", "Country"),
        "Canada"
      ),
      timeZone: asString(
        getValue(item, "timeZone", "TimeZone"),
        "America/Toronto"
      ),
      latitude: asNullableNumber(
        getValue(item, "latitude", "Latitude")
      ),
      longitude: asNullableNumber(
        getValue(item, "longitude", "Longitude")
      ),
      status: asString(
        getValue(item, "status", "Status"),
        "Active"
      ),
    };
  });
}

function normalizeDevices(data: unknown): Device[] {
  if (!Array.isArray(data)) return [];

  return data.map((value) => {
    const item = asRecord(value);

    return {
      deviceId: asString(getValue(item, "deviceId", "DeviceId")),
      deviceName: asString(
        getValue(item, "deviceName", "DeviceName"),
        "Unnamed device"
      ),
      deviceType: asString(
        getValue(item, "deviceType", "DeviceType")
      ),
      serialNumber: asString(
        getValue(item, "serialNumber", "SerialNumber")
      ),
      status: asString(
        getValue(item, "status", "Status"),
        "offline"
      ),
      propertyName: asString(
        getValue(item, "propertyName", "PropertyName")
      ),
    };
  });
}

function normalizeAlerts(data: unknown): Alert[] {
  if (!Array.isArray(data)) return [];

  return data.map((value) => {
    const item = asRecord(value);

    return {
      alertId: asString(
        getValue(item, "alertId", "AlertId") ||
          getValue(item, "id", "Id")
      ),
      title: asString(
        getValue(item, "title", "Title"),
        "Property alert"
      ),
      message: asString(getValue(item, "message", "Message")),
      severity: asString(
        getValue(item, "severity", "Severity"),
        "medium"
      ),
      status: asString(
        getValue(item, "status", "Status"),
        "open"
      ),
      triggeredAt: asString(
        getValue(item, "triggeredAt", "TriggeredAt")
      ),
      propertyName: asString(
        getValue(item, "propertyName", "PropertyName")
      ),
      deviceName: asString(
        getValue(item, "deviceName", "DeviceName")
      ),
    };
  });
}

function formatDate(value?: string): string {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleString();
}

function formatPropertyType(value: string): string {
  if (!value) return "Other";

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatPropertyLocation(property: Property): string {
  return [
    property.address,
    property.city,
    property.province,
    property.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

function isOpenAlert(alert: Alert): boolean {
  return !["resolved", "closed", "dismissed"].includes(
    alert.status.toLowerCase()
  );
}

function getSeverityClass(severity: string): string {
  switch (severity.toLowerCase()) {
    case "critical":
      return "text-bg-danger";
    case "high":
      return "text-bg-warning";
    case "medium":
      return "text-bg-primary";
    case "low":
      return "text-bg-secondary";
    default:
      return "text-bg-secondary";
  }
}

function getPropertyStatusClass(status: string): string {
  switch (status.toLowerCase()) {
    case "active":
      return "text-bg-success";
    case "pending":
      return "text-bg-warning";
    default:
      return "text-bg-secondary";
  }
}

// =====================================================
// STAT CARD
// =====================================================

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  color,
  href,
}: {
  title: string;
  value: number;
  description: string;
  icon: LucideIcon;
  color: string;
  href: string;
}) {
  return (
    <Link href={href} className="text-decoration-none text-reset">
      <div className="card border-0 shadow-sm h-100 dashboard-stat-card">
        <div className="card-body p-4">
          <div className="d-flex justify-content-between align-items-start gap-3">
            <div>
              <div className="text-muted small mb-2">{title}</div>
              <div className="display-6 fw-bold">{value}</div>
              <div className="text-muted small mt-2">{description}</div>
            </div>

            <div
              className="rounded-3 p-3"
              style={{
                backgroundColor: `${color}18`,
                color,
              }}
            >
              <Icon size={23} />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

// =====================================================
// DASHBOARD
// =====================================================

export default function DashboardClient() {
  const {
    user,
    memberships,
    activeOrganizationId,
    setActiveOrganization,
    apiFetch,
    logout,
  } = useAuth();

  const organizations = useMemo(
    () => normalizeMemberships(memberships),
    [memberships]
  );

  const selectedOrganization = organizations.find(
    (organization) =>
      organization.organizationId === activeOrganizationId
  );

  const [data, setData] = useState<DashboardData>(emptyDashboardData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // =====================================================
  // LOAD DASHBOARD DATA
  // =====================================================

  const loadDashboard = useCallback(
    async (organizationId: string): Promise<DashboardLoadResult> => {
      const query = `?organizationId=${encodeURIComponent(
        organizationId
      )}`;

      const fetchApi = async (endpoint: string): Promise<unknown> => {
        const response = await apiFetch(`${API_URL}${endpoint}${query}`, {
          method: "GET",
          cache: "no-store",
        });

        let result: ApiResult = {};

        try {
          result = (await response.json()) as ApiResult;
        } catch {
          // The response may not contain JSON. The HTTP status below
          // will still provide a useful error.
        }

        if (!response.ok) {
          throw new Error(
            result.message || `API request failed (${response.status}).`
          );
        }

        if (result.success === false) {
          throw new Error(result.message || "API request failed.");
        }

        return result.data ?? result;
      };

      const results = await Promise.allSettled([
        fetchApi("/properties"),
        fetchApi("/devices"),
        fetchApi("/alerts"),
      ]);

      const properties =
        results[0].status === "fulfilled"
          ? normalizeProperties(results[0].value)
          : [];

      const devices =
        results[1].status === "fulfilled"
          ? normalizeDevices(results[1].value)
          : [];

      const alerts =
        results[2].status === "fulfilled"
          ? normalizeAlerts(results[2].value)
          : [];

      return {
        data: { properties, devices, alerts },
        failures: results.filter((result) => result.status === "rejected")
          .length,
      };
    },
    [apiFetch]
  );

  // Reload when the selected organization changes or Refresh is clicked.
  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      if (!activeOrganizationId) {
        setData(emptyDashboardData);
        setLoading(false);
        setError("");
        setLastUpdated("");
        return;
      }

      setLoading(true);
      setError("");

      try {
        const result = await loadDashboard(activeOrganizationId);

        if (cancelled) return;

        setData(result.data);

        if (result.failures === 3) {
          setError(
            "Could not load dashboard information. Check your API connection and permissions."
          );
        } else if (result.failures > 0) {
          setError(
            "Some dashboard information could not be loaded. One or more API endpoints may need authentication."
          );
        }

        setLastUpdated(new Date().toLocaleTimeString());
      } catch (err) {
        if (cancelled) return;

        setError(
          err instanceof Error
            ? err.message
            : "An unexpected error occurred."
        );
        setData(emptyDashboardData);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void refresh();

    return () => {
      cancelled = true;
    };
  }, [activeOrganizationId, loadDashboard, refreshKey]);

  const handleRefresh = () => {
    setRefreshKey((current) => current + 1);
  };

  // =====================================================
  // DASHBOARD METRICS
  // =====================================================

  const openAlerts = data.alerts.filter(isOpenAlert);

  const criticalAlerts = openAlerts.filter(
    (alert) => alert.severity.toLowerCase() === "critical"
  );

  const onlineDevices = data.devices.filter(
    (device) => device.status.toLowerCase() === "online"
  );

  const offlineDevices = data.devices.filter(
    (device) => device.status.toLowerCase() === "offline"
  );

  const activeProperties = data.properties.filter(
    (property) => property.status.toLowerCase() === "active"
  );

  const deviceHealth =
    data.devices.length > 0
      ? Math.round((onlineDevices.length / data.devices.length) * 100)
      : 0;

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <AppLayout>
      <div className="container-fluid py-4">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
          <div>
            <h2 className="fw-bold mb-1">Dashboard</h2>

            <p className="text-muted mb-1">
              Monitor your properties, connected devices, and alerts.
            </p>

            <div className="small text-muted">
              Welcome back, {user?.firstName || "User"}
              {selectedOrganization
                ? ` · ${selectedOrganization.organizationName}`
                : ""}
            </div>
          </div>

          <div className="d-flex flex-wrap align-items-center gap-2">
            {organizations.length > 1 && (
              <select
                className="form-select"
                style={{ width: "auto", minWidth: 190 }}
                value={activeOrganizationId || ""}
                onChange={(event) =>
                  setActiveOrganization(event.target.value)
                }
                aria-label="Select organization"
              >
                {organizations.map((organization) => (
                  <option
                    key={organization.organizationId}
                    value={organization.organizationId}
                  >
                    {organization.organizationName}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              className="btn btn-outline-secondary d-flex align-items-center gap-2"
              onClick={handleRefresh}
              disabled={loading || !activeOrganizationId}
            >
              <RefreshCw
                size={16}
                className={loading ? "spin" : ""}
              />
              {loading ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              className="btn btn-outline-danger d-flex align-items-center gap-2"
              onClick={() => void logout()}
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </div>

        {!activeOrganizationId && (
          <div className="alert alert-warning">
            Select an organization to view its dashboard.
          </div>
        )}

        {organizations.length === 0 && (
          <div className="alert alert-warning">
            Your account does not currently have an organization membership.
            Please contact your PropertyIQ administrator.
          </div>
        )}

        {error && (
          <div
            className="alert alert-warning d-flex align-items-center gap-2"
            role="alert"
          >
            <AlertTriangle size={19} />
            <span>{error}</span>
          </div>
        )}

        <div className="d-flex align-items-center gap-2 mb-4">
          <span
            className={`rounded-circle ${
              error ? "bg-warning" : "bg-success"
            }`}
            style={{ width: 9, height: 9 }}
          />

          <span className="small text-muted">
            {error
              ? "API connection needs attention"
              : loading
                ? "Loading organization data..."
                : "PropertyIQ API connected"}
          </span>

          {lastUpdated && (
            <span className="small text-muted ms-auto">
              Updated at {lastUpdated}
            </span>
          )}
        </div>

        {/* OVERVIEW CARDS */}

        <div className="row g-3 mb-4">
          <div className="col-12 col-sm-6 col-xl-3">
            <StatCard
              title="Properties"
              value={data.properties.length}
              description={`${activeProperties.length} active`}
              icon={Building2}
              color="#2563eb"
              href="/properties"
            />
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <StatCard
              title="Connected devices"
              value={onlineDevices.length}
              description={`${data.devices.length} total registered devices`}
              icon={Wifi}
              color="#16a34a"
              href="/devices"
            />
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <StatCard
              title="Open alerts"
              value={openAlerts.length}
              description="Alerts requiring attention"
              icon={AlertTriangle}
              color="#ea580c"
              href="/alerts"
            />
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <StatCard
              title="Critical alerts"
              value={criticalAlerts.length}
              description="Open critical issues"
              icon={ShieldCheck}
              color="#dc2626"
              href="/alerts"
            />
          </div>
        </div>

        {/* DEVICE HEALTH AND RECENT ALERTS */}

        <div className="row g-4">
          <div className="col-12 col-xl-5">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body p-4">
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <div>
                    <h5 className="fw-bold mb-1">Device health</h5>
                    <p className="text-muted small mb-0">
                      Current device connection status
                    </p>
                  </div>
                  <Cpu size={23} className="text-primary" />
                </div>

                <div className="d-flex justify-content-between align-items-end mb-2">
                  <div className="display-5 fw-bold">
                    {loading ? "—" : `${deviceHealth}%`}
                  </div>
                  <span className="text-muted small">
                    {onlineDevices.length} of {data.devices.length} online
                  </span>
                </div>

                <div
                  className="progress mb-4"
                  style={{ height: 10 }}
                  aria-label="Device health"
                >
                  <div
                    className="progress-bar bg-success"
                    role="progressbar"
                    style={{ width: `${deviceHealth}%` }}
                    aria-valuenow={deviceHealth}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>

                <div className="d-flex justify-content-between py-3 border-bottom">
                  <span className="d-flex align-items-center gap-2">
                    <Wifi size={17} className="text-success" />
                    Online devices
                  </span>
                  <strong>{onlineDevices.length}</strong>
                </div>

                <div className="d-flex justify-content-between py-3 border-bottom">
                  <span className="d-flex align-items-center gap-2">
                    <WifiOff size={17} className="text-danger" />
                    Offline devices
                  </span>
                  <strong>{offlineDevices.length}</strong>
                </div>

                <div className="d-flex justify-content-between py-3">
                  <span className="d-flex align-items-center gap-2">
                    <Activity size={17} className="text-primary" />
                    Total devices
                  </span>
                  <strong>{data.devices.length}</strong>
                </div>

                <Link
                  href="/devices"
                  className="btn btn-outline-primary w-100 mt-3"
                >
                  View devices <ArrowRight size={16} className="ms-1" />
                </Link>
              </div>
            </div>
          </div>

          <div className="col-12 col-xl-7">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body p-4">
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <div>
                    <h5 className="fw-bold mb-1">Recent alerts</h5>
                    <p className="text-muted small mb-0">
                      Latest property notifications
                    </p>
                  </div>

                  <Link
                    href="/alerts"
                    className="small text-decoration-none"
                  >
                    View all <ArrowRight size={14} />
                  </Link>
                </div>

                {loading ? (
                  <div className="text-center py-5 text-muted">
                    Loading alerts...
                  </div>
                ) : data.alerts.length === 0 ? (
                  <div className="text-center py-5">
                    <CheckCircle2
                      size={38}
                      className="text-success mb-3"
                    />
                    <h6 className="fw-semibold">No alerts to display</h6>
                    <p className="text-muted small mb-0">
                      Alerts will appear here when your devices report an issue.
                    </p>
                  </div>
                ) : (
                  <div className="list-group list-group-flush">
                    {data.alerts.slice(0, 5).map((alert, index) => (
                      <div
                        key={alert.alertId || index}
                        className="list-group-item px-0 py-3"
                      >
                        <div className="d-flex justify-content-between align-items-start gap-3">
                          <div className="d-flex gap-3">
                            <div className="pt-1">
                              <AlertTriangle
                                size={19}
                                className={
                                  alert.severity.toLowerCase() === "critical"
                                    ? "text-danger"
                                    : "text-warning"
                                }
                              />
                            </div>

                            <div>
                              <div className="fw-semibold">{alert.title}</div>

                              <div className="small text-muted mt-1">
                                {alert.message || "No additional details"}
                              </div>

                              <div className="small text-muted mt-1">
                                {alert.propertyName ||
                                  alert.deviceName ||
                                  "PropertyIQ"}
                                {" · "}
                                <Clock size={12} className="me-1" />
                                {formatDate(alert.triggeredAt)}
                              </div>
                            </div>
                          </div>

                          <span
                            className={`badge ${getSeverityClass(
                              alert.severity
                            )}`}
                          >
                            {alert.severity}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* PROPERTY OVERVIEW */}

          <div className="col-12">
            <div className="card border-0 shadow-sm">
              <div className="card-body p-4">
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
                  <div>
                    <h5 className="fw-bold mb-1">Your properties</h5>
                    <p className="text-muted small mb-0">
                      Property details for the selected organization
                    </p>
                  </div>

                  <Link
                    href="/properties"
                    className="btn btn-outline-primary btn-sm"
                  >
                    Manage properties
                  </Link>
                </div>

                {loading ? (
                  <div className="text-center py-4 text-muted">
                    Loading properties...
                  </div>
                ) : data.properties.length === 0 ? (
                  <div className="text-center py-5">
                    <Building2
                      size={38}
                      className="text-muted mb-3"
                    />
                    <h6>No properties registered</h6>
                    <p className="text-muted small">
                      Add your first property to get started.
                    </p>
                    <Link href="/properties" className="btn btn-primary">
                      Add property
                    </Link>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table align-middle mb-0">
                      <thead>
                        <tr className="text-muted small">
                          <th>Property</th>
                          <th>Type</th>
                          <th>Location</th>
                          <th>Status</th>
                          <th className="text-end">Action</th>
                        </tr>
                      </thead>

                      <tbody>
                        {data.properties.slice(0, 10).map((property, index) => (
                          <tr key={property.propertyId || index}>
                            <td>
                              <div className="d-flex align-items-center gap-2">
                                <div className="rounded-3 bg-primary bg-opacity-10 p-2">
                                  <Building2
                                    size={19}
                                    className="text-primary"
                                  />
                                </div>
                                <strong>{property.propertyName}</strong>
                              </div>
                            </td>

                            <td>{formatPropertyType(property.propertyType)}</td>

                            <td className="text-muted">
                              <div className="d-flex align-items-start gap-2">
                                <MapPin
                                  size={15}
                                  className="flex-shrink-0 mt-1"
                                />
                                <span>
                                  {formatPropertyLocation(property) ||
                                    "Location not provided"}
                                  {property.country && (
                                    <span className="d-block small">
                                      {property.country}
                                    </span>
                                  )}
                                </span>
                              </div>
                            </td>

                            <td>
                              <span
                                className={`badge ${getPropertyStatusClass(
                                  property.status
                                )}`}
                              >
                                {property.status}
                              </span>
                            </td>

                            <td className="text-end">
                              <Link
                                href="/properties"
                                className="btn btn-sm btn-light"
                              >
                                View
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* QUICK LINKS */}

        <div className="row g-3 mt-2">
          <div className="col-12 col-md-4">
            <Link
              href="/properties"
              className="card border-0 shadow-sm text-decoration-none text-reset h-100"
            >
              <div className="card-body p-3 d-flex align-items-center gap-3">
                <Building2 className="text-primary" size={23} />
                <div>
                  <div className="fw-semibold">Manage properties</div>
                  <div className="text-muted small">
                    View and update property records
                  </div>
                </div>
                <ArrowRight className="ms-auto" size={17} />
              </div>
            </Link>
          </div>

          <div className="col-12 col-md-4">
            <Link
              href="/devices"
              className="card border-0 shadow-sm text-decoration-none text-reset h-100"
            >
              <div className="card-body p-3 d-flex align-items-center gap-3">
                <Cpu className="text-primary" size={23} />
                <div>
                  <div className="fw-semibold">Manage devices</div>
                  <div className="text-muted small">
                    Register and monitor sensors
                  </div>
                </div>
                <ArrowRight className="ms-auto" size={17} />
              </div>
            </Link>
          </div>

          <div className="col-12 col-md-4">
            <Link
              href="/reports"
              className="card border-0 shadow-sm text-decoration-none text-reset h-100"
            >
              <div className="card-body p-3 d-flex align-items-center gap-3">
                <Activity className="text-warning" size={23} />
                <div>
                  <div className="fw-semibold">View reports</div>
                  <div className="text-muted small">
                    Review property performance
                  </div>
                </div>
                <ArrowRight className="ms-auto" size={17} />
              </div>
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}