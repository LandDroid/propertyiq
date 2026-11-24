"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/components/auth/AuthProvider";

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3000/api/v1";

type AlertSeverity = "info" | "warning" | "critical";
type AlertStatus = "active" | "acknowledged" | "resolved";

type Alert = {
  alertId: string;
  organizationId: string;
  propertyId: string | null;
  propertyName: string | null;
  title: string;
  message: string;
  severity: string;
  status: string;
  createdAt: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
};

type Property = {
  PropertyId: string;
  PropertyName: string;
  Status: string;
};

type AlertForm = {
  propertyId: string;
  title: string;
  message: string;
  severity: AlertSeverity;
};

type ApiResponse = {
  success?: boolean;
  message?: string;
  data?: unknown;
  errors?: Array<{ message?: string }>;
};

const emptyAlertForm: AlertForm = {
  propertyId: "",
  title: "",
  message: "",
  severity: "warning",
};

function getField(
  value: unknown,
  ...keys: string[]
): unknown {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }

  return undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeAlert(value: unknown): Alert {
  const alertId = stringValue(
    getField(value, "alertId", "AlertId", "id", "Id")
  );

  return {
    alertId,
    organizationId: stringValue(
      getField(value, "organizationId", "OrganizationId")
    ),
    propertyId:
      stringValue(getField(value, "propertyId", "PropertyId")) ||
      null,
    propertyName:
      stringValue(
        getField(value, "propertyName", "PropertyName")
      ) || null,
    title:
      stringValue(getField(value, "title", "Title")) ||
      "Untitled alert",
    message: stringValue(
      getField(value, "message", "Message", "description", "Description")
    ),
    severity:
      stringValue(getField(value, "severity", "Severity")) ||
      "warning",
    status:
      stringValue(getField(value, "status", "Status")) ||
      "active",
    createdAt:
      stringValue(
        getField(
          value,
          "createdAt",
          "CreatedAt",
          "createdDate",
          "CreatedDate"
        )
      ) || null,
    acknowledgedAt:
      stringValue(
        getField(value, "acknowledgedAt", "AcknowledgedAt")
      ) || null,
    resolvedAt:
      stringValue(getField(value, "resolvedAt", "ResolvedAt")) ||
      null,
  };
}

function normalizeProperty(value: unknown): Property {
  return {
    PropertyId: stringValue(
      getField(value, "PropertyId", "propertyId")
    ),
    PropertyName:
      stringValue(getField(value, "PropertyName", "propertyName")) ||
      "Unnamed property",
    Status:
      stringValue(getField(value, "Status", "status")) || "Active",
  };
}

async function readApiResponse(
  response: Response
): Promise<ApiResponse> {
  try {
    const result: unknown = await response.json();

    if (
      result &&
      typeof result === "object" &&
      !Array.isArray(result)
    ) {
      return result as ApiResponse;
    }

    return {};
  } catch {
    return {};
  }
}

function getArrayData(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && typeof data === "object") {
    const nested = getField(data, "items", "Items", "alerts", "Alerts", "properties", "Properties");

    if (Array.isArray(nested)) {
      return nested;
    }
  }

  return [];
}

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
}

function normalizeSeverity(value: string): AlertSeverity {
  const severity = value.toLowerCase();

  if (severity === "critical") {
    return "critical";
  }

  if (severity === "info" || severity === "informational") {
    return "info";
  }

  return "warning";
}

function normalizeStatus(value: string): AlertStatus {
  const status = value.toLowerCase();

  if (status === "resolved" || status === "closed") {
    return "resolved";
  }

  if (status === "acknowledged" || status === "acknowledge") {
    return "acknowledged";
  }

  return "active";
}

function getSeverityClass(value: string): string {
  switch (normalizeSeverity(value)) {
    case "critical":
      return "badge bg-danger-subtle text-danger";
    case "info":
      return "badge bg-info-subtle text-info";
    default:
      return "badge bg-warning-subtle text-warning-emphasis";
  }
}

function getStatusClass(value: string): string {
  switch (normalizeStatus(value)) {
    case "resolved":
      return "badge bg-success-subtle text-success";
    case "acknowledged":
      return "badge bg-primary-subtle text-primary";
    default:
      return "badge bg-warning-subtle text-warning-emphasis";
  }
}

function getSeverityIcon(value: string) {
  switch (normalizeSeverity(value)) {
    case "critical":
      return <AlertTriangle size={17} className="text-danger" />;
    case "info":
      return <Bell size={17} className="text-info" />;
    default:
      return <AlertCircle size={17} className="text-warning" />;
  }
}

function getErrorMessage(
  result: ApiResponse,
  fallback: string
): string {
  const details = Array.isArray(result.errors)
    ? result.errors
        .map((issue) => issue.message)
        .filter(Boolean)
        .join(", ")
    : "";

  return details || result.message || fallback;
}

export default function AlertsPage() {
  const {
    apiFetch,
    memberships,
    isLoading: authLoading,
    isAuthenticated,
  } = useAuth();

  const organizationId = memberships[0]?.organizationId ?? "";

  const apiFetchRef = useRef(apiFetch);
  apiFetchRef.current = apiFetch;

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingAlert, setSavingAlert] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [alertForm, setAlertForm] =
    useState<AlertForm>(emptyAlertForm);

  const loadAlerts = useCallback(async () => {
    if (authLoading) {
      return;
    }

    if (!isAuthenticated) {
      setAlerts([]);
      setError("Your session has expired. Please log in again.");
      setLoading(false);
      return;
    }

    if (!organizationId) {
      setAlerts([]);
      setError("No active organization membership was found.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await apiFetchRef.current(
        `${API_URL}/alerts?organizationId=${encodeURIComponent(
          organizationId
        )}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const result = await readApiResponse(response);

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Could not load alerts."
        );
      }

      setAlerts(getArrayData(result.data).map(normalizeAlert));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load alerts. Check that your backend is running."
      );
    } finally {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated, organizationId]);

  const loadProperties = useCallback(async () => {
    if (
      authLoading ||
      !isAuthenticated ||
      !organizationId
    ) {
      setProperties([]);
      return;
    }

    try {
      const response = await apiFetchRef.current(
        `${API_URL}/properties?organizationId=${encodeURIComponent(
          organizationId
        )}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const result = await readApiResponse(response);

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Could not load properties."
        );
      }

      setProperties(
        getArrayData(result.data)
          .map(normalizeProperty)
          .filter((property) => property.PropertyId)
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load properties."
      );
    }
  }, [authLoading, isAuthenticated, organizationId]);

  useEffect(() => {
    if (!authLoading) {
      void loadAlerts();
      void loadProperties();
    }
  }, [authLoading, loadAlerts, loadProperties]);

  async function refreshAlerts() {
    setRefreshing(true);
    setError("");
    setSuccess("");

    try {
      await Promise.all([loadAlerts(), loadProperties()]);
    } finally {
      setRefreshing(false);
    }
  }

  function updateAlertForm(
    field: keyof AlertForm,
    value: string
  ) {
    setAlertForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function closeCreateForm() {
    if (savingAlert) {
      return;
    }

    setShowCreateForm(false);
    setAlertForm(emptyAlertForm);
  }

  async function createAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isAuthenticated || !organizationId) {
      setError("Please log in to create an alert.");
      return;
    }

    if (!alertForm.propertyId) {
      setError("Select a property for this alert.");
      return;
    }

    setSavingAlert(true);
    setError("");
    setSuccess("");

    try {
      const response = await apiFetchRef.current(
        `${API_URL}/alerts?organizationId=${encodeURIComponent(
          organizationId
        )}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            propertyId: alertForm.propertyId,
            title: alertForm.title.trim(),
            message: alertForm.message.trim(),
            severity: alertForm.severity,
            idempotencyKey:
              typeof crypto !== "undefined" &&
              typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : `manual-alert-${Date.now()}`,
          }),
        }
      );

      const result = await readApiResponse(response);

      if (!response.ok || !result.success) {
        throw new Error(
          getErrorMessage(result, "Could not create alert.")
        );
      }

      setShowCreateForm(false);
      setAlertForm(emptyAlertForm);
      setSuccess("Alert created successfully.");

      await loadAlerts();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create alert."
      );
    } finally {
      setSavingAlert(false);
    }
  }

  async function updateAlert(
    alert: Alert,
    action: "acknowledge" | "resolve"
  ) {
    if (!isAuthenticated || !organizationId) {
      setError("Please log in to manage alerts.");
      return;
    }

    setActionId(alert.alertId);
    setError("");
    setSuccess("");

    try {
      const response = await apiFetchRef.current(
        `${API_URL}/alerts/${encodeURIComponent(
          alert.alertId
        )}/${action}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ organizationId }),
        }
      );

      const result = await readApiResponse(response);

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ||
            `Could not ${action} this alert.`
        );
      }

      setSuccess(
        action === "acknowledge"
          ? "Alert acknowledged."
          : "Alert resolved."
      );

      await loadAlerts();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Unable to ${action} alert.`
      );
    } finally {
      setActionId(null);
    }
  }

  const filteredAlerts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return alerts.filter((alert) => {
      const matchesSearch =
        !query ||
        [
          alert.title,
          alert.message,
          alert.propertyName ?? "",
          alert.severity,
          alert.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);

      const matchesStatus =
        statusFilter === "all" ||
        normalizeStatus(alert.status) === statusFilter;

      const matchesSeverity =
        severityFilter === "all" ||
        normalizeSeverity(alert.severity) === severityFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesSeverity
      );
    });
  }, [alerts, search, statusFilter, severityFilter]);

  const activeCount = alerts.filter(
    (alert) => normalizeStatus(alert.status) === "active"
  ).length;

  const acknowledgedCount = alerts.filter(
    (alert) =>
      normalizeStatus(alert.status) === "acknowledged"
  ).length;

  const resolvedCount = alerts.filter(
    (alert) => normalizeStatus(alert.status) === "resolved"
  ).length;

  return (
    <AppLayout>
      <div className="container-fluid px-0">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
          <div>
            <div className="small text-secondary mb-2">
              Dashboard <span className="mx-2">/</span> Alerts
            </div>

            <h1 className="piq-page-title">Alerts</h1>

            <p className="piq-page-subtitle mb-0">
              Review, create, and manage property alerts.
            </p>
          </div>

          <div className="d-flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refreshAlerts()}
              disabled={loading || refreshing || authLoading}
              className="piq-btn-outline d-inline-flex align-items-center gap-2"
            >
              <RefreshCw size={16} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              onClick={() => {
                setError("");
                setSuccess("");
                setShowCreateForm(true);
              }}
              disabled={!isAuthenticated || !organizationId}
              className="piq-btn-primary d-inline-flex align-items-center gap-2"
            >
              <Plus size={17} />
              Create Alert
            </button>
          </div>
        </div>

        {error && (
          <div
            className="alert alert-danger d-flex align-items-start gap-2"
            role="alert"
          >
            <AlertCircle
              size={19}
              className="flex-shrink-0 mt-1"
            />
            <div>{error}</div>
          </div>
        )}

        {success && (
          <div
            className="alert alert-success d-flex align-items-start gap-2"
            role="status"
          >
            <CheckCircle2
              size={19}
              className="flex-shrink-0 mt-1"
            />
            <div>{success}</div>
          </div>
        )}

        {showCreateForm && (
          <section className="piq-card mb-4">
            <div className="d-flex justify-content-between align-items-start gap-3 mb-4">
              <div>
                <h2 className="h5 fw-bold mb-1">
                  Create Manual Alert
                </h2>
                <p className="small text-secondary mb-0">
                  Choose a property and enter the alert details.
                </p>
              </div>

              <button
                type="button"
                onClick={closeCreateForm}
                disabled={savingAlert}
                className="btn btn-light btn-sm"
                aria-label="Close alert form"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={createAlert}>
              <div className="row g-3">
                <div className="col-12 col-md-6">
                  <label className="piq-form-label">
                    Property *
                  </label>

                  <select
                    required
                    value={alertForm.propertyId}
                    onChange={(event) =>
                      updateAlertForm(
                        "propertyId",
                        event.target.value
                      )
                    }
                    className="piq-form-control"
                    disabled={properties.length === 0}
                  >
                    <option value="">
                      {properties.length === 0
                        ? "No properties available"
                        : "Select a property"}
                    </option>

                    {properties
                      .filter(
                        (property) =>
                          property.Status.toLowerCase() !== "deleted"
                      )
                      .map((property) => (
                        <option
                          key={property.PropertyId}
                          value={property.PropertyId}
                        >
                          {property.PropertyName}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="col-12 col-md-6">
                  <label className="piq-form-label">
                    Severity *
                  </label>

                  <select
                    required
                    value={alertForm.severity}
                    onChange={(event) =>
                      updateAlertForm(
                        "severity",
                        event.target.value
                      )
                    }
                    className="piq-form-control"
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div className="col-12">
                  <label className="piq-form-label">
                    Title *
                  </label>

                  <input
                    required
                    maxLength={200}
                    value={alertForm.title}
                    onChange={(event) =>
                      updateAlertForm("title", event.target.value)
                    }
                    placeholder="Briefly describe the alert"
                    className="piq-form-control"
                  />
                </div>

                <div className="col-12">
                  <label className="piq-form-label">
                    Message *
                  </label>

                  <textarea
                    required
                    maxLength={4000}
                    rows={4}
                    value={alertForm.message}
                    onChange={(event) =>
                      updateAlertForm("message", event.target.value)
                    }
                    placeholder="Add details about the issue or action needed"
                    className="piq-form-control"
                  />
                </div>
              </div>

              <div className="d-flex flex-wrap gap-2 mt-4 pt-3 border-top">
                <button
                  type="submit"
                  disabled={
                    savingAlert ||
                    properties.length === 0 ||
                    !alertForm.propertyId
                  }
                  className="piq-btn-primary d-inline-flex align-items-center gap-2"
                >
                  {savingAlert ? (
                    <>
                      <span
                        className="spinner-border spinner-border-sm"
                        aria-hidden="true"
                      />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus size={17} />
                      Create Alert
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={closeCreateForm}
                  disabled={savingAlert}
                  className="piq-btn-outline"
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        <div className="row g-4 mb-4">
          <div className="col-12 col-sm-6 col-xl-3">
            <div className="piq-card">
              <p className="piq-stat-label mb-0">Total Alerts</p>
              <div className="piq-stat-value">{alerts.length}</div>
              <p className="small text-secondary mb-0 mt-2">
                All recorded alerts
              </p>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <div className="piq-card">
              <p className="piq-stat-label mb-0">Active</p>
              <div className="piq-stat-value">{activeCount}</div>
              <p className="small text-secondary mb-0 mt-2">
                Awaiting attention
              </p>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <div className="piq-card">
              <p className="piq-stat-label mb-0">Acknowledged</p>
              <div className="piq-stat-value">
                {acknowledgedCount}
              </div>
              <p className="small text-secondary mb-0 mt-2">
                Seen by a team member
              </p>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <div className="piq-card">
              <p className="piq-stat-label mb-0">Resolved</p>
              <div className="piq-stat-value">{resolvedCount}</div>
              <p className="small text-secondary mb-0 mt-2">
                Completed alerts
              </p>
            </div>
          </div>
        </div>

        <section className="piq-card">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
            <div>
              <h2 className="h5 fw-bold mb-1">Alert History</h2>
              <p className="small text-secondary mb-0">
                {filteredAlerts.length}{" "}
                {filteredAlerts.length === 1 ? "alert" : "alerts"} shown
              </p>
            </div>
          </div>

          <div className="row g-3 mb-4">
            <div className="col-12 col-lg-6">
              <div className="input-group">
                <span className="input-group-text">
                  <Search size={17} />
                </span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search alerts..."
                  aria-label="Search alerts"
                  className="form-control"
                />
              </div>
            </div>

            <div className="col-12 col-sm-6 col-lg-3">
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
                className="form-select"
                aria-label="Filter by status"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>

            <div className="col-12 col-sm-6 col-lg-3">
              <select
                value={severityFilter}
                onChange={(event) =>
                  setSeverityFilter(event.target.value)
                }
                className="form-select"
                aria-label="Filter by severity"
              >
                <option value="all">All severities</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          {authLoading || loading ? (
            <div className="text-center py-5">
              <div
                className="spinner-border text-primary mb-3"
                role="status"
              >
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="text-secondary mb-0">
                Loading alerts...
              </p>
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="text-center py-5">
              <div className="piq-stat-icon bg-primary-subtle text-primary mx-auto mb-3">
                <Activity size={24} />
              </div>
              <h3 className="h5 fw-bold">No alerts found</h3>
              <p className="text-secondary mb-0">
                {alerts.length === 0
                  ? "Alerts will appear here when created."
                  : "Try changing your search or filters."}
              </p>
            </div>
          ) : (
            <div className="d-flex flex-column gap-3">
              {filteredAlerts.map((alert) => {
                const status = normalizeStatus(alert.status);
                const busy = actionId === alert.alertId;

                return (
                  <article
                    key={alert.alertId}
                    className="border rounded-3 p-3"
                  >
                    <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
                      <div className="d-flex align-items-start gap-3">
                        <div className="pt-1">
                          {getSeverityIcon(alert.severity)}
                        </div>

                        <div>
                          <h3 className="h6 fw-bold mb-2">
                            {alert.title}
                          </h3>

                          {alert.message && (
                            <p className="text-secondary mb-2">
                              {alert.message}
                            </p>
                          )}

                          <div className="d-flex flex-wrap align-items-center gap-2 small text-secondary">
                            {alert.propertyName && (
                              <span>{alert.propertyName}</span>
                            )}
                            <span>
                              <Clock
                                size={14}
                                className="me-1"
                              />
                              {formatDate(alert.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="d-flex flex-wrap align-items-center gap-2">
                        <span className={getSeverityClass(alert.severity)}>
                          {normalizeSeverity(alert.severity)}
                        </span>
                        <span className={getStatusClass(alert.status)}>
                          {status}
                        </span>
                      </div>
                    </div>

                    {status !== "resolved" && (
                      <div className="d-flex flex-wrap gap-2 border-top pt-3 mt-3">
                        {status === "active" && (
                          <button
                            type="button"
                            onClick={() =>
                              void updateAlert(alert, "acknowledge")
                            }
                            disabled={busy}
                            className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-2"
                          >
                            {busy ? (
                              <span className="spinner-border spinner-border-sm" />
                            ) : (
                              <ShieldCheck size={15} />
                            )}
                            Acknowledge
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            void updateAlert(alert, "resolve")
                          }
                          disabled={busy}
                          className="btn btn-sm btn-outline-success d-inline-flex align-items-center gap-2"
                        >
                          {busy ? (
                            <span className="spinner-border spinner-border-sm" />
                          ) : (
                            <CheckCircle2 size={15} />
                          )}
                          Resolve
                        </button>
                      </div>
                    )}

                    {status === "resolved" && (
                      <div className="small text-success border-top pt-3 mt-3">
                        <CheckCircle2
                          size={15}
                          className="me-1"
                        />
                        This alert has been resolved.
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}