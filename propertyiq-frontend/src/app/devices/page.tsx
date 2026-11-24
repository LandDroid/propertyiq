"use client";

import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/components/auth/AuthProvider";

import {
  Activity,
  Cpu,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1"
).replace(/\/+$/, "");

type DeviceStatus = "online" | "offline" | "maintenance" | "pending";

type Device = {
  deviceId: string;
  organizationId: string;
  propertyId: string;
  deviceName: string;
  serialNumber: string;
  manufacturer: string | null;
  model: string | null;
  deviceType: string;
  firmwareVersion: string | null;
  status: string;
  lastSeenAt: string | null;
  installedAt: string | null;
  createdAt?: string;
};

type Property = {
  propertyId: string;
  propertyName: string;
};

type DeviceForm = {
  deviceName: string;
  serialNumber: string;
  propertyId: string;
  manufacturer: string;
  model: string;
  deviceType: string;
  firmwareVersion: string;
  status: DeviceStatus;
  installedAt: string;
};

const emptyForm: DeviceForm = {
  deviceName: "",
  serialNumber: "",
  propertyId: "",
  manufacturer: "",
  model: "",
  deviceType: "temperature",
  firmwareVersion: "",
  status: "pending",
  installedAt: "",
};

// Handles camelCase and PascalCase API field names.
function getField(
  item: Record<string, unknown>,
  camelCase: string,
  pascalCase: string
) {
  return item[camelCase] ?? item[pascalCase];
}

// Supports different API response envelopes.
function getArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data as Record<string, unknown>[];
  }

  if (!data || typeof data !== "object") {
    return [];
  }

  const result = data as Record<string, unknown>;

  if (Array.isArray(result.data)) {
    return result.data as Record<string, unknown>[];
  }

  if (Array.isArray(result.properties)) {
    return result.properties as Record<string, unknown>[];
  }

  if (Array.isArray(result.devices)) {
    return result.devices as Record<string, unknown>[];
  }

  return [];
}

function normalizeProperty(
  item: Record<string, unknown>
): Property | null {
  const propertyId =
    getField(item, "propertyId", "PropertyId") ?? item.id;

  const propertyName =
    getField(item, "propertyName", "PropertyName") ?? item.name;

  if (
    typeof propertyId !== "string" ||
    typeof propertyName !== "string"
  ) {
    return null;
  }

  return {
    propertyId,
    propertyName,
  };
}

function normalizeDevice(
  item: Record<string, unknown>
): Device | null {
  const deviceId = getField(item, "deviceId", "DeviceId");
  const propertyId = getField(item, "propertyId", "PropertyId");
  const deviceName = getField(item, "deviceName", "DeviceName");
  const serialNumber = getField(item, "serialNumber", "SerialNumber");

  if (
    typeof deviceId !== "string" ||
    typeof propertyId !== "string" ||
    typeof deviceName !== "string" ||
    typeof serialNumber !== "string"
  ) {
    return null;
  }

  return {
    deviceId,
    organizationId: String(
      getField(item, "organizationId", "OrganizationId") || ""
    ),
    propertyId,
    deviceName,
    serialNumber,
    manufacturer:
      (getField(item, "manufacturer", "Manufacturer") as string | null) ??
      null,
    model:
      (getField(item, "model", "Model") as string | null) ?? null,
    deviceType: String(
      getField(item, "deviceType", "DeviceType") || "other"
    ),
    firmwareVersion:
      (getField(item, "firmwareVersion", "FirmwareVersion") as string | null) ??
      null,
    status: String(
      getField(item, "status", "Status") || "offline"
    ),
    lastSeenAt:
      (getField(item, "lastSeenAt", "LastSeenAt") as string | null) ??
      null,
    installedAt:
      (getField(item, "installedAt", "InstalledAt") as string | null) ??
      null,
    createdAt:
      getField(item, "createdAt", "CreatedAt") as string | undefined,
  };
}

async function readApiResponse(response: Response) {
  const responseText = await response.text();

  let result: Record<string, unknown> | unknown[];

  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error(
      `The API returned an invalid response (HTTP ${response.status}).`
    );
  }

  if (!response.ok) {
    const message =
      !Array.isArray(result) &&
      typeof result === "object" &&
      typeof result.message === "string"
        ? result.message
        : `Request failed with HTTP ${response.status}.`;

    throw new Error(message);
  }

  if (
    !Array.isArray(result) &&
    typeof result === "object" &&
    result.success === false
  ) {
    throw new Error(
      typeof result.message === "string"
        ? result.message
        : "The API request failed."
    );
  }

  return result;
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not recorded";
  }

  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getStatusBadge(status: string) {
  switch (status.toLowerCase()) {
    case "online":
      return "bg-success-subtle text-success";

    case "offline":
      return "bg-danger-subtle text-danger";

    case "maintenance":
      return "bg-warning-subtle text-warning-emphasis";

    case "pending":
      return "bg-secondary-subtle text-secondary";

    default:
      return "bg-secondary-subtle text-secondary";
  }
}

function getDeviceIcon(deviceType: string) {
  switch (deviceType.toLowerCase()) {
    case "temperature":
    case "humidity":
      return <Activity size={20} />;

    case "water":
    case "leak":
      return <Wifi size={20} />;

    case "energy":
    case "power":
      return <Cpu size={20} />;

    default:
      return <Cpu size={20} />;
  }
}

export default function DevicesPage() {
  const {
    apiFetch,
    activeOrganizationId,
    isLoading: authLoading,
    isAuthenticated,
  } = useAuth();

  // Use the currently selected organization from AuthProvider.
  const organizationId = activeOrganizationId ?? "";

  const [devices, setDevices] = useState<Device[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [propertyError, setPropertyError] = useState("");
  const [success, setSuccess] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const [form, setForm] = useState<DeviceForm>(emptyForm);

  // Load devices and properties using the authenticated API helper.
  const loadData = useCallback(async () => {
    if (authLoading) return;

    if (!isAuthenticated) {
      setDevices([]);
      setProperties([]);
      setLoading(false);
      setError("Please log in to view your devices.");
      return;
    }

    if (!organizationId) {
      setDevices([]);
      setProperties([]);
      setLoading(false);
      setError("No organization is associated with your account.");
      return;
    }

    setLoading(true);
    setError("");
    setPropertyError("");

    // Load properties independently.
    try {
      const propertyResponse = await apiFetch(
        `${API_URL}/properties?organizationId=${encodeURIComponent(
          organizationId
        )}`,
        {
          cache: "no-store",
        }
      );

      const propertyResult = await readApiResponse(propertyResponse);
      const propertyRows = getArray(propertyResult);

      const normalizedProperties = propertyRows
        .map(normalizeProperty)
        .filter((property): property is Property => property !== null);

      setProperties(normalizedProperties);

      if (normalizedProperties.length === 0) {
        setPropertyError(
          "No properties were returned for your organization. Create a property before adding a device."
        );
      }
    } catch (err) {
      setProperties([]);

      setPropertyError(
        err instanceof Error
          ? err.message
          : "Unable to load properties."
      );
    }

    // Load devices independently.
    try {
      const deviceResponse = await apiFetch(
        `${API_URL}/devices?organizationId=${encodeURIComponent(
          organizationId
        )}`,
        {
          cache: "no-store",
        }
      );

      const deviceResult = await readApiResponse(deviceResponse);
      const deviceRows = getArray(deviceResult);

      const normalizedDevices = deviceRows
        .map(normalizeDevice)
        .filter((device): device is Device => device !== null);

      setDevices(normalizedDevices);
    } catch (err) {
      setDevices([]);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load devices."
      );
    }

    setLoading(false);
  }, [
    apiFetch,
    authLoading,
    isAuthenticated,
    organizationId,
  ]);

  useEffect(() => {
    if (!authLoading) {
      void loadData();
    }
  }, [authLoading, loadData]);

  // Search and filters.
  const filteredDevices = useMemo(() => {
    return devices.filter((device) => {
      const searchValue = search.toLowerCase();

      const matchesSearch =
        device.deviceName.toLowerCase().includes(searchValue) ||
        device.serialNumber.toLowerCase().includes(searchValue) ||
        (device.manufacturer || "").toLowerCase().includes(searchValue) ||
        (device.model || "").toLowerCase().includes(searchValue);

      const matchesStatus =
        statusFilter === "all" ||
        device.status.toLowerCase() === statusFilter;

      const matchesType =
        typeFilter === "all" ||
        device.deviceType.toLowerCase() === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [devices, search, statusFilter, typeFilter]);

  const onlineCount = devices.filter(
    (device) => device.status.toLowerCase() === "online"
  ).length;

  const offlineCount = devices.filter(
    (device) => device.status.toLowerCase() === "offline"
  ).length;

  const pendingCount = devices.filter((device) =>
    ["pending", "maintenance"].includes(device.status.toLowerCase())
  ).length;

  function openAddForm() {
    setEditingId(null);

    setForm({
      ...emptyForm,
      propertyId: properties[0]?.propertyId || "",
    });

    setShowForm(true);
    setError("");
    setSuccess("");
  }

  function openEditForm(device: Device) {
    setEditingId(device.deviceId);

    setForm({
      deviceName: device.deviceName,
      serialNumber: device.serialNumber,
      propertyId: device.propertyId,
      manufacturer: device.manufacturer || "",
      model: device.model || "",
      deviceType: device.deviceType,
      firmwareVersion: device.firmwareVersion || "",
      status: device.status as DeviceStatus,
      installedAt: device.installedAt
        ? device.installedAt.substring(0, 10)
        : "",
    });

    setShowForm(true);
    setError("");
    setSuccess("");
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organizationId) {
      setError("Your account is not associated with an organization.");
      return;
    }

    if (!form.propertyId) {
      setError("Please select a property before saving the device.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const isEditing = Boolean(editingId);

      const url = isEditing
        ? `${API_URL}/devices/${editingId}`
        : `${API_URL}/devices`;

      const payload = {
        ...form,
        organizationId,
        manufacturer: form.manufacturer || null,
        model: form.model || null,
        firmwareVersion: form.firmwareVersion || null,
        installedAt: form.installedAt || null,
      };

      const response = await apiFetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      await readApiResponse(response);

      closeForm();

      setSuccess(
        isEditing
          ? "Device updated successfully."
          : "Device added successfully."
      );

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save the device."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(device: Device) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${device.deviceName}"?`
    );

    if (!confirmed) return;

    setDeletingId(device.deviceId);
    setError("");
    setSuccess("");

    try {
      const response = await apiFetch(
        `${API_URL}/devices/${device.deviceId}?organizationId=${encodeURIComponent(
          organizationId
        )}`,
        {
          method: "DELETE",
        }
      );

      await readApiResponse(response);

      setSuccess("Device deleted successfully.");

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete the device."
      );
    } finally {
      setDeletingId(null);
    }
  }

  function getPropertyName(propertyId: string) {
    return (
      properties.find(
        (property) =>
          property.propertyId.toLowerCase() === propertyId.toLowerCase()
      )?.propertyName || "Unassigned property"
    );
  }

  return (
    <AppLayout>
      <div className="container-fluid px-0">
        {/* Page heading */}
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
          <div>
            <div className="text-muted small mb-2">
              Dashboard / Devices
            </div>

            <h1 className="piq-page-title mb-1">Devices</h1>

            <p className="piq-page-subtitle mb-0">
              Monitor and manage your connected property devices.
            </p>
          </div>

          <div className="d-flex gap-2">
            <button
              type="button"
              className="piq-btn-outline"
              onClick={() => void loadData()}
              disabled={loading || authLoading}
            >
              <RefreshCw size={16} className="me-2" />
              Refresh
            </button>

            <button
              type="button"
              className="piq-btn-primary"
              onClick={openAddForm}
              disabled={properties.length === 0 || !organizationId}
            >
              <Plus size={17} className="me-2" />
              Add Device
            </button>
          </div>
        </div>

        {/* Error messages */}
        {error && (
          <div className="alert alert-danger d-flex justify-content-between align-items-center">
            <span>{error}</span>

            <button
              className="btn btn-sm"
              onClick={() => setError("")}
              type="button"
              aria-label="Dismiss error"
            >
              <X size={17} />
            </button>
          </div>
        )}

        {propertyError && (
          <div className="alert alert-warning">
            <strong>Property loading issue:</strong> {propertyError}
            <div className="mt-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-dark"
                onClick={() => void loadData()}
                disabled={loading || authLoading}
              >
                Retry loading properties
              </button>
            </div>
          </div>
        )}

        {success && (
          <div className="alert alert-success d-flex justify-content-between align-items-center">
            <span>{success}</span>

            <button
              className="btn btn-sm"
              onClick={() => setSuccess("")}
              type="button"
              aria-label="Dismiss success message"
            >
              <X size={17} />
            </button>
          </div>
        )}

        {/* Statistics */}
        <div className="row g-3 mb-4">
          <div className="col-12 col-sm-6 col-xl-3">
            <div className="piq-card h-100">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="piq-stat-label">Total Devices</div>
                  <div className="piq-stat-value">{devices.length}</div>
                </div>

                <div className="piq-stat-icon">
                  <Cpu size={23} />
                </div>
              </div>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <div className="piq-card h-100">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="piq-stat-label">Online</div>
                  <div className="piq-stat-value text-success">
                    {onlineCount}
                  </div>
                </div>

                <div className="piq-stat-icon">
                  <Wifi size={23} />
                </div>
              </div>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <div className="piq-card h-100">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="piq-stat-label">Offline</div>
                  <div className="piq-stat-value text-danger">
                    {offlineCount}
                  </div>
                </div>

                <div className="piq-stat-icon">
                  <WifiOff size={23} />
                </div>
              </div>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <div className="piq-card h-100">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="piq-stat-label">Pending / Maintenance</div>
                  <div className="piq-stat-value text-warning">
                    {pendingCount}
                  </div>
                </div>

                <div className="piq-stat-icon">
                  <Activity size={23} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Add/Edit device form */}
        {showForm && (
          <div className="piq-card mb-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
              <div>
                <h5 className="mb-1">
                  {editingId ? "Edit Device" : "Add New Device"}
                </h5>

                <p className="text-muted small mb-0">
                  Enter the device details below.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-light"
                onClick={closeForm}
                aria-label="Close device form"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="row g-3">
                <div className="col-12 col-md-6">
                  <label className="form-label">Device Name *</label>

                  <input
                    className="form-control piq-form-control"
                    value={form.deviceName}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        deviceName: event.target.value,
                      })
                    }
                    placeholder="e.g. Main Floor Temperature Sensor"
                    required
                    maxLength={150}
                  />
                </div>

                <div className="col-12 col-md-6">
                  <label className="form-label">Serial Number *</label>

                  <input
                    className="form-control piq-form-control"
                    value={form.serialNumber}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        serialNumber: event.target.value,
                      })
                    }
                    placeholder="Enter unique serial number"
                    required
                    maxLength={150}
                  />
                </div>

                <div className="col-12 col-md-6">
                  <label className="form-label">Property *</label>

                  <select
                    className="form-select piq-form-control"
                    value={form.propertyId}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        propertyId: event.target.value,
                      })
                    }
                    required
                    disabled={properties.length === 0}
                  >
                    <option value="">
                      {properties.length === 0
                        ? "No properties available"
                        : "Select a property"}
                    </option>

                    {properties.map((property) => (
                      <option
                        key={property.propertyId}
                        value={property.propertyId}
                      >
                        {property.propertyName}
                      </option>
                    ))}
                  </select>

                  {properties.length === 0 && (
                    <small className="text-danger">
                      No properties have been loaded. Check the warning above.
                    </small>
                  )}

                  {properties.length > 0 && (
                    <small className="text-muted">
                      {properties.length} available propert
                      {properties.length === 1 ? "y" : "ies"}
                    </small>
                  )}
                </div>

                <div className="col-12 col-md-6">
                  <label className="form-label">Device Type *</label>

                  <select
                    className="form-select piq-form-control"
                    value={form.deviceType}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        deviceType: event.target.value,
                      })
                    }
                    required
                  >
                    <option value="temperature">Temperature</option>
                    <option value="humidity">Humidity</option>
                    <option value="water">Water Level</option>
                    <option value="leak">Water Leak</option>
                    <option value="energy">Energy</option>
                    <option value="power">Power</option>
                    <option value="door">Door / Window</option>
                    <option value="pump">Pump</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="col-12 col-md-4">
                  <label className="form-label">Manufacturer</label>

                  <input
                    className="form-control piq-form-control"
                    value={form.manufacturer}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        manufacturer: event.target.value,
                      })
                    }
                    placeholder="e.g. Shelly"
                    maxLength={100}
                  />
                </div>

                <div className="col-12 col-md-4">
                  <label className="form-label">Model</label>

                  <input
                    className="form-control piq-form-control"
                    value={form.model}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        model: event.target.value,
                      })
                    }
                    placeholder="Device model"
                    maxLength={100}
                  />
                </div>

                <div className="col-12 col-md-4">
                  <label className="form-label">Firmware Version</label>

                  <input
                    className="form-control piq-form-control"
                    value={form.firmwareVersion}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        firmwareVersion: event.target.value,
                      })
                    }
                    placeholder="e.g. 1.0.0"
                    maxLength={100}
                  />
                </div>

                <div className="col-12 col-md-6">
                  <label className="form-label">Status *</label>

                  <select
                    className="form-select piq-form-control"
                    value={form.status}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        status: event.target.value as DeviceStatus,
                      })
                    }
                  >
                    <option value="pending">Pending</option>
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>

                <div className="col-12 col-md-6">
                  <label className="form-label">Installation Date</label>

                  <input
                    type="date"
                    className="form-control piq-form-control"
                    value={form.installedAt}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        installedAt: event.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="d-flex justify-content-end gap-2 mt-4">
                <button
                  type="button"
                  className="piq-btn-outline"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="piq-btn-primary"
                  disabled={saving || properties.length === 0}
                >
                  {saving
                    ? "Saving..."
                    : editingId
                      ? "Update Device"
                      : "Save Device"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filters */}
        <div className="piq-card mb-4">
          <div className="row g-3 align-items-center">
            <div className="col-12 col-lg-5">
              <div className="input-group">
                <span className="input-group-text bg-white">
                  <Search size={17} />
                </span>

                <input
                  type="search"
                  className="form-control piq-form-control"
                  placeholder="Search devices, serial numbers, manufacturers..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>

            <div className="col-12 col-sm-6 col-lg-3">
              <select
                className="form-select piq-form-control"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
                <option value="pending">Pending</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>

            <div className="col-12 col-sm-6 col-lg-4">
              <select
                className="form-select piq-form-control"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <option value="all">All Device Types</option>
                <option value="temperature">Temperature</option>
                <option value="humidity">Humidity</option>
                <option value="water">Water Level</option>
                <option value="leak">Water Leak</option>
                <option value="energy">Energy</option>
                <option value="power">Power</option>
                <option value="door">Door / Window</option>
                <option value="pump">Pump</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>

        {/* Registered devices */}
        <div className="piq-card">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <h5 className="mb-1">Registered Devices</h5>

              <p className="text-muted small mb-0">
                {filteredDevices.length} device(s) found
              </p>
            </div>
          </div>

          {loading || authLoading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status" />

              <p className="text-muted mt-3 mb-0">
                Loading devices...
              </p>
            </div>
          ) : filteredDevices.length === 0 ? (
            <div className="text-center py-5">
              <div className="mb-3 text-muted">
                <Cpu size={42} />
              </div>

              <h5>No devices found</h5>

              <p className="text-muted mb-3">
                {devices.length === 0
                  ? "Start by adding your first connected device."
                  : "Try changing your search or filter settings."}
              </p>

              {devices.length === 0 && (
                <button
                  type="button"
                  className="piq-btn-primary"
                  onClick={openAddForm}
                  disabled={properties.length === 0}
                >
                  <Plus size={16} className="me-2" />
                  Add Your First Device
                </button>
              )}
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead>
                  <tr className="text-muted small">
                    <th>DEVICE</th>
                    <th>PROPERTY</th>
                    <th>TYPE</th>
                    <th>STATUS</th>
                    <th>LAST SEEN</th>
                    <th className="text-end">ACTIONS</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredDevices.map((device) => (
                    <tr key={device.deviceId}>
                      <td>
                        <div className="d-flex align-items-center gap-3">
                          <div className="piq-stat-icon">
                            {getDeviceIcon(device.deviceType)}
                          </div>

                          <div>
                            <div className="fw-semibold">
                              {device.deviceName}
                            </div>

                            <div className="text-muted small">
                              {device.serialNumber}
                            </div>

                            <div className="text-muted small">
                              {[device.manufacturer, device.model]
                                .filter(Boolean)
                                .join(" ") || "Manufacturer not specified"}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="fw-medium">
                          {getPropertyName(device.propertyId)}
                        </span>
                      </td>

                      <td>
                        <span className="text-capitalize">
                          {device.deviceType.replace("_", " ")}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`badge ${getStatusBadge(device.status)}`}
                        >
                          {device.status}
                        </span>
                      </td>

                      <td>
                        <span className="text-muted small">
                          {formatDate(device.lastSeenAt)}
                        </span>
                      </td>

                      <td>
                        <div className="d-flex justify-content-end gap-2">
                          <button
                            type="button"
                            className="btn btn-sm btn-light"
                            title="Edit device"
                            aria-label={`Edit ${device.deviceName}`}
                            onClick={() => openEditForm(device)}
                          >
                            <Pencil size={16} />
                          </button>

                          <button
                            type="button"
                            className="btn btn-sm btn-light text-danger"
                            title="Delete device"
                            aria-label={`Delete ${device.deviceName}`}
                            disabled={deletingId === device.deviceId}
                            onClick={() => void handleDelete(device)}
                          >
                            {deletingId === device.deviceId ? (
                              <span className="spinner-border spinner-border-sm" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {properties.length === 0 && !loading && !authLoading && (
          <div className="alert alert-warning mt-3">
            You need to create a property before registering a device. Go to
            the Properties page first.
          </div>
        )}
      </div>
    </AppLayout>
  );
}