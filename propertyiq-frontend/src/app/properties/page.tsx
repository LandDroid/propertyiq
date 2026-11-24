"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import Link from "next/link";

import {
  MapPin,
  Building2,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  X,
  Home,
  CheckCircle2,
  AlertCircle,
  Search,
} from "lucide-react";

import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/components/auth/AuthProvider";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3000/api/v1";

// =====================================================
// TYPES
// =====================================================

type Property = {
  PropertyId: string;
  OrganizationId: string;
  PropertyName: string;
  PropertyType: string;
  Address: string | null;
  City: string | null;
  Province: string | null;
  PostalCode: string | null;
  Country: string;
  TimeZone: string;
  Latitude: number | null;
  Longitude: number | null;
  Status: string;
  CreatedAt: string;
};

type PropertyForm = {
  propertyName: string;
  propertyType: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  timeZone: string;
  latitude: string;
  longitude: string;
  status: string;
};

type ApiResponse = {
  success?: boolean;
  message?: string;
  data?: Property | Property[];
  errors?: Array<{
    message?: string;
  }>;
};

// =====================================================
// CONSTANTS
// =====================================================

const emptyForm: PropertyForm = {
  propertyName: "",
  propertyType: "cottage",
  address: "",
  city: "",
  province: "",
  postalCode: "",
  country: "Canada",
  timeZone: "America/Toronto",
  latitude: "",
  longitude: "",
  status: "Active",
};

const propertyTypes = [
  "cottage",
  "residential",
  "rental",
  "commercial",
  "industrial",
  "other",
];

const statusOptions = ["Active", "Inactive", "Pending"];

// =====================================================
// API RESPONSE HELPER
// =====================================================

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

function getErrorMessage(result: ApiResponse, fallback: string) {
  const details = Array.isArray(result.errors)
    ? result.errors
        .map((issue) => issue.message)
        .filter(Boolean)
        .join(", ")
    : "";

  return details || result.message || fallback;
}

function getPropertyData(result: ApiResponse): Property | null {
  if (
    result.data &&
    !Array.isArray(result.data) &&
    typeof result.data === "object"
  ) {
    return result.data;
  }

  return null;
}

// =====================================================
// PAGE
// =====================================================

export default function PropertiesPage() {
  const {
    apiFetch,
    activeOrganizationId,
    isLoading: authLoading,
    isAuthenticated,
  } = useAuth();

  const apiFetchRef = useRef(apiFetch);
  apiFetchRef.current = apiFetch;

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PropertyForm>(emptyForm);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // ===================================================
  // LOAD PROPERTIES
  // ===================================================

  const loadProperties = useCallback(async () => {
    if (authLoading) {
      return;
    }

    if (!isAuthenticated) {
      setProperties([]);
      setError("Your session has expired. Please log in again.");
      setLoading(false);
      return;
    }

    if (!activeOrganizationId) {
      setProperties([]);
      setError("Select an organization to view its properties.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await apiFetchRef.current(
        `${API_URL}/properties?organizationId=${encodeURIComponent(
          activeOrganizationId
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

      setProperties(Array.isArray(result.data) ? result.data : []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load properties. Check that your backend is running."
      );
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated, activeOrganizationId]);

  useEffect(() => {
    if (!authLoading) {
      void loadProperties();
    }
  }, [authLoading, loadProperties]);

  // ===================================================
  // FORM HELPERS
  // ===================================================

  function updateField(
    field: keyof PropertyForm,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function startNewProperty() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setSuccess("");
    setShowForm(true);
  }

  function startEditing(property: Property) {
    setEditingId(property.PropertyId);

    setForm({
      propertyName: property.PropertyName,
      propertyType: property.PropertyType,
      address: property.Address ?? "",
      city: property.City ?? "",
      province: property.Province ?? "",
      postalCode: property.PostalCode ?? "",
      country: property.Country ?? "Canada",
      timeZone: property.TimeZone ?? "America/Toronto",
      latitude:
        property.Latitude === null ? "" : String(property.Latitude),
      longitude:
        property.Longitude === null ? "" : String(property.Longitude),
      status: property.Status ?? "Active",
    });

    setError("");
    setSuccess("");
    setShowForm(true);
  }

  function closeForm() {
    if (saving) {
      return;
    }

    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  }

  function parseCoordinate(value: string): number | null {
    if (!value.trim()) {
      return null;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  // ===================================================
  // CREATE OR UPDATE PROPERTY
  // ===================================================

  async function saveProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isAuthenticated) {
      setError("Please log in before saving a property.");
      return;
    }

    if (!activeOrganizationId) {
      setError("Select an organization before saving a property.");
      return;
    }

    const latitude = parseCoordinate(form.latitude);
    const longitude = parseCoordinate(form.longitude);

    if (form.latitude.trim() && latitude === null) {
      setError("Latitude must be a valid number.");
      return;
    }

    if (form.longitude.trim() && longitude === null) {
      setError("Longitude must be a valid number.");
      return;
    }

    if (latitude !== null && (latitude < -90 || latitude > 90)) {
      setError("Latitude must be between -90 and 90.");
      return;
    }

    if (longitude !== null && (longitude < -180 || longitude > 180)) {
      setError("Longitude must be between -180 and 180.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const url = editingId
        ? `${API_URL}/properties/${editingId}?organizationId=${encodeURIComponent(
            activeOrganizationId
          )}`
        : `${API_URL}/properties`;

      const method = editingId ? "PUT" : "POST";

      const body = {
        propertyName: form.propertyName.trim(),
        propertyType: form.propertyType,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        province: form.province.trim() || null,
        postalCode: form.postalCode.trim() || null,
        country: form.country.trim(),
        timeZone: form.timeZone.trim(),
        latitude,
        longitude,
        status: form.status,
        ...(editingId ? {} : { organizationId: activeOrganizationId }),
      };

      const response = await apiFetchRef.current(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const result = await readApiResponse(response);

      if (!response.ok || !result.success) {
        throw new Error(
          getErrorMessage(result, "Could not save property.")
        );
      }

      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);

      setSuccess(
        editingId
          ? "Property updated successfully."
          : "Property created successfully."
      );

      await loadProperties();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save property."
      );
    } finally {
      setSaving(false);
    }
  }

  // ===================================================
  // DELETE PROPERTY
  // ===================================================

  async function deleteProperty(property: Property) {
    if (!isAuthenticated || !activeOrganizationId) {
      setError("Please log in and select an organization to manage properties.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete "${property.PropertyName}"?`
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(property.PropertyId);
    setError("");
    setSuccess("");

    try {
      const response = await apiFetchRef.current(
        `${API_URL}/properties/${property.PropertyId}?organizationId=${encodeURIComponent(
          activeOrganizationId
        )}`,
        {
          method: "DELETE",
        }
      );

      const result = await readApiResponse(response);

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Could not delete property."
        );
      }

      setSuccess("Property deleted successfully.");
      await loadProperties();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to delete property."
      );
    } finally {
      setDeletingId(null);
    }
  }

  // ===================================================
  // FILTERS AND STATISTICS
  // ===================================================

  const filteredProperties = properties.filter((property) => {
    const query = searchTerm.trim().toLowerCase();

    const matchesSearch =
      !query ||
      [
        property.PropertyName,
        property.PropertyType,
        property.Address,
        property.City,
        property.Province,
        property.PostalCode,
        property.Country,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));

    const matchesStatus =
      statusFilter === "All" ||
      property.Status?.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  const activeCount = properties.filter(
    (property) => property.Status?.toLowerCase() === "active"
  ).length;

  const inactiveCount = properties.filter(
    (property) => property.Status?.toLowerCase() === "inactive"
  ).length;

  const propertyTypeCount = new Set(
    properties.map((property) => property.PropertyType)
  ).size;

  function statusClass(status: string) {
    switch (status?.toLowerCase()) {
      case "active":
        return "piq-status active";
      case "pending":
        return "piq-status pending";
      default:
        return "piq-status inactive";
    }
  }

  function formatPropertyType(value: string) {
    if (!value) {
      return "Other";
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function formatLocation(property: Property) {
    return [
      property.City,
      property.Province,
      property.PostalCode,
    ]
      .filter(Boolean)
      .join(", ");
  }

  // ===================================================
  // PAGE
  // ===================================================

  return (
    <AppLayout>
      <div className="container-fluid px-0">
        {/* PAGE HEADING */}

        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
          <div>
            <div className="small text-secondary mb-2">
              <Link
                href="/"
                className="text-decoration-none text-secondary"
              >
                Dashboard
              </Link>

              <span className="mx-2">/</span>
              <span>Properties</span>
            </div>

            <h1 className="piq-page-title">Properties</h1>

            <p className="piq-page-subtitle mb-0">
              Manage and monitor properties in your selected organization.
            </p>
          </div>

          <div className="d-flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadProperties()}
              disabled={loading || authLoading}
              className="piq-btn-outline d-inline-flex align-items-center gap-2"
            >
              <RefreshCw size={16} />
              Refresh
            </button>

            <button
              type="button"
              onClick={startNewProperty}
              disabled={!isAuthenticated || !activeOrganizationId}
              className="piq-btn-primary d-inline-flex align-items-center gap-2"
            >
              <Plus size={18} />
              Add Property
            </button>
          </div>
        </div>

        {/* MESSAGES */}

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

        {/* STATISTICS */}

        <div className="row g-4 mb-4">
          <div className="col-12 col-sm-6 col-xl-3">
            <div className="piq-card">
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <p className="piq-stat-label mb-0">
                    Total Properties
                  </p>
                  <div className="piq-stat-value">{properties.length}</div>
                  <p className="small text-secondary mb-0 mt-2">
                    Properties in this organization
                  </p>
                </div>

                <div className="piq-stat-icon bg-primary-subtle text-primary">
                  <Building2 size={21} />
                </div>
              </div>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <div className="piq-card">
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <p className="piq-stat-label mb-0">
                    Active Properties
                  </p>
                  <div className="piq-stat-value">{activeCount}</div>
                  <p className="small text-secondary mb-0 mt-2">
                    Currently active
                  </p>
                </div>

                <div className="piq-stat-icon bg-success-subtle text-success">
                  <CheckCircle2 size={21} />
                </div>
              </div>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <div className="piq-card">
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <p className="piq-stat-label mb-0">
                    Inactive Properties
                  </p>
                  <div className="piq-stat-value">{inactiveCount}</div>
                  <p className="small text-secondary mb-0 mt-2">
                    Not currently active
                  </p>
                </div>

                <div className="piq-stat-icon bg-secondary-subtle text-secondary">
                  <Home size={21} />
                </div>
              </div>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <div className="piq-card">
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <p className="piq-stat-label mb-0">
                    Property Types
                  </p>
                  <div className="piq-stat-value">{propertyTypeCount}</div>
                  <p className="small text-secondary mb-0 mt-2">
                    Different categories
                  </p>
                </div>

                <div className="piq-stat-icon bg-info-subtle text-info">
                  <MapPin size={21} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ADD / EDIT PROPERTY FORM */}

        {showForm && (
          <section className="piq-card mb-4">
            <div className="d-flex justify-content-between align-items-start gap-3 mb-4">
              <div>
                <h2 className="h5 fw-bold mb-1">
                  {editingId ? "Edit Property" : "Add New Property"}
                </h2>

                <p className="small text-secondary mb-0">
                  Enter the property details. Fields marked with * are required.
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="btn btn-light btn-sm"
                aria-label="Close property form"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={saveProperty}>
              <div className="row g-3">
                <div className="col-12 col-md-6">
                  <label className="piq-form-label">
                    Property Name *
                  </label>
                  <input
                    required
                    maxLength={200}
                    value={form.propertyName}
                    onChange={(event) =>
                      updateField("propertyName", event.target.value)
                    }
                    placeholder="e.g. Lakefront Cottage"
                    className="piq-form-control"
                  />
                </div>

                <div className="col-12 col-md-6">
                  <label className="piq-form-label">
                    Property Type *
                  </label>
                  <select
                    required
                    value={form.propertyType}
                    onChange={(event) =>
                      updateField("propertyType", event.target.value)
                    }
                    className="piq-form-control"
                  >
                    {propertyTypes.map((type) => (
                      <option key={type} value={type}>
                        {formatPropertyType(type)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-12">
                  <label className="piq-form-label">
                    Street Address
                  </label>
                  <input
                    maxLength={300}
                    value={form.address}
                    onChange={(event) =>
                      updateField("address", event.target.value)
                    }
                    placeholder="Street address"
                    className="piq-form-control"
                  />
                </div>

                <div className="col-12 col-md-4">
                  <label className="piq-form-label">City</label>
                  <input
                    maxLength={100}
                    value={form.city}
                    onChange={(event) =>
                      updateField("city", event.target.value)
                    }
                    placeholder="City"
                    className="piq-form-control"
                  />
                </div>

                <div className="col-12 col-md-4">
                  <label className="piq-form-label">
                    Province / State
                  </label>
                  <input
                    maxLength={100}
                    value={form.province}
                    onChange={(event) =>
                      updateField("province", event.target.value)
                    }
                    placeholder="Province or state"
                    className="piq-form-control"
                  />
                </div>

                <div className="col-12 col-md-4">
                  <label className="piq-form-label">Postal Code</label>
                  <input
                    maxLength={20}
                    value={form.postalCode}
                    onChange={(event) =>
                      updateField("postalCode", event.target.value)
                    }
                    placeholder="Postal code"
                    className="piq-form-control"
                  />
                </div>

                <div className="col-12 col-md-6">
                  <label className="piq-form-label">Country *</label>
                  <input
                    required
                    maxLength={100}
                    value={form.country}
                    onChange={(event) =>
                      updateField("country", event.target.value)
                    }
                    className="piq-form-control"
                  />
                </div>

                <div className="col-12 col-md-6">
                  <label className="piq-form-label">Time Zone *</label>
                  <input
                    required
                    maxLength={100}
                    value={form.timeZone}
                    onChange={(event) =>
                      updateField("timeZone", event.target.value)
                    }
                    placeholder="America/Toronto"
                    className="piq-form-control"
                  />
                </div>

                <div className="col-12 col-md-6">
                  <label className="piq-form-label">Latitude</label>
                  <input
                    type="number"
                    min="-90"
                    max="90"
                    step="any"
                    value={form.latitude}
                    onChange={(event) =>
                      updateField("latitude", event.target.value)
                    }
                    placeholder="e.g. 43.6532"
                    className="piq-form-control"
                  />
                </div>

                <div className="col-12 col-md-6">
                  <label className="piq-form-label">Longitude</label>
                  <input
                    type="number"
                    min="-180"
                    max="180"
                    step="any"
                    value={form.longitude}
                    onChange={(event) =>
                      updateField("longitude", event.target.value)
                    }
                    placeholder="e.g. -79.3832"
                    className="piq-form-control"
                  />
                </div>

                <div className="col-12 col-md-6">
                  <label className="piq-form-label">Status *</label>
                  <select
                    required
                    value={form.status}
                    onChange={(event) =>
                      updateField("status", event.target.value)
                    }
                    className="piq-form-control"
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="d-flex flex-wrap gap-2 mt-4 pt-3 border-top">
                <button
                  type="submit"
                  disabled={saving}
                  className="piq-btn-primary d-inline-flex align-items-center gap-2"
                >
                  {saving ? (
                    <>
                      <span
                        className="spinner-border spinner-border-sm"
                        aria-hidden="true"
                      />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={17} />
                      {editingId ? "Save Changes" : "Create Property"}
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="piq-btn-outline"
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        {/* PROPERTY LIST HEADER AND FILTERS */}

        <section>
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
            <div>
              <h2 className="h5 fw-bold mb-1">Your Properties</h2>
              <p className="small text-secondary mb-0">
                Showing {filteredProperties.length} of {properties.length}{" "}
                {properties.length === 1 ? "property" : "properties"}
              </p>
            </div>

            <div className="d-flex flex-wrap gap-2">
              <div className="position-relative">
                <Search
                  size={16}
                  className="position-absolute top-50 translate-middle-y text-secondary"
                  style={{ left: "12px" }}
                />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search properties"
                  aria-label="Search properties"
                  className="piq-form-control"
                  style={{ paddingLeft: "36px", minWidth: "220px" }}
                />
              </div>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                aria-label="Filter properties by status"
                className="piq-form-control"
                style={{ minWidth: "140px" }}
              >
                <option value="All">All statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* LOADING */}

          {authLoading || loading ? (
            <div className="piq-card text-center py-5">
              <div
                className="spinner-border text-primary mb-3"
                role="status"
              >
                <span className="visually-hidden">Loading...</span>
              </div>

              <p className="text-secondary mb-0">
                Loading your properties...
              </p>
            </div>
          ) : filteredProperties.length === 0 ? (
            <div className="piq-card text-center py-5">
              <div className="piq-stat-icon bg-primary-subtle text-primary mx-auto mb-3">
                <Building2 size={24} />
              </div>

              <h3 className="h5 fw-bold">
                {properties.length === 0
                  ? "No properties yet"
                  : "No matching properties"}
              </h3>

              <p className="text-secondary mb-4">
                {properties.length === 0
                  ? "Add your first property to start managing it with PropertyIQ."
                  : "Try changing your search or status filter."}
              </p>

              {properties.length === 0 && (
                <div>
                  <button
                    type="button"
                    onClick={startNewProperty}
                    disabled={!isAuthenticated || !activeOrganizationId}
                    className="piq-btn-primary d-inline-flex align-items-center gap-2"
                  >
                    <Plus size={17} />
                    Add Your First Property
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="row g-4">
              {filteredProperties.map((property) => (
                <div
                  className="col-12 col-md-6 col-xl-4"
                  key={property.PropertyId}
                >
                  <article className="piq-property-card">
                    <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
                      <div className="d-flex align-items-center gap-3">
                        <div className="piq-stat-icon bg-primary-subtle text-primary flex-shrink-0">
                          <Building2 size={21} />
                        </div>

                        <div>
                          <h3 className="h6 fw-bold mb-1">
                            {property.PropertyName}
                          </h3>

                          <span className="piq-property-type">
                            {formatPropertyType(property.PropertyType)}
                          </span>
                        </div>
                      </div>

                      <span className={statusClass(property.Status)}>
                        {property.Status}
                      </span>
                    </div>

                    <div className="small text-secondary">
                      <div className="d-flex align-items-start gap-2 mb-2">
                        <MapPin
                          size={16}
                          className="flex-shrink-0 mt-1"
                        />

                        <div>
                          <div>
                            {property.Address || "No street address"}
                          </div>

                          <div>
                            {formatLocation(property) ||
                              "Location not provided"}
                          </div>

                          <div>{property.Country}</div>
                        </div>
                      </div>

                      {(property.Latitude !== null ||
                        property.Longitude !== null) && (
                        <div className="ms-4">
                          Coordinates: {property.Latitude ?? "—"},{" "}
                          {property.Longitude ?? "—"}
                        </div>
                      )}
                    </div>

                    <div className="d-flex gap-2 border-top pt-3 mt-3">
                      <button
                        type="button"
                        onClick={() => startEditing(property)}
                        className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-2"
                      >
                        <Pencil size={14} />
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => void deleteProperty(property)}
                        disabled={deletingId === property.PropertyId}
                        className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-2"
                      >
                        {deletingId === property.PropertyId ? (
                          <span
                            className="spinner-border spinner-border-sm"
                            aria-hidden="true"
                          />
                        ) : (
                          <Trash2 size={14} />
                        )}

                        {deletingId === property.PropertyId
                          ? "Deleting..."
                          : "Delete"}
                      </button>
                    </div>
                  </article>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}