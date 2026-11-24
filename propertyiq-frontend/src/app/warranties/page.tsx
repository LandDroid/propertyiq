
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/components/auth/AuthProvider";

import {
  Plus,
  RefreshCw,
  Search,
  Pencil,
  Trash2,
  CheckCircle,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Wrench,
  Package,
  X,
} from "lucide-react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1";

type Tab = "assets" | "warranties" | "maintenance";

type ApiFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

type Asset = {
  assetId: string;
  assetName: string;
  propertyId: string;
  propertyName?: string;
  deviceId?: string | null;
  category?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  purchaseDate?: string;
  installedAt?: string;
  expectedLifespanYears?: number;
  status?: string;
  notes?: string;
};

type Warranty = {
  warrantyId: string;
  assetId: string;
  assetName?: string;
  warrantyName: string;
  warrantyProvider?: string;
  warrantyType?: string;
  warrantyStartDate?: string;
  warrantyEndDate?: string;
  coverageDetails?: string;
  contractNumber?: string;
  status?: string;
  expiryStatus?: string;
  daysUntilExpiry?: number;
};

type Maintenance = {
  maintenanceId: string;
  assetId: string;
  assetName?: string;
  propertyName?: string;
  maintenanceTitle: string;
  description?: string;
  maintenanceType?: string;
  dueDate?: string;
  completedDate?: string;
  recurrenceMonths?: number;
  status?: string;
  serviceProvider?: string;
  cost?: number;
  notes?: string;
};

type Property = {
  propertyId: string;
  propertyName: string;
};

type Device = {
  deviceId: string;
  deviceName: string;
  propertyId?: string;
};

type Row = Record<string, unknown>;

async function apiRequest<T>(
  apiFetch: ApiFetch,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await apiFetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  const result = await response.json().catch(() => null);

  if (!response.ok || result?.success === false) {
    throw new Error(
      result?.message ||
        result?.error ||
        `Request failed (${response.status})`
    );
  }

  return (result?.data ?? result) as T;
}

function normalizeRows(value: unknown): Row[] {
  if (Array.isArray(value)) return value as Row[];

  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as { recordset?: unknown }).recordset)
  ) {
    return (value as { recordset: Row[] }).recordset;
  }

  return [];
}

function field(row: Row, camel: string, pascal: string) {
  return row[camel] ?? row[pascal];
}

function dateOnly(value?: string) {
  if (!value) return "";
  return value.substring(0, 10);
}

function formatDate(value?: string) {
  if (!value) return "—";

  const date = new Date(`${value.substring(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString();
}

function getMaintenanceStatus(item: Maintenance) {
  if (item.status?.toLowerCase() === "completed") return "completed";

  if (item.dueDate) {
    const due = new Date(`${item.dueDate.substring(0, 10)}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (due < today) return "overdue";
  }

  return item.status?.toLowerCase() || "scheduled";
}

function getWarrantyStatus(item: Warranty) {
  if (item.status?.toLowerCase() !== "active") {
    return item.status || "inactive";
  }

  if (!item.warrantyEndDate) return "active";

  const endDate = new Date(
    `${item.warrantyEndDate.substring(0, 10)}T23:59:59`
  );

  const today = new Date();

  const days = Math.ceil(
    (endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (days < 0) return "expired";
  if (days <= 30) return "expiring";

  return "active";
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();

  let className = "piq-status";

  if (normalized === "completed" || normalized === "active") {
    className += " piq-status-success";
  } else if (
    normalized === "overdue" ||
    normalized === "expired" ||
    normalized === "cancelled"
  ) {
    className += " piq-status-danger";
  } else if (
    normalized === "expiring" ||
    normalized === "scheduled"
  ) {
    className += " piq-status-warning";
  } else {
    className += " piq-status-neutral";
  }

  return (
    <span className={className}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

export default function WarrantiesPage() {
  const {
    apiFetch,
    memberships,
    isLoading: authLoading,
    isAuthenticated,
  } = useAuth();

  // The signed-in user's organization, not the Demo organization.
  const organizationId = memberships[0]?.organizationId;

  const [activeTab, setActiveTab] = useState<Tab>("assets");

  const [assets, setAssets] = useState<Asset[]>([]);
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");

  const [showAssetForm, setShowAssetForm] = useState(false);
  const [showWarrantyForm, setShowWarrantyForm] = useState(false);
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);

  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [editingWarranty, setEditingWarranty] = useState<Warranty | null>(null);
  const [editingMaintenance, setEditingMaintenance] =
    useState<Maintenance | null>(null);

  const [assetForm, setAssetForm] = useState({
    assetName: "",
    propertyId: "",
    deviceId: "",
    category: "",
    manufacturer: "",
    model: "",
    serialNumber: "",
    purchaseDate: "",
    installedAt: "",
    expectedLifespanYears: "",
    status: "active",
    notes: "",
  });

  const [warrantyForm, setWarrantyForm] = useState({
    assetId: "",
    warrantyName: "",
    warrantyProvider: "",
    warrantyType: "manufacturer",
    warrantyStartDate: "",
    warrantyEndDate: "",
    contractNumber: "",
    status: "active",
    coverageDetails: "",
  });

  const [maintenanceForm, setMaintenanceForm] = useState({
    assetId: "",
    maintenanceTitle: "",
    description: "",
    maintenanceType: "scheduled",
    dueDate: "",
    completedDate: "",
    recurrenceMonths: "",
    status: "scheduled",
    serviceProvider: "",
    cost: "",
    notes: "",
  });

  const loadData = useCallback(async () => {
    if (authLoading) return;

    if (!isAuthenticated) {
      setLoading(false);
      setError("Please log in to access assets and warranties.");
      return;
    }

    if (!organizationId) {
      setLoading(false);
      setError("Your account is not linked to an organization.");
      return;
    }

    setLoading(true);
    setError("");

    const query = `?organizationId=${encodeURIComponent(organizationId)}`;

    try {
      const results = await Promise.allSettled([
        apiRequest<unknown>(apiFetch, `/properties${query}`),
        apiRequest<unknown>(apiFetch, `/devices${query}`),
        apiRequest<unknown>(apiFetch, `/assets${query}`),
        apiRequest<unknown>(apiFetch, `/warranties${query}`),
        apiRequest<unknown>(apiFetch, `/maintenance${query}`),
      ]);

      const [
        propertyResult,
        deviceResult,
        assetResult,
        warrantyResult,
        maintenanceResult,
      ] = results;

      const nextErrors: string[] = [];

      if (propertyResult.status === "fulfilled") {
        const rows = normalizeRows(propertyResult.value);

        setProperties(
          rows.map((row) => ({
            propertyId: String(
              field(row, "propertyId", "PropertyId") ?? ""
            ),
            propertyName: String(
              field(row, "propertyName", "PropertyName") ?? ""
            ),
          }))
        );
      } else {
        setProperties([]);
        nextErrors.push("Could not load properties.");
      }

      if (deviceResult.status === "fulfilled") {
        const rows = normalizeRows(deviceResult.value);

        setDevices(
          rows.map((row) => ({
            deviceId: String(field(row, "deviceId", "DeviceId") ?? ""),
            deviceName: String(field(row, "deviceName", "DeviceName") ?? ""),
            propertyId: String(field(row, "propertyId", "PropertyId") ?? ""),
          }))
        );
      } else {
        setDevices([]);
        nextErrors.push("Could not load devices.");
      }

      if (assetResult.status === "fulfilled") {
        const rows = normalizeRows(assetResult.value);

        setAssets(
          rows.map((row) => ({
            assetId: String(field(row, "assetId", "AssetId") ?? ""),
            assetName: String(field(row, "assetName", "AssetName") ?? ""),
            propertyId: String(field(row, "propertyId", "PropertyId") ?? ""),
            propertyName: String(
              field(row, "propertyName", "PropertyName") ?? ""
            ),
            deviceId: (field(row, "deviceId", "DeviceId") ?? null) as
              | string
              | null,
            category: String(field(row, "category", "Category") ?? ""),
            manufacturer: String(
              field(row, "manufacturer", "Manufacturer") ?? ""
            ),
            model: String(field(row, "model", "Model") ?? ""),
            serialNumber: String(
              field(row, "serialNumber", "SerialNumber") ?? ""
            ),
            purchaseDate: String(
              field(row, "purchaseDate", "PurchaseDate") ?? ""
            ),
            installedAt: String(
              field(row, "installedAt", "InstalledAt") ?? ""
            ),
            expectedLifespanYears: Number(
              field(row, "expectedLifespanYears", "ExpectedLifespanYears") ?? 0
            ),
            status: String(field(row, "status", "Status") ?? "active"),
            notes: String(field(row, "notes", "Notes") ?? ""),
          }))
        );
      } else {
        setAssets([]);
        nextErrors.push("Could not load assets. Check the Assets API.");
      }

      if (warrantyResult.status === "fulfilled") {
        const rows = normalizeRows(warrantyResult.value);

        setWarranties(
          rows.map((row) => ({
            warrantyId: String(
              field(row, "warrantyId", "WarrantyId") ?? ""
            ),
            assetId: String(field(row, "assetId", "AssetId") ?? ""),
            assetName: String(field(row, "assetName", "AssetName") ?? ""),
            warrantyName: String(
              field(row, "warrantyName", "WarrantyName") ?? ""
            ),
            warrantyProvider: String(
              field(row, "warrantyProvider", "WarrantyProvider") ?? ""
            ),
            warrantyType: String(
              field(row, "warrantyType", "WarrantyType") ?? ""
            ),
            warrantyStartDate: String(
              field(row, "warrantyStartDate", "WarrantyStartDate") ?? ""
            ),
            warrantyEndDate: String(
              field(row, "warrantyEndDate", "WarrantyEndDate") ?? ""
            ),
            contractNumber: String(
              field(row, "contractNumber", "ContractNumber") ?? ""
            ),
            coverageDetails: String(
              field(row, "coverageDetails", "CoverageDetails") ?? ""
            ),
            status: String(field(row, "status", "Status") ?? "active"),
            expiryStatus: String(
              field(row, "expiryStatus", "ExpiryStatus") ?? ""
            ),
            daysUntilExpiry: Number(
              field(row, "daysUntilExpiry", "DaysUntilExpiry") ?? 0
            ),
          }))
        );
      } else {
        setWarranties([]);
        nextErrors.push("Could not load warranties. Check the Warranties API.");
      }

      if (maintenanceResult.status === "fulfilled") {
        const rows = normalizeRows(maintenanceResult.value);

        setMaintenance(
          rows.map((row) => ({
            maintenanceId: String(
              field(row, "maintenanceId", "MaintenanceId") ?? ""
            ),
            assetId: String(field(row, "assetId", "AssetId") ?? ""),
            assetName: String(field(row, "assetName", "AssetName") ?? ""),
            propertyName: String(
              field(row, "propertyName", "PropertyName") ?? ""
            ),
            maintenanceTitle: String(
              field(row, "maintenanceTitle", "MaintenanceTitle") ?? ""
            ),
            description: String(
              field(row, "description", "Description") ?? ""
            ),
            maintenanceType: String(
              field(row, "maintenanceType", "MaintenanceType") ?? "scheduled"
            ),
            dueDate: String(field(row, "dueDate", "DueDate") ?? ""),
            completedDate: String(
              field(row, "completedDate", "CompletedDate") ?? ""
            ),
            recurrenceMonths: Number(
              field(row, "recurrenceMonths", "RecurrenceMonths") ?? 0
            ),
            status: String(field(row, "status", "Status") ?? "scheduled"),
            serviceProvider: String(
              field(row, "serviceProvider", "ServiceProvider") ?? ""
            ),
            cost: Number(field(row, "cost", "Cost") ?? 0),
            notes: String(field(row, "notes", "Notes") ?? ""),
          }))
        );
      } else {
        setMaintenance([]);
        nextErrors.push("Could not load maintenance records.");
      }

      if (nextErrors.length > 0) {
        setError(nextErrors.join(" "));
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load PropertyIQ data."
      );
    } finally {
      setLoading(false);
    }
  }, [apiFetch, authLoading, isAuthenticated, organizationId]);

  useEffect(() => {
    if (!authLoading) {
      void loadData();
    }
  }, [authLoading, loadData]);

  const filteredAssets = useMemo(() => {
    const term = search.toLowerCase();

    return assets.filter((item) =>
      [
        item.assetName,
        item.category,
        item.manufacturer,
        item.model,
        item.serialNumber,
        item.propertyName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [assets, search]);

  const filteredWarranties = useMemo(() => {
    const term = search.toLowerCase();

    return warranties.filter((item) =>
      [
        item.warrantyName,
        item.warrantyProvider,
        item.assetName,
        item.contractNumber,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [warranties, search]);

  const filteredMaintenance = useMemo(() => {
    const term = search.toLowerCase();

    return maintenance.filter((item) =>
      [
        item.maintenanceTitle,
        item.assetName,
        item.propertyName,
        item.serviceProvider,
        item.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [maintenance, search]);

  const overdueCount = maintenance.filter(
    (item) => getMaintenanceStatus(item) === "overdue"
  ).length;

  const upcomingCount = maintenance.filter((item) => {
    if (!item.dueDate || getMaintenanceStatus(item) === "completed") {
      return false;
    }

    const due = new Date(`${item.dueDate.substring(0, 10)}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = Math.ceil(
      (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    return days >= 0 && days <= 30;
  }).length;

  const activeWarrantyCount = warranties.filter(
    (item) => getWarrantyStatus(item) === "active"
  ).length;

  function resetAssetForm() {
    setAssetForm({
      assetName: "",
      propertyId: properties[0]?.propertyId || "",
      deviceId: "",
      category: "",
      manufacturer: "",
      model: "",
      serialNumber: "",
      purchaseDate: "",
      installedAt: "",
      expectedLifespanYears: "",
      status: "active",
      notes: "",
    });

    setEditingAsset(null);
    setShowAssetForm(false);
  }

  function resetWarrantyForm() {
    setWarrantyForm({
      assetId: assets[0]?.assetId || "",
      warrantyName: "",
      warrantyProvider: "",
      warrantyType: "manufacturer",
      warrantyStartDate: "",
      warrantyEndDate: "",
      contractNumber: "",
      status: "active",
      coverageDetails: "",
    });

    setEditingWarranty(null);
    setShowWarrantyForm(false);
  }

  function resetMaintenanceForm() {
    setMaintenanceForm({
      assetId: assets[0]?.assetId || "",
      maintenanceTitle: "",
      description: "",
      maintenanceType: "scheduled",
      dueDate: "",
      completedDate: "",
      recurrenceMonths: "",
      status: "scheduled",
      serviceProvider: "",
      cost: "",
      notes: "",
    });

    setEditingMaintenance(null);
    setShowMaintenanceForm(false);
  }

  function startEditAsset(item: Asset) {
    setEditingAsset(item);

    setAssetForm({
      assetName: item.assetName || "",
      propertyId: item.propertyId || "",
      deviceId: item.deviceId || "",
      category: item.category || "",
      manufacturer: item.manufacturer || "",
      model: item.model || "",
      serialNumber: item.serialNumber || "",
      purchaseDate: dateOnly(item.purchaseDate),
      installedAt: dateOnly(item.installedAt),
      expectedLifespanYears: item.expectedLifespanYears
        ? String(item.expectedLifespanYears)
        : "",
      status: item.status || "active",
      notes: item.notes || "",
    });

    setShowAssetForm(true);
  }

  function startEditWarranty(item: Warranty) {
    setEditingWarranty(item);

    setWarrantyForm({
      assetId: item.assetId,
      warrantyName: item.warrantyName || "",
      warrantyProvider: item.warrantyProvider || "",
      warrantyType: item.warrantyType || "manufacturer",
      warrantyStartDate: dateOnly(item.warrantyStartDate),
      warrantyEndDate: dateOnly(item.warrantyEndDate),
      contractNumber: item.contractNumber || "",
      status: item.status || "active",
      coverageDetails: item.coverageDetails || "",
    });

    setShowWarrantyForm(true);
  }

  function startEditMaintenance(item: Maintenance) {
    setEditingMaintenance(item);

    setMaintenanceForm({
      assetId: item.assetId,
      maintenanceTitle: item.maintenanceTitle || "",
      description: item.description || "",
      maintenanceType: item.maintenanceType || "scheduled",
      dueDate: dateOnly(item.dueDate),
      completedDate: dateOnly(item.completedDate),
      recurrenceMonths: item.recurrenceMonths
        ? String(item.recurrenceMonths)
        : "",
      status: item.status || "scheduled",
      serviceProvider: item.serviceProvider || "",
      cost: item.cost !== undefined && item.cost !== null
        ? String(item.cost)
        : "",
      notes: item.notes || "",
    });

    setShowMaintenanceForm(true);
  }

  async function saveAsset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organizationId) {
      setError("Your account is not linked to an organization.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const payload = {
      ...assetForm,
      organizationId,
      deviceId: assetForm.deviceId || null,
      expectedLifespanYears: assetForm.expectedLifespanYears
        ? Number(assetForm.expectedLifespanYears)
        : null,
      purchaseDate: assetForm.purchaseDate || null,
      installedAt: assetForm.installedAt || null,
    };

    try {
      const endpoint = editingAsset
        ? `/assets/${editingAsset.assetId}`
        : "/assets";

      await apiRequest(apiFetch, endpoint, {
        method: editingAsset ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      setSuccess(editingAsset ? "Asset updated." : "Asset created.");
      resetAssetForm();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save asset.");
    } finally {
      setSaving(false);
    }
  }

  async function saveWarranty(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organizationId) {
      setError("Your account is not linked to an organization.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const payload = {
      ...warrantyForm,
      organizationId,
      warrantyStartDate: warrantyForm.warrantyStartDate || null,
      warrantyEndDate: warrantyForm.warrantyEndDate || null,
    };

    try {
      const endpoint = editingWarranty
        ? `/warranties/${editingWarranty.warrantyId}`
        : "/warranties";

      await apiRequest(apiFetch, endpoint, {
        method: editingWarranty ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      setSuccess(
        editingWarranty ? "Warranty updated." : "Warranty created."
      );

      resetWarrantyForm();
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save warranty."
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveMaintenance(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organizationId) {
      setError("Your account is not linked to an organization.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const payload = {
      ...maintenanceForm,
      organizationId,
      dueDate: maintenanceForm.dueDate || null,
      completedDate: maintenanceForm.completedDate || null,
      recurrenceMonths: maintenanceForm.recurrenceMonths
        ? Number(maintenanceForm.recurrenceMonths)
        : null,
      cost: maintenanceForm.cost ? Number(maintenanceForm.cost) : null,
    };

    try {
      const endpoint = editingMaintenance
        ? `/maintenance/${editingMaintenance.maintenanceId}`
        : "/maintenance";

      await apiRequest(apiFetch, endpoint, {
        method: editingMaintenance ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      setSuccess(
        editingMaintenance
          ? "Maintenance task updated."
          : "Maintenance task created."
      );

      resetMaintenanceForm();
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save maintenance task."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteRecord(endpoint: string, description: string) {
    if (
      !window.confirm(
        `Are you sure you want to delete this ${description}?`
      )
    ) {
      return;
    }

    setError("");
    setSuccess("");

    try {
      await apiRequest(apiFetch, endpoint, { method: "DELETE" });
      setSuccess(`${description} deleted.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  async function completeMaintenanceTask(item: Maintenance) {
    setError("");
    setSuccess("");

    try {
      await apiRequest(
        apiFetch,
        `/maintenance/${item.maintenanceId}/complete`,
        { method: "PATCH" }
      );

      setSuccess("Maintenance task marked as completed.");
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not complete maintenance."
      );
    }
  }

  const currentCount =
    activeTab === "assets"
      ? assets.length
      : activeTab === "warranties"
        ? warranties.length
        : maintenance.length;

  return (
    <AppLayout>
      <div className="container-fluid py-4 piq-page">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
          <div>
            <h1 className="piq-heading mb-1">Assets &amp; Warranties</h1>
            <p className="text-muted mb-0">
              Manage property equipment, warranty coverage, and maintenance.
            </p>
          </div>

          <button
            className="btn piq-btn-secondary"
            onClick={() => void loadData()}
            disabled={loading || authLoading}
          >
            <RefreshCw size={16} className="me-2" />
            Refresh
          </button>
        </div>

        {error && (
          <div className="alert alert-danger d-flex align-items-center justify-content-between">
            <span>{error}</span>
            <button
              className="btn btn-sm"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {success && (
          <div className="alert alert-success d-flex align-items-center justify-content-between">
            <span>{success}</span>
            <button
              className="btn btn-sm"
              onClick={() => setSuccess("")}
              aria-label="Dismiss success"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <div className="row g-3 mb-4">
          <div className="col-12 col-md-6 col-xl-3">
            <div className="piq-stat-card">
              <div className="piq-stat-icon">
                <Package size={21} />
              </div>
              <div className="piq-stat-label">Tracked assets</div>
              <div className="piq-stat-value">{assets.length}</div>
            </div>
          </div>

          <div className="col-12 col-md-6 col-xl-3">
            <div className="piq-stat-card">
              <div className="piq-stat-icon">
                <ShieldCheck size={21} />
              </div>
              <div className="piq-stat-label">Active warranties</div>
              <div className="piq-stat-value">{activeWarrantyCount}</div>
            </div>
          </div>

          <div className="col-12 col-md-6 col-xl-3">
            <div className="piq-stat-card">
              <div className="piq-stat-icon">
                <AlertTriangle size={21} />
              </div>
              <div className="piq-stat-label">Overdue maintenance</div>
              <div className="piq-stat-value">{overdueCount}</div>
            </div>
          </div>

          <div className="col-12 col-md-6 col-xl-3">
            <div className="piq-stat-card">
              <div className="piq-stat-icon">
                <Clock size={21} />
              </div>
              <div className="piq-stat-label">Upcoming maintenance</div>
              <div className="piq-stat-value">{upcomingCount}</div>
            </div>
          </div>
        </div>

        <div className="piq-panel">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
            <div className="piq-tabs">
              <button
                className={activeTab === "assets" ? "piq-tab active" : "piq-tab"}
                onClick={() => {
                  setActiveTab("assets");
                  setSearch("");
                }}
              >
                <Package size={16} className="me-2" />
                Assets
              </button>

              <button
                className={
                  activeTab === "warranties" ? "piq-tab active" : "piq-tab"
                }
                onClick={() => {
                  setActiveTab("warranties");
                  setSearch("");
                }}
              >
                <ShieldCheck size={16} className="me-2" />
                Warranties
              </button>

              <button
                className={
                  activeTab === "maintenance" ? "piq-tab active" : "piq-tab"
                }
                onClick={() => {
                  setActiveTab("maintenance");
                  setSearch("");
                }}
              >
                <Wrench size={16} className="me-2" />
                Maintenance
              </button>
            </div>

            <div className="d-flex flex-wrap align-items-center gap-2">
              <div className="piq-search">
                <Search size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search..."
                />
              </div>

              {activeTab === "assets" && (
                <button
                  className="btn piq-btn-primary"
                  onClick={() => {
                    setEditingAsset(null);
                    setAssetForm({
                      assetName: "",
                      propertyId: properties[0]?.propertyId || "",
                      deviceId: "",
                      category: "",
                      manufacturer: "",
                      model: "",
                      serialNumber: "",
                      purchaseDate: "",
                      installedAt: "",
                      expectedLifespanYears: "",
                      status: "active",
                      notes: "",
                    });
                    setShowAssetForm(true);
                  }}
                  disabled={properties.length === 0}
                >
                  <Plus size={16} className="me-2" />
                  Add Asset
                </button>
              )}

              {activeTab === "warranties" && (
                <button
                  className="btn piq-btn-primary"
                  onClick={() => {
                    setEditingWarranty(null);
                    setWarrantyForm({
                      assetId: assets[0]?.assetId || "",
                      warrantyName: "",
                      warrantyProvider: "",
                      warrantyType: "manufacturer",
                      warrantyStartDate: "",
                      warrantyEndDate: "",
                      contractNumber: "",
                      status: "active",
                      coverageDetails: "",
                    });
                    setShowWarrantyForm(true);
                  }}
                  disabled={assets.length === 0}
                >
                  <Plus size={16} className="me-2" />
                  Add Warranty
                </button>
              )}

              {activeTab === "maintenance" && (
                <button
                  className="btn piq-btn-primary"
                  onClick={() => {
                    setEditingMaintenance(null);
                    setMaintenanceForm({
                      assetId: assets[0]?.assetId || "",
                      maintenanceTitle: "",
                      description: "",
                      maintenanceType: "scheduled",
                      dueDate: "",
                      completedDate: "",
                      recurrenceMonths: "",
                      status: "scheduled",
                      serviceProvider: "",
                      cost: "",
                      notes: "",
                    });
                    setShowMaintenanceForm(true);
                  }}
                  disabled={assets.length === 0}
                >
                  <Plus size={16} className="me-2" />
                  Add Maintenance
                </button>
              )}
            </div>
          </div>

          <div className="text-muted small mb-3">
            Showing {currentCount} records
          </div>

          {loading || authLoading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status" />
              <div className="text-muted mt-2">Loading records...</div>
            </div>
          ) : (
            <>
              {activeTab === "assets" && (
                <div className="table-responsive">
                  <table className="table align-middle piq-table">
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th>Property</th>
                        <th>Category</th>
                        <th>Manufacturer / Model</th>
                        <th>Serial Number</th>
                        <th>Status</th>
                        <th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAssets.map((item) => (
                        <tr key={item.assetId}>
                          <td><strong>{item.assetName}</strong></td>
                          <td>{item.propertyName || "—"}</td>
                          <td>{item.category || "—"}</td>
                          <td>
                            {[item.manufacturer, item.model]
                              .filter(Boolean)
                              .join(" / ") || "—"}
                          </td>
                          <td>{item.serialNumber || "—"}</td>
                          <td>
                            <StatusBadge status={item.status || "active"} />
                          </td>
                          <td className="text-end">
                            <button
                              className="btn btn-sm btn-light me-1"
                              onClick={() => startEditAsset(item)}
                              title="Edit asset"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              className="btn btn-sm btn-light text-danger"
                              onClick={() =>
                                void deleteRecord(`/assets/${item.assetId}`, "asset")
                              }
                              title="Delete asset"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}

                      {filteredAssets.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center text-muted py-5">
                            No assets found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === "warranties" && (
                <div className="table-responsive">
                  <table className="table align-middle piq-table">
                    <thead>
                      <tr>
                        <th>Warranty</th>
                        <th>Asset</th>
                        <th>Provider</th>
                        <th>Start Date</th>
                        <th>Expiry Date</th>
                        <th>Coverage Status</th>
                        <th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWarranties.map((item) => (
                        <tr key={item.warrantyId}>
                          <td>
                            <strong>{item.warrantyName}</strong>
                            <div className="small text-muted">
                              {item.contractNumber || ""}
                            </div>
                          </td>
                          <td>{item.assetName || "—"}</td>
                          <td>{item.warrantyProvider || "—"}</td>
                          <td>{formatDate(item.warrantyStartDate)}</td>
                          <td>{formatDate(item.warrantyEndDate)}</td>
                          <td>
                            <StatusBadge status={getWarrantyStatus(item)} />
                          </td>
                          <td className="text-end">
                            <button
                              className="btn btn-sm btn-light me-1"
                              onClick={() => startEditWarranty(item)}
                              title="Edit warranty"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              className="btn btn-sm btn-light text-danger"
                              onClick={() =>
                                void deleteRecord(
                                  `/warranties/${item.warrantyId}`,
                                  "warranty"
                                )
                              }
                              title="Delete warranty"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}

                      {filteredWarranties.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center text-muted py-5">
                            No warranties found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === "maintenance" && (
                <>
                  <div className="row g-3 mb-3">
                    <div className="col-md-4">
                      <div className="piq-mini-stat">
                        <span>Overdue tasks</span>
                        <strong>{overdueCount}</strong>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="piq-mini-stat">
                        <span>Due in the next 30 days</span>
                        <strong>{upcomingCount}</strong>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="piq-mini-stat">
                        <span>Completed tasks</span>
                        <strong>
                          {
                            maintenance.filter(
                              (item) =>
                                getMaintenanceStatus(item) === "completed"
                            ).length
                          }
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="table align-middle piq-table">
                      <thead>
                        <tr>
                          <th>Task</th>
                          <th>Asset</th>
                          <th>Property</th>
                          <th>Due Date</th>
                          <th>Service Provider</th>
                          <th>Cost</th>
                          <th>Status</th>
                          <th className="text-end">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMaintenance.map((item) => {
                          const status = getMaintenanceStatus(item);

                          return (
                            <tr key={item.maintenanceId}>
                              <td>
                                <strong>{item.maintenanceTitle}</strong>
                                <div className="small text-muted">
                                  {item.maintenanceType || "scheduled"}
                                </div>
                              </td>
                              <td>{item.assetName || "—"}</td>
                              <td>{item.propertyName || "—"}</td>
                              <td>{formatDate(item.dueDate)}</td>
                              <td>{item.serviceProvider || "—"}</td>
                              <td>
                                {item.cost
                                  ? `$${item.cost.toFixed(2)}`
                                  : "—"}
                              </td>
                              <td><StatusBadge status={status} /></td>
                              <td className="text-end text-nowrap">
                                {status !== "completed" && (
                                  <button
                                    className="btn btn-sm btn-light text-success me-1"
                                    onClick={() =>
                                      void completeMaintenanceTask(item)
                                    }
                                    title="Mark completed"
                                  >
                                    <CheckCircle size={15} />
                                  </button>
                                )}
                                <button
                                  className="btn btn-sm btn-light me-1"
                                  onClick={() => startEditMaintenance(item)}
                                  title="Edit maintenance"
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  className="btn btn-sm btn-light text-danger"
                                  onClick={() =>
                                    void deleteRecord(
                                      `/maintenance/${item.maintenanceId}`,
                                      "maintenance record"
                                    )
                                  }
                                  title="Delete maintenance"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}

                        {filteredMaintenance.length === 0 && (
                          <tr>
                            <td colSpan={8} className="text-center text-muted py-5">
                              No maintenance tasks found. Select Add Maintenance
                              to create your first task.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* ASSET FORM */}
        {showAssetForm && (
          <div className="piq-modal-backdrop">
            <div className="piq-modal">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h4 className="mb-0">
                  {editingAsset ? "Edit Asset" : "Add Asset"}
                </h4>
                <button className="btn btn-light" onClick={resetAssetForm}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={saveAsset}>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Asset Name *</label>
                    <input
                      className="form-control"
                      required
                      value={assetForm.assetName}
                      onChange={(e) =>
                        setAssetForm({ ...assetForm, assetName: e.target.value })
                      }
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Property *</label>
                    <select
                      className="form-select"
                      required
                      value={assetForm.propertyId}
                      onChange={(e) =>
                        setAssetForm({ ...assetForm, propertyId: e.target.value })
                      }
                    >
                      <option value="">Select property</option>
                      {properties.map((p) => (
                        <option key={p.propertyId} value={p.propertyId}>
                          {p.propertyName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Category</label>
                    <input
                      className="form-control"
                      value={assetForm.category}
                      onChange={(e) =>
                        setAssetForm({ ...assetForm, category: e.target.value })
                      }
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Linked Device</label>
                    <select
                      className="form-select"
                      value={assetForm.deviceId}
                      onChange={(e) =>
                        setAssetForm({ ...assetForm, deviceId: e.target.value })
                      }
                    >
                      <option value="">No linked device</option>
                      {devices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.deviceName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-4">
                    <label className="form-label">Manufacturer</label>
                    <input
                      className="form-control"
                      value={assetForm.manufacturer}
                      onChange={(e) =>
                        setAssetForm({ ...assetForm, manufacturer: e.target.value })
                      }
                    />
                  </div>

                  <div className="col-md-4">
                    <label className="form-label">Model</label>
                    <input
                      className="form-control"
                      value={assetForm.model}
                      onChange={(e) =>
                        setAssetForm({ ...assetForm, model: e.target.value })
                      }
                    />
                  </div>

                  <div className="col-md-4">
                    <label className="form-label">Serial Number</label>
                    <input
                      className="form-control"
                      value={assetForm.serialNumber}
                      onChange={(e) =>
                        setAssetForm({ ...assetForm, serialNumber: e.target.value })
                      }
                    />
                  </div>

                  <div className="col-md-4">
                    <label className="form-label">Purchase Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={assetForm.purchaseDate}
                      onChange={(e) =>
                        setAssetForm({ ...assetForm, purchaseDate: e.target.value })
                      }
                    />
                  </div>

                  <div className="col-md-4">
                    <label className="form-label">Installation Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={assetForm.installedAt}
                      onChange={(e) =>
                        setAssetForm({ ...assetForm, installedAt: e.target.value })
                      }
                    />
                  </div>

                  <div className="col-md-4">
                    <label className="form-label">Expected Lifespan (years)</label>
                    <input
                      type="number"
                      min="1"
                      className="form-control"
                      value={assetForm.expectedLifespanYears}
                      onChange={(e) =>
                        setAssetForm({
                          ...assetForm,
                          expectedLifespanYears: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Status</label>
                    <select
                      className="form-select"
                      value={assetForm.status}
                      onChange={(e) =>
                        setAssetForm({ ...assetForm, status: e.target.value })
                      }
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="retired">Retired</option>
                    </select>
                  </div>

                  <div className="col-12">
                    <label className="form-label">Notes</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={assetForm.notes}
                      onChange={(e) =>
                        setAssetForm({ ...assetForm, notes: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="d-flex justify-content-end gap-2 mt-4">
                  <button type="button" className="btn btn-light" onClick={resetAssetForm}>
                    Cancel
                  </button>
                  <button type="submit" className="btn piq-btn-primary" disabled={saving}>
                    {saving ? "Saving..." : "Save Asset"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* WARRANTY FORM */}
        {showWarrantyForm && (
          <div className="piq-modal-backdrop">
            <div className="piq-modal">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h4 className="mb-0">
                  {editingWarranty ? "Edit Warranty" : "Add Warranty"}
                </h4>
                <button className="btn btn-light" onClick={resetWarrantyForm}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={saveWarranty}>
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label">Asset *</label>
                    <select
                      className="form-select"
                      required
                      value={warrantyForm.assetId}
                      onChange={(e) =>
                        setWarrantyForm({
                          ...warrantyForm,
                          assetId: e.target.value,
                        })
                      }
                    >
                      <option value="">Select asset</option>
                      {assets.map((asset) => (
                        <option key={asset.assetId} value={asset.assetId}>
                          {asset.assetName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Warranty Name *</label>
                    <input
                      className="form-control"
                      required
                      value={warrantyForm.warrantyName}
                      onChange={(e) =>
                        setWarrantyForm({
                          ...warrantyForm,
                          warrantyName: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Warranty Provider</label>
                    <input
                      className="form-control"
                      value={warrantyForm.warrantyProvider}
                      onChange={(e) =>
                        setWarrantyForm({
                          ...warrantyForm,
                          warrantyProvider: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="col-md-4">
                    <label className="form-label">Warranty Type</label>
                    <select
                      className="form-select"
                      value={warrantyForm.warrantyType}
                      onChange={(e) =>
                        setWarrantyForm({
                          ...warrantyForm,
                          warrantyType: e.target.value,
                        })
                      }
                    >
                      <option value="manufacturer">Manufacturer</option>
                      <option value="extended">Extended</option>
                      <option value="service">Service</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className="col-md-4">
                    <label className="form-label">Start Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={warrantyForm.warrantyStartDate}
                      onChange={(e) =>
                        setWarrantyForm({
                          ...warrantyForm,
                          warrantyStartDate: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="col-md-4">
                    <label className="form-label">End Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={warrantyForm.warrantyEndDate}
                      onChange={(e) =>
                        setWarrantyForm({
                          ...warrantyForm,
                          warrantyEndDate: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Contract Number</label>
                    <input
                      className="form-control"
                      value={warrantyForm.contractNumber}
                      onChange={(e) =>
                        setWarrantyForm({
                          ...warrantyForm,
                          contractNumber: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Status</label>
                    <select
                      className="form-select"
                      value={warrantyForm.status}
                      onChange={(e) =>
                        setWarrantyForm({
                          ...warrantyForm,
                          status: e.target.value,
                        })
                      }
                    >
                      <option value="active">Active</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="void">Void</option>
                    </select>
                  </div>

                  <div className="col-12">
                    <label className="form-label">Coverage Details</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      value={warrantyForm.coverageDetails}
                      onChange={(e) =>
                        setWarrantyForm({
                          ...warrantyForm,
                          coverageDetails: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="d-flex justify-content-end gap-2 mt-4">
                  <button type="button" className="btn btn-light" onClick={resetWarrantyForm}>
                    Cancel
                  </button>
                  <button type="submit" className="btn piq-btn-primary" disabled={saving}>
                    {saving ? "Saving..." : "Save Warranty"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MAINTENANCE FORM */}
        {showMaintenanceForm && (
          <div className="piq-modal-backdrop">
            <div className="piq-modal">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h4 className="mb-0">
                  {editingMaintenance ? "Edit Maintenance" : "Add Maintenance"}
                </h4>
                <button className="btn btn-light" onClick={resetMaintenanceForm}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={saveMaintenance}>
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label">Asset *</label>
                    <select
                      className="form-select"
                      required
                      value={maintenanceForm.assetId}
                      onChange={(e) =>
                        setMaintenanceForm({
                          ...maintenanceForm,
                          assetId: e.target.value,
                        })
                      }
                    >
                      <option value="">Select asset</option>
                      {assets.map((asset) => (
                        <option key={asset.assetId} value={asset.assetId}>
                          {asset.assetName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-8">
                    <label className="form-label">Maintenance Title *</label>
                    <input
                      className="form-control"
                      required
                      value={maintenanceForm.maintenanceTitle}
                      onChange={(e) =>
                        setMaintenanceForm({
                          ...maintenanceForm,
                          maintenanceTitle: e.target.value,
                        })
                      }
                      placeholder="e.g. Annual HVAC Inspection"
                    />
                  </div>

                  <div className="col-md-4">
                    <label className="form-label">Type</label>
                    <select
                      className="form-select"
                      value={maintenanceForm.maintenanceType}
                      onChange={(e) =>
                        setMaintenanceForm({
                          ...maintenanceForm,
                          maintenanceType: e.target.value,
                        })
                      }
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="preventive">Preventive</option>
                      <option value="repair">Repair</option>
                      <option value="inspection">Inspection</option>
                      <option value="emergency">Emergency</option>
                    </select>
                  </div>

                  <div className="col-md-4">
                    <label className="form-label">Due Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={maintenanceForm.dueDate}
                      onChange={(e) =>
                        setMaintenanceForm({
                          ...maintenanceForm,
                          dueDate: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="col-md-4">
                    <label className="form-label">Recurrence (months)</label>
                    <input
                      type="number"
                      min="1"
                      className="form-control"
                      value={maintenanceForm.recurrenceMonths}
                      onChange={(e) =>
                        setMaintenanceForm({
                          ...maintenanceForm,
                          recurrenceMonths: e.target.value,
                        })
                      }
                      placeholder="e.g. 12"
                    />
                  </div>

                  <div className="col-md-4">
                    <label className="form-label">Status</label>
                    <select
                      className="form-select"
                      value={maintenanceForm.status}
                      onChange={(e) =>
                        setMaintenanceForm({
                          ...maintenanceForm,
                          status: e.target.value,
                        })
                      }
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="in_progress">In Progress</option>
                      <option value="overdue">Overdue</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Service Provider</label>
                    <input
                      className="form-control"
                      value={maintenanceForm.serviceProvider}
                      onChange={(e) =>
                        setMaintenanceForm({
                          ...maintenanceForm,
                          serviceProvider: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Cost</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-control"
                      value={maintenanceForm.cost}
                      onChange={(e) =>
                        setMaintenanceForm({
                          ...maintenanceForm,
                          cost: e.target.value,
                        })
                      }
                      placeholder="0.00"
                    />
                  </div>

                  <div className="col-12">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={maintenanceForm.description}
                      onChange={(e) =>
                        setMaintenanceForm({
                          ...maintenanceForm,
                          description: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="col-12">
                    <label className="form-label">Notes</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={maintenanceForm.notes}
                      onChange={(e) =>
                        setMaintenanceForm({
                          ...maintenanceForm,
                          notes: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="d-flex justify-content-end gap-2 mt-4">
                  <button type="button" className="btn btn-light" onClick={resetMaintenanceForm}>
                    Cancel
                  </button>
                  <button type="submit" className="btn piq-btn-primary" disabled={saving}>
                    {saving ? "Saving..." : "Save Maintenance"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .piq-page {
          color: #1e293b;
        }

        .piq-heading {
          font-size: 1.65rem;
          font-weight: 700;
          color: #172033;
        }

        .piq-stat-card,
        .piq-panel,
        .piq-mini-stat {
          background: #fff;
          border: 1px solid #e8edf3;
          border-radius: 12px;
          padding: 18px;
        }

        .piq-stat-card {
          min-height: 125px;
        }

        .piq-stat-icon {
          color: #2563eb;
          margin-bottom: 10px;
        }

        .piq-stat-label,
        .piq-mini-stat span {
          color: #64748b;
          font-size: 0.85rem;
        }

        .piq-stat-value,
        .piq-mini-stat strong {
          display: block;
          color: #172033;
          font-size: 1.7rem;
          font-weight: 700;
          margin-top: 3px;
        }

        .piq-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .piq-tab {
          background: transparent;
          border: 0;
          border-radius: 8px;
          padding: 10px 13px;
          color: #64748b;
          font-weight: 600;
        }

        .piq-tab.active {
          color: #1d4ed8;
          background: #eff6ff;
        }

        .piq-search {
          display: flex;
          align-items: center;
          gap: 8px;
          border: 1px solid #dce3ec;
          border-radius: 8px;
          padding: 8px 10px;
          color: #64748b;
        }

        .piq-search input {
          border: 0;
          outline: 0;
          width: 145px;
          min-width: 0;
        }

        .piq-btn-primary {
          background: #2563eb;
          color: white;
          border: 1px solid #2563eb;
          border-radius: 8px;
          padding: 9px 14px;
          font-weight: 600;
        }

        .piq-btn-primary:hover {
          background: #1d4ed8;
          color: white;
        }

        .piq-btn-secondary {
          background: white;
          border: 1px solid #dce3ec;
          border-radius: 8px;
          padding: 9px 14px;
          color: #334155;
        }

        .piq-table thead th {
          color: #64748b;
          font-size: 0.78rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          white-space: nowrap;
          border-bottom-color: #e8edf3;
        }

        .piq-table td {
          border-bottom-color: #edf1f5;
          font-size: 0.9rem;
        }

        .piq-status {
          display: inline-block;
          border-radius: 20px;
          padding: 4px 9px;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: capitalize;
          white-space: nowrap;
        }

        .piq-status-success {
          background: #dcfce7;
          color: #166534;
        }

        .piq-status-warning {
          background: #fef3c7;
          color: #92400e;
        }

        .piq-status-danger {
          background: #fee2e2;
          color: #991b1b;
        }

        .piq-status-neutral {
          background: #f1f5f9;
          color: #475569;
        }

        .piq-mini-stat {
          padding: 14px 16px;
        }

        .piq-mini-stat strong {
          font-size: 1.4rem;
        }

        .piq-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1050;
          background: rgba(15, 23, 42, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          overflow-y: auto;
        }

        .piq-modal {
          background: #fff;
          border-radius: 14px;
          width: 100%;
          max-width: 760px;
          max-height: calc(100vh - 40px);
          overflow-y: auto;
          padding: 24px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
        }

        @media (max-width: 767px) {
          .piq-modal {
            padding: 16px;
          }

          .piq-search input {
            width: 100px;
          }
        }
      `}</style>
    </AppLayout>
  );
}
