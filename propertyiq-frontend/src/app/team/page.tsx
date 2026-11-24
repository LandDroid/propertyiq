
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
  Users,
  UserRound,
  Building2,
  Truck,
  Plus,
  RefreshCw,
  Search,
  Mail,
  Phone,
  Globe,
  MapPin,
  Shield,
  UserCheck,
  UserX,
  CheckCircle2,
  AlertCircle,
  Clock,
  X,
  Edit3,
  Trash2,
  Copy,
  Send,
  ChevronRight,
  BriefcaseBusiness,
  KeyRound,
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
  PropertyName: string;
  Address: string | null;
  City: string | null;
  Province: string | null;
  Status: string;
};

type TeamMember = {
  membershipId: string;
  organizationId: string;
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  userStatus: string;
  role: string;
  joinedAt: string;
  assignedPropertyCount: number;
};

type MemberProperty = {
  propertyId: string;
  propertyName: string;
  address: string | null;
  city: string | null;
  province: string | null;
  status: string;
  assignedAt?: string;
};

type Invitation = {
  invitationId: string;
  email: string;
  role: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  invitedByFirstName: string | null;
  invitedByLastName: string | null;
};

type ServiceProvider = {
  serviceProviderId: string;
  organizationId: string;
  companyName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
};

type ApiResponse<T = unknown> = {
  success?: boolean;
  message?: string;
  data?: T;
  errors?: Array<{
    message?: string;
  }>;
};

type MemberForm = {
  email: string;
  role: string;
};

type ProviderForm = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  notes: string;
};

// =====================================================
// CONSTANTS
// =====================================================

const emptyMemberForm: MemberForm = {
  email: "",
  role: "Member",
};

const emptyProviderForm: ProviderForm = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  website: "",
  address: "",
  city: "",
  province: "",
  postalCode: "",
  country: "Canada",
  notes: "",
};

const roleOptions = [
  { value: "Administrator", label: "Administrator" },
  { value: "Member", label: "Member" },
  { value: "Viewer", label: "Viewer" },
];

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--bs-border-color, #e5e7eb)",
  borderRadius: "14px",
  background: "var(--bs-body-bg, #fff)",
  boxShadow: "0 2px 8px rgba(15, 23, 42, 0.035)",
};

const fieldStyle: React.CSSProperties = {
  minHeight: "44px",
  borderRadius: "9px",
};

// =====================================================
// API HELPERS
// =====================================================

async function readApiResponse<T = unknown>(
  response: Response
): Promise<ApiResponse<T>> {
  try {
    const result: unknown = await response.json();

    if (
      result &&
      typeof result === "object" &&
      !Array.isArray(result)
    ) {
      return result as ApiResponse<T>;
    }

    return {};
  } catch {
    return {};
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

function getArrayData<T>(result: ApiResponse<T[]>): T[] {
  return Array.isArray(result.data) ? result.data : [];
}

function getInvitationStatus(invitation: Invitation) {
  if (invitation.acceptedAt) return "accepted";
  if (invitation.revokedAt) return "revoked";

  if (new Date(invitation.expiresAt).getTime() < Date.now()) {
    return "expired";
  }

  return "pending";
}

// =====================================================
// PAGE
// =====================================================

export default function TeamPage() {
  const {
    apiFetch,
    activeOrganizationId,
    isLoading: authLoading,
    isAuthenticated,
  } = useAuth();

  const organizationQuery = activeOrganizationId
    ? `organizationId=${encodeURIComponent(activeOrganizationId)}`
    : "";

  const apiFetchRef = useRef(apiFetch);
  apiFetchRef.current = apiFetch;

  // ---------------------------------------------------
  // DATA
  // ---------------------------------------------------

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [providers, setProviders] = useState<ServiceProvider[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ---------------------------------------------------
  // PAGE STATE
  // ---------------------------------------------------

  const [activeTab, setActiveTab] = useState<
    "internal" | "external"
  >("internal");

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ---------------------------------------------------
  // INTERNAL TEAM FORMS
  // ---------------------------------------------------

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [memberForm, setMemberForm] =
    useState<MemberForm>(emptyMemberForm);

  const [inviteToken, setInviteToken] = useState("");

  const [editingMember, setEditingMember] =
    useState<TeamMember | null>(null);

  const [memberPropertyIds, setMemberPropertyIds] =
    useState<string[]>([]);

  const [memberPropertiesLoading, setMemberPropertiesLoading] =
    useState(false);

  const [showPropertyAccess, setShowPropertyAccess] = useState(false);

  // ---------------------------------------------------
  // EXTERNAL TEAM FORMS
  // ---------------------------------------------------

  const [showProviderForm, setShowProviderForm] = useState(false);
  const [editingProvider, setEditingProvider] =
    useState<ServiceProvider | null>(null);

  const [providerForm, setProviderForm] =
    useState<ProviderForm>(emptyProviderForm);

  // ===================================================
  // LOAD DATA
  // ===================================================

  const loadData = useCallback(async () => {
    if (authLoading) return;

    if (!isAuthenticated) {
      setMembers([]);
      setProperties([]);
      setInvitations([]);
      setProviders([]);
      setError("Your session has expired. Please log in again.");
      setLoading(false);
      return;
    }

    if (!activeOrganizationId) {
      setMembers([]);
      setProperties([]);
      setInvitations([]);
      setProviders([]);
      setError("Select an organization to manage its team.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const requests = await Promise.all([
        apiFetchRef.current(
          `${API_URL}/teams/members?${organizationQuery}`,
          { method: "GET", cache: "no-store" }
        ),
        apiFetchRef.current(
          `${API_URL}/properties?${organizationQuery}`,
          { method: "GET", cache: "no-store" }
        ),
        apiFetchRef.current(
          `${API_URL}/teams/invitations?${organizationQuery}`,
          { method: "GET", cache: "no-store" }
        ),
        apiFetchRef.current(
          `${API_URL}/service-providers?${organizationQuery}`,
          { method: "GET", cache: "no-store" }
        ),
      ]);

      const [
        membersResult,
        propertiesResult,
        invitationsResult,
        providersResult,
      ] = await Promise.all([
        readApiResponse<TeamMember[]>(requests[0]),
        readApiResponse<Property[]>(requests[1]),
        readApiResponse<Invitation[]>(requests[2]),
        readApiResponse<ServiceProvider[]>(requests[3]),
      ]);

      const errors: string[] = [];

      if (!requests[0].ok || !membersResult.success) {
        errors.push(
          getErrorMessage(
            membersResult,
            "Could not load internal team members."
          )
        );
        setMembers([]);
      } else {
        setMembers(getArrayData(membersResult));
      }

      if (!requests[1].ok || !propertiesResult.success) {
        errors.push(
          getErrorMessage(
            propertiesResult,
            "Could not load properties."
          )
        );
        setProperties([]);
      } else {
        setProperties(getArrayData(propertiesResult));
      }

      if (!requests[2].ok || !invitationsResult.success) {
        // Invitations require Owner or Administrator.
        // Keep the rest of the page usable if access is denied.
        setInvitations([]);
      } else {
        setInvitations(getArrayData(invitationsResult));
      }

      if (!requests[3].ok || !providersResult.success) {
        errors.push(
          getErrorMessage(
            providersResult,
            "Could not load external service providers."
          )
        );
        setProviders([]);
      } else {
        setProviders(getArrayData(providersResult));
      }

      if (errors.length > 0) {
        setError(errors.join(" "));
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load team information."
      );
    } finally {
      setLoading(false);
    }
  }, [
    authLoading,
    isAuthenticated,
    activeOrganizationId,
    organizationQuery,
  ]);

  useEffect(() => {
    if (!authLoading) {
      void loadData();
    }
  }, [authLoading, loadData]);

  // ===================================================
  // GENERAL HELPERS
  // ===================================================

  function showSuccess(message: string) {
    setError("");
    setSuccess(message);
  }

  function closeMessages() {
    setError("");
    setSuccess("");
  }

  function formatDate(value: string | null | undefined) {
    if (!value) return "Not available";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "Not available";

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function getMemberName(member: TeamMember) {
    return (
      [member.firstName, member.lastName]
        .filter(Boolean)
        .join(" ") || member.email
    );
  }

  function roleStyle(role: string): React.CSSProperties {
    const common: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      padding: "5px 9px",
      borderRadius: "7px",
      fontSize: "11px",
      fontWeight: 700,
      whiteSpace: "nowrap",
    };

    if (role.toLowerCase() === "administrator") {
      return {
        ...common,
        background: "rgba(13, 110, 253, 0.10)",
        color: "#0d6efd",
      };
    }

    if (role.toLowerCase() === "owner") {
      return {
        ...common,
        background: "rgba(111, 66, 193, 0.12)",
        color: "#6f42c1",
      };
    }

    if (role.toLowerCase() === "viewer") {
      return {
        ...common,
        background: "rgba(108, 117, 125, 0.12)",
        color: "#6c757d",
      };
    }

    return {
      ...common,
      background: "rgba(25, 135, 84, 0.10)",
      color: "#198754",
    };
  }

  function statusStyle(status: string): React.CSSProperties {
    const common: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      padding: "5px 9px",
      borderRadius: "20px",
      fontSize: "11px",
      fontWeight: 700,
      textTransform: "capitalize",
      whiteSpace: "nowrap",
    };

    if (status === "active" || status === "accepted") {
      return {
        ...common,
        background: "rgba(25, 135, 84, 0.11)",
        color: "#198754",
      };
    }

    if (status === "pending") {
      return {
        ...common,
        background: "rgba(255, 193, 7, 0.15)",
        color: "#9a6700",
      };
    }

    return {
      ...common,
      background: "rgba(108, 117, 125, 0.12)",
      color: "#6c757d",
    };
  }

  // ===================================================
  // INTERNAL TEAM: INVITATIONS
  // ===================================================

  function openInviteForm() {
    closeMessages();
    setInviteToken("");
    setMemberForm(emptyMemberForm);
    setShowInviteForm(true);
  }

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeOrganizationId) {
      setError("Select an organization first.");
      return;
    }

    if (!memberForm.email.trim()) {
      setError("Enter an email address.");
      return;
    }

    setSaving(true);
    closeMessages();

    try {
      const response = await apiFetchRef.current(
        `${API_URL}/teams/invitations?${organizationQuery}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: memberForm.email.trim(),
            role: memberForm.role,
          }),
        }
      );

      const result = await readApiResponse<{
        invitation: Invitation;
        invitationToken: string;
      }>(response);

      if (!response.ok || !result.success || !result.data) {
        throw new Error(
          getErrorMessage(result, "Could not create the invitation.")
        );
      }

      setInviteToken(result.data.invitationToken);
      setMemberForm(emptyMemberForm);
      setShowInviteForm(false);

      showSuccess(
        "Invitation created. Copy the invitation token below and share it with the invited person."
      );

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create invitation."
      );
    } finally {
      setSaving(false);
    }
  }

  async function revokeInvitation(invitationId: string) {
    if (!window.confirm("Revoke this invitation?")) return;

    setSaving(true);
    closeMessages();

    try {
      const response = await apiFetchRef.current(
        `${API_URL}/teams/invitations/${invitationId}/revoke?${organizationQuery}`,
        { method: "POST" }
      );

      const result = await readApiResponse(response);

      if (!response.ok || !result.success) {
        throw new Error(
          getErrorMessage(result, "Could not revoke invitation.")
        );
      }

      showSuccess("Invitation revoked.");
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to revoke invitation."
      );
    } finally {
      setSaving(false);
    }
  }

  async function copyInvitationToken() {
    if (!inviteToken) return;

    try {
      await navigator.clipboard.writeText(inviteToken);
      showSuccess("Invitation token copied.");
    } catch {
      setError("Could not copy the token. Please select and copy it manually.");
    }
  }

  // ===================================================
  // INTERNAL TEAM: MEMBER MANAGEMENT
  // ===================================================

  async function openPropertyAccess(member: TeamMember) {
    closeMessages();
    setEditingMember(member);
    setMemberPropertyIds([]);
    setShowPropertyAccess(true);
    setMemberPropertiesLoading(true);

    try {
      const response = await apiFetchRef.current(
        `${API_URL}/teams/members/${member.membershipId}/properties?${organizationQuery}`,
        { method: "GET", cache: "no-store" }
      );

      const result = await readApiResponse<MemberProperty[]>(response);

      if (!response.ok || !result.success) {
        throw new Error(
          getErrorMessage(
            result,
            "Could not load this member's property access."
          )
        );
      }

      const ids = getArrayData(result)
        .map((property) => property.propertyId)
        .filter(Boolean);

      setMemberPropertyIds(ids);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load property access."
      );
    } finally {
      setMemberPropertiesLoading(false);
    }
  }

  function toggleProperty(propertyId: string) {
    setMemberPropertyIds((current) =>
      current.includes(propertyId)
        ? current.filter((id) => id !== propertyId)
        : [...current, propertyId]
    );
  }

  async function savePropertyAccess() {
    if (!editingMember) return;

    setSaving(true);
    closeMessages();

    try {
      const response = await apiFetchRef.current(
        `${API_URL}/teams/members/${editingMember.membershipId}/properties?${organizationQuery}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propertyIds: memberPropertyIds,
          }),
        }
      );

      const result = await readApiResponse(response);

      if (!response.ok || !result.success) {
        throw new Error(
          getErrorMessage(result, "Could not save property access.")
        );
      }

      setShowPropertyAccess(false);
      setEditingMember(null);

      showSuccess("Property access updated successfully.");
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save property access."
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateMemberRole(
    member: TeamMember,
    role: string
  ) {
    if (member.role === role) return;

    if (
      !window.confirm(
        `Change ${getMemberName(member)}'s role to ${role}?`
      )
    ) {
      return;
    }

    setSaving(true);
    closeMessages();

    try {
      const response = await apiFetchRef.current(
        `${API_URL}/teams/members/${member.membershipId}/role?${organizationQuery}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        }
      );

      const result = await readApiResponse(response);

      if (!response.ok || !result.success) {
        throw new Error(
          getErrorMessage(result, "Could not update member role.")
        );
      }

      showSuccess("Member role updated.");
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update member role."
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(member: TeamMember) {
    if (
      !window.confirm(
        `Remove ${getMemberName(member)} from this organization? Their user account will not be deleted.`
      )
    ) {
      return;
    }

    setSaving(true);
    closeMessages();

    try {
      const response = await apiFetchRef.current(
        `${API_URL}/teams/members/${member.membershipId}?${organizationQuery}`,
        { method: "DELETE" }
      );

      const result = await readApiResponse(response);

      if (!response.ok || !result.success) {
        throw new Error(
          getErrorMessage(result, "Could not remove team member.")
        );
      }

      showSuccess("Team member removed from the organization.");
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to remove team member."
      );
    } finally {
      setSaving(false);
    }
  }

  // ===================================================
  // EXTERNAL TEAM: SERVICE PROVIDERS
  // ===================================================

  function openNewProvider() {
    closeMessages();
    setEditingProvider(null);
    setProviderForm(emptyProviderForm);
    setShowProviderForm(true);
  }

  function openEditProvider(provider: ServiceProvider) {
    closeMessages();
    setEditingProvider(provider);

    setProviderForm({
      companyName: provider.companyName || "",
      contactName: provider.contactName || "",
      email: provider.email || "",
      phone: provider.phone || "",
      website: provider.website || "",
      address: provider.address || "",
      city: provider.city || "",
      province: provider.province || "",
      postalCode: provider.postalCode || "",
      country: provider.country || "",
      notes: provider.notes || "",
    });

    setShowProviderForm(true);
  }

  function updateProviderField(
    field: keyof ProviderForm,
    value: string
  ) {
    setProviderForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeOrganizationId) {
      setError("Select an organization first.");
      return;
    }

    if (!providerForm.companyName.trim()) {
      setError("Enter a company name.");
      return;
    }

    setSaving(true);
    closeMessages();

    const body = {
      companyName: providerForm.companyName.trim(),
      contactName: providerForm.contactName.trim() || null,
      email: providerForm.email.trim() || null,
      phone: providerForm.phone.trim() || null,
      website: providerForm.website.trim() || null,
      address: providerForm.address.trim() || null,
      city: providerForm.city.trim() || null,
      province: providerForm.province.trim() || null,
      postalCode: providerForm.postalCode.trim() || null,
      country: providerForm.country.trim() || null,
      notes: providerForm.notes.trim() || null,
    };

    try {
      const isEditing = Boolean(editingProvider);

      const url = isEditing
        ? `${API_URL}/service-providers/${editingProvider!.serviceProviderId}?${organizationQuery}`
        : `${API_URL}/service-providers`;

      const response = await apiFetchRef.current(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEditing
            ? body
            : {
                ...body,
                organizationId: activeOrganizationId,
              }
        ),
      });

      const result = await readApiResponse(response);

      if (!response.ok || !result.success) {
        throw new Error(
          getErrorMessage(
            result,
            isEditing
              ? "Could not update service provider."
              : "Could not create service provider."
          )
        );
      }

      setShowProviderForm(false);
      setEditingProvider(null);
      setProviderForm(emptyProviderForm);

      showSuccess(
        isEditing
          ? "Service provider updated successfully."
          : "Service provider created successfully."
      );

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save service provider."
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleProviderStatus(provider: ServiceProvider) {
    const nextStatus =
      provider.status.toLowerCase() === "active"
        ? "inactive"
        : "active";

    if (
      !window.confirm(
        `${nextStatus === "inactive" ? "Deactivate" : "Activate"} ${provider.companyName}?`
      )
    ) {
      return;
    }

    setSaving(true);
    closeMessages();

    try {
      const response = await apiFetchRef.current(
        `${API_URL}/service-providers/${provider.serviceProviderId}/status?${organizationQuery}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        }
      );

      const result = await readApiResponse(response);

      if (!response.ok || !result.success) {
        throw new Error(
          getErrorMessage(result, "Could not update provider status.")
        );
      }

      showSuccess(
        `${provider.companyName} is now ${nextStatus}.`
      );

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update provider status."
      );
    } finally {
      setSaving(false);
    }
  }

  // ===================================================
  // FILTERING AND STATISTICS
  // ===================================================

  const activeMembers = members.filter(
    (member) => member.userStatus?.toLowerCase() === "active"
  );

  const activeProviders = providers.filter(
    (provider) => provider.status?.toLowerCase() === "active"
  );

  const pendingInvitations = invitations.filter(
    (invitation) => getInvitationStatus(invitation) === "pending"
  );

  const filteredMembers = members.filter((member) => {
    const query = searchTerm.trim().toLowerCase();

    const matchesSearch =
      !query ||
      [
        member.firstName,
        member.lastName,
        member.email,
        member.role,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));

    const matchesStatus =
      statusFilter === "All" ||
      member.userStatus?.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  const filteredProviders = providers.filter((provider) => {
    const query = searchTerm.trim().toLowerCase();

    const matchesSearch =
      !query ||
      [
        provider.companyName,
        provider.contactName,
        provider.email,
        provider.phone,
        provider.city,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));

    const matchesStatus =
      statusFilter === "All" ||
      provider.status?.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  // ===================================================
  // STAT CARD
  // ===================================================

  function StatCard({
    label,
    value,
    description,
    icon,
    tone,
  }: {
    label: string;
    value: number;
    description: string;
    icon: React.ReactNode;
    tone: "blue" | "green" | "purple" | "amber";
  }) {
    const tones = {
      blue: {
        background: "rgba(13, 110, 253, 0.10)",
        color: "#0d6efd",
      },
      green: {
        background: "rgba(25, 135, 84, 0.11)",
        color: "#198754",
      },
      purple: {
        background: "rgba(111, 66, 193, 0.11)",
        color: "#6f42c1",
      },
      amber: {
        background: "rgba(255, 193, 7, 0.15)",
        color: "#9a6700",
      },
    };

    return (
      <div className="h-100 p-3 p-lg-4" style={cardStyle}>
        <div className="d-flex align-items-start justify-content-between gap-3">
          <div>
            <div className="text-secondary mb-2 small fw-semibold">
              {label}
            </div>

            <div
              className="fw-bold"
              style={{
                fontSize: "clamp(27px, 3vw, 34px)",
                lineHeight: 1.1,
                letterSpacing: "-1px",
              }}
            >
              {value}
            </div>

            <div className="small text-secondary mt-2">
              {description}
            </div>
          </div>

          <div
            className="d-flex align-items-center justify-content-center flex-shrink-0"
            style={{
              ...tones[tone],
              width: "46px",
              height: "46px",
              borderRadius: "12px",
            }}
          >
            {icon}
          </div>
        </div>
      </div>
    );
  }

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <AppLayout>
      <div className="container-fluid px-0 pb-4">

        {/* HEADER */}

        <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
          <div>
            <div className="d-flex align-items-center gap-2 small text-secondary mb-2">
              <Link
                href="/"
                className="text-decoration-none text-secondary"
              >
                Dashboard
              </Link>

              <span className="opacity-50">/</span>

              <span className="fw-semibold">Team</span>
            </div>

            <div className="d-flex align-items-center gap-3">
              <div
                className="d-flex align-items-center justify-content-center"
                style={{
                  width: "50px",
                  height: "50px",
                  borderRadius: "13px",
                  background: "rgba(13, 110, 253, 0.10)",
                  color: "#0d6efd",
                }}
              >
                <Users size={25} />
              </div>

              <div>
                <h1
                  className="mb-1 fw-bold"
                  style={{
                    fontSize: "clamp(25px, 3vw, 32px)",
                    letterSpacing: "-0.8px",
                  }}
                >
                  Team Management
                </h1>

                <p className="text-secondary mb-0 small">
                  Manage your internal employees and external service providers.
                </p>
              </div>
            </div>
          </div>

          <div className="d-flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading || authLoading}
              className="piq-btn-outline d-inline-flex align-items-center gap-2"
              style={{ minHeight: "42px" }}
            >
              <RefreshCw
                size={16}
                className={loading ? "piq-spin" : ""}
              />
              Refresh
            </button>

            {activeTab === "internal" ? (
              <button
                type="button"
                onClick={openInviteForm}
                disabled={!activeOrganizationId}
                className="piq-btn-primary d-inline-flex align-items-center gap-2"
                style={{ minHeight: "42px" }}
              >
                <Plus size={18} />
                Invite member
              </button>
            ) : (
              <button
                type="button"
                onClick={openNewProvider}
                disabled={!activeOrganizationId}
                className="piq-btn-primary d-inline-flex align-items-center gap-2"
                style={{ minHeight: "42px" }}
              >
                <Plus size={18} />
                Add service provider
              </button>
            )}
          </div>
        </div>

        {/* ALERTS */}

        {error && (
          <div
            className="alert alert-danger d-flex align-items-start gap-2 mb-3"
            role="alert"
            style={{ borderRadius: "10px" }}
          >
            <AlertCircle size={19} className="flex-shrink-0 mt-1" />

            <div className="flex-grow-1">{error}</div>

            <button
              type="button"
              className="btn-close"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            />
          </div>
        )}

        {success && (
          <div
            className="alert alert-success d-flex align-items-start gap-2 mb-3"
            role="status"
            style={{ borderRadius: "10px" }}
          >
            <CheckCircle2 size={19} className="flex-shrink-0 mt-1" />

            <div className="flex-grow-1">{success}</div>

            <button
              type="button"
              className="btn-close"
              aria-label="Dismiss success"
              onClick={() => setSuccess("")}
            />
          </div>
        )}

        {/* INVITATION TOKEN */}

        {inviteToken && (
          <section
            className="p-3 p-lg-4 mb-4"
            style={{
              ...cardStyle,
              borderColor: "rgba(25, 135, 84, 0.35)",
            }}
          >
            <div className="d-flex align-items-start justify-content-between gap-3">
              <div className="d-flex align-items-start gap-3">
                <div
                  className="d-flex align-items-center justify-content-center flex-shrink-0"
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "11px",
                    background: "rgba(25, 135, 84, 0.11)",
                    color: "#198754",
                  }}
                >
                  <Send size={20} />
                </div>

                <div>
                  <h2 className="h6 fw-bold mb-1">
                    Invitation created
                  </h2>

                  <p className="small text-secondary mb-2">
                    Copy this one-time invitation token and share it securely with the invited person.
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-light btn-sm"
                onClick={() => setInviteToken("")}
                aria-label="Close invitation token"
              >
                <X size={17} />
              </button>
            </div>

            <div className="d-flex flex-wrap gap-2 mt-3">
              <input
                readOnly
                value={inviteToken}
                className="piq-form-control flex-grow-1"
                style={{ ...fieldStyle, minWidth: "200px" }}
                aria-label="Invitation token"
              />

              <button
                type="button"
                onClick={() => void copyInvitationToken()}
                className="piq-btn-primary d-inline-flex align-items-center gap-2"
              >
                <Copy size={16} />
                Copy token
              </button>
            </div>
          </section>
        )}

        {/* SUMMARY */}

        <div className="row g-3 mb-4">
          <div className="col-12 col-sm-6 col-xl-3">
            <StatCard
              label="Internal members"
              value={members.length}
              description={`${activeMembers.length} active accounts`}
              icon={<Users size={22} />}
              tone="blue"
            />
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <StatCard
              label="Pending invitations"
              value={pendingInvitations.length}
              description="Awaiting acceptance"
              icon={<Mail size={22} />}
              tone="amber"
            />
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <StatCard
              label="Service providers"
              value={providers.length}
              description={`${activeProviders.length} active companies`}
              icon={<Truck size={22} />}
              tone="green"
            />
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <StatCard
              label="Properties"
              value={properties.length}
              description="Available in this organization"
              icon={<Building2 size={22} />}
              tone="purple"
            />
          </div>
        </div>

        {/* TABS */}

        <div
          className="d-flex flex-wrap gap-2 p-2 mb-4"
          style={{
            ...cardStyle,
            background: "var(--bs-tertiary-bg, #f8f9fa)",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setActiveTab("internal");
              setSearchTerm("");
              setStatusFilter("All");
              closeMessages();
            }}
            className={
              activeTab === "internal"
                ? "btn btn-primary d-inline-flex align-items-center gap-2"
                : "btn btn-light d-inline-flex align-items-center gap-2"
            }
            style={{
              borderRadius: "9px",
              minHeight: "42px",
              fontWeight: 600,
            }}
          >
            <UserRound size={17} />
            Internal Team
            <span className="badge rounded-pill text-bg-light">
              {members.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("external");
              setSearchTerm("");
              setStatusFilter("All");
              closeMessages();
            }}
            className={
              activeTab === "external"
                ? "btn btn-primary d-inline-flex align-items-center gap-2"
                : "btn btn-light d-inline-flex align-items-center gap-2"
            }
            style={{
              borderRadius: "9px",
              minHeight: "42px",
              fontWeight: 600,
            }}
          >
            <Truck size={17} />
            External Service Providers
            <span className="badge rounded-pill text-bg-light">
              {providers.length}
            </span>
          </button>
        </div>

        {/* INVITE FORM */}

        {activeTab === "internal" && showInviteForm && (
          <section className="mb-4 overflow-hidden" style={cardStyle}>
            <div
              className="d-flex justify-content-between align-items-center gap-3 p-3"
              style={{
                background: "var(--bs-tertiary-bg, #f8f9fa)",
                borderBottom: "1px solid var(--bs-border-color, #e5e7eb)",
              }}
            >
              <div className="d-flex align-items-center gap-2">
                <Send size={18} className="text-primary" />
                <h2 className="h6 fw-bold mb-0">
                  Invite an internal team member
                </h2>
              </div>

              <button
                type="button"
                className="btn btn-light btn-sm"
                onClick={() => setShowInviteForm(false)}
                disabled={saving}
              >
                <X size={17} />
              </button>
            </div>

            <form onSubmit={createInvitation}>
              <div className="p-3 p-lg-4">
                <div className="row g-3">
                  <div className="col-12 col-md-7">
                    <label className="piq-form-label">
                      Email address <span className="text-danger">*</span>
                    </label>

                    <input
                      type="email"
                      required
                      maxLength={255}
                      value={memberForm.email}
                      onChange={(event) =>
                        setMemberForm((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                      placeholder="employee@company.com"
                      className="piq-form-control"
                      style={fieldStyle}
                    />
                  </div>

                  <div className="col-12 col-md-5">
                    <label className="piq-form-label">
                      Organization role
                    </label>

                    <select
                      value={memberForm.role}
                      onChange={(event) =>
                        setMemberForm((current) => ({
                          ...current,
                          role: event.target.value,
                        }))
                      }
                      className="piq-form-control"
                      style={fieldStyle}
                    >
                      {roleOptions.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="small text-secondary mt-3">
                  The invitation expires after 7 days. The invited person must accept it using the matching email address.
                </div>
              </div>

              <div
                className="d-flex justify-content-end gap-2 p-3"
                style={{
                  borderTop: "1px solid var(--bs-border-color, #e5e7eb)",
                  background: "var(--bs-tertiary-bg, #f8f9fa)",
                }}
              >
                <button
                  type="button"
                  className="piq-btn-outline"
                  onClick={() => setShowInviteForm(false)}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="piq-btn-primary d-inline-flex align-items-center gap-2"
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      Create invitation
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* PROVIDER FORM */}

        {activeTab === "external" && showProviderForm && (
          <section className="mb-4 overflow-hidden" style={cardStyle}>
            <div
              className="d-flex justify-content-between align-items-center gap-3 p-3"
              style={{
                background: "var(--bs-tertiary-bg, #f8f9fa)",
                borderBottom: "1px solid var(--bs-border-color, #e5e7eb)",
              }}
            >
              <div className="d-flex align-items-center gap-2">
                <BriefcaseBusiness size={18} className="text-primary" />

                <h2 className="h6 fw-bold mb-0">
                  {editingProvider
                    ? "Edit service provider"
                    : "Add external service provider"}
                </h2>
              </div>

              <button
                type="button"
                className="btn btn-light btn-sm"
                onClick={() => setShowProviderForm(false)}
                disabled={saving}
              >
                <X size={17} />
              </button>
            </div>

            <form onSubmit={saveProvider}>
              <div className="p-3 p-lg-4">

                <div className="mb-4">
                  <h3 className="small fw-bold mb-3">
                    COMPANY INFORMATION
                  </h3>

                  <div className="row g-3">
                    <div className="col-12 col-md-6">
                      <label className="piq-form-label">
                        Company name <span className="text-danger">*</span>
                      </label>

                      <input
                        required
                        maxLength={200}
                        value={providerForm.companyName}
                        onChange={(event) =>
                          updateProviderField("companyName", event.target.value)
                        }
                        placeholder="e.g. ABC Property Services"
                        className="piq-form-control"
                        style={fieldStyle}
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="piq-form-label">
                        Primary contact name
                      </label>

                      <input
                        maxLength={200}
                        value={providerForm.contactName}
                        onChange={(event) =>
                          updateProviderField("contactName", event.target.value)
                        }
                        placeholder="Contact person"
                        className="piq-form-control"
                        style={fieldStyle}
                      />
                    </div>
                  </div>
                </div>

                <div
                  className="pt-4 mb-4"
                  style={{
                    borderTop: "1px solid var(--bs-border-color, #e5e7eb)",
                  }}
                >
                  <h3 className="small fw-bold mb-3">
                    CONTACT INFORMATION
                  </h3>

                  <div className="row g-3">
                    <div className="col-12 col-md-4">
                      <label className="piq-form-label">
                        Email
                      </label>

                      <input
                        type="email"
                        maxLength={255}
                        value={providerForm.email}
                        onChange={(event) =>
                          updateProviderField("email", event.target.value)
                        }
                        placeholder="contact@company.com"
                        className="piq-form-control"
                        style={fieldStyle}
                      />
                    </div>

                    <div className="col-12 col-md-4">
                      <label className="piq-form-label">
                        Phone
                      </label>

                      <input
                        maxLength={50}
                        value={providerForm.phone}
                        onChange={(event) =>
                          updateProviderField("phone", event.target.value)
                        }
                        placeholder="Phone number"
                        className="piq-form-control"
                        style={fieldStyle}
                      />
                    </div>

                    <div className="col-12 col-md-4">
                      <label className="piq-form-label">
                        Website
                      </label>

                      <input
                        maxLength={500}
                        value={providerForm.website}
                        onChange={(event) =>
                          updateProviderField("website", event.target.value)
                        }
                        placeholder="https://company.com"
                        className="piq-form-control"
                        style={fieldStyle}
                      />
                    </div>
                  </div>
                </div>

                <div
                  className="pt-4 mb-4"
                  style={{
                    borderTop: "1px solid var(--bs-border-color, #e5e7eb)",
                  }}
                >
                  <h3 className="small fw-bold mb-3">
                    BUSINESS ADDRESS
                  </h3>

                  <div className="row g-3">
                    <div className="col-12 col-md-6">
                      <label className="piq-form-label">
                        Street address
                      </label>

                      <input
                        maxLength={255}
                        value={providerForm.address}
                        onChange={(event) =>
                          updateProviderField("address", event.target.value)
                        }
                        className="piq-form-control"
                        style={fieldStyle}
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="piq-form-label">
                        City
                      </label>

                      <input
                        maxLength={100}
                        value={providerForm.city}
                        onChange={(event) =>
                          updateProviderField("city", event.target.value)
                        }
                        className="piq-form-control"
                        style={fieldStyle}
                      />
                    </div>

                    <div className="col-12 col-md-4">
                      <label className="piq-form-label">
                        Province / State
                      </label>

                      <input
                        maxLength={100}
                        value={providerForm.province}
                        onChange={(event) =>
                          updateProviderField("province", event.target.value)
                        }
                        className="piq-form-control"
                        style={fieldStyle}
                      />
                    </div>

                    <div className="col-12 col-md-4">
                      <label className="piq-form-label">
                        Postal code
                      </label>

                      <input
                        maxLength={30}
                        value={providerForm.postalCode}
                        onChange={(event) =>
                          updateProviderField("postalCode", event.target.value)
                        }
                        className="piq-form-control"
                        style={fieldStyle}
                      />
                    </div>

                    <div className="col-12 col-md-4">
                      <label className="piq-form-label">
                        Country
                      </label>

                      <input
                        maxLength={100}
                        value={providerForm.country}
                        onChange={(event) =>
                          updateProviderField("country", event.target.value)
                        }
                        className="piq-form-control"
                        style={fieldStyle}
                      />
                    </div>
                  </div>
                </div>

                <div
                  className="pt-4"
                  style={{
                    borderTop: "1px solid var(--bs-border-color, #e5e7eb)",
                  }}
                >
                  <h3 className="small fw-bold mb-3">
                    INTERNAL NOTES
                  </h3>

                  <textarea
                    rows={3}
                    value={providerForm.notes}
                    onChange={(event) =>
                      updateProviderField("notes", event.target.value)
                    }
                    placeholder="Additional information about this company..."
                    className="piq-form-control"
                    style={{ borderRadius: "9px", resize: "vertical" }}
                  />
                </div>
              </div>

              <div
                className="d-flex justify-content-end gap-2 p-3"
                style={{
                  borderTop: "1px solid var(--bs-border-color, #e5e7eb)",
                  background: "var(--bs-tertiary-bg, #f8f9fa)",
                }}
              >
                <button
                  type="button"
                  className="piq-btn-outline"
                  onClick={() => setShowProviderForm(false)}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="piq-btn-primary d-inline-flex align-items-center gap-2"
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      {editingProvider ? "Save changes" : "Create provider"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* PROPERTY ACCESS PANEL */}

        {activeTab === "internal" && showPropertyAccess && editingMember && (
          <section className="mb-4 overflow-hidden" style={cardStyle}>
            <div
              className="d-flex justify-content-between align-items-center gap-3 p-3"
              style={{
                background: "var(--bs-tertiary-bg, #f8f9fa)",
                borderBottom: "1px solid var(--bs-border-color, #e5e7eb)",
              }}
            >
              <div>
                <h2 className="h6 fw-bold mb-1">
                  Property access
                </h2>

                <p className="small text-secondary mb-0">
                  {getMemberName(editingMember)} — select the properties this member can access.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-light btn-sm"
                onClick={() => setShowPropertyAccess(false)}
                disabled={saving}
              >
                <X size={17} />
              </button>
            </div>

            <div className="p-3 p-lg-4">
              {memberPropertiesLoading ? (
                <div className="text-center py-4">
                  <div className="spinner-border spinner-border-sm text-primary mb-2" />
                  <div className="small text-secondary">
                    Loading property access...
                  </div>
                </div>
              ) : properties.length === 0 ? (
                <div className="text-center py-4">
                  <Building2 size={26} className="text-secondary mb-2" />
                  <p className="small text-secondary mb-0">
                    There are no properties available in this organization.
                  </p>
                </div>
              ) : (
                <>
                  <div className="d-flex flex-wrap justify-content-between gap-2 mb-3">
                    <span className="small text-secondary">
                      {memberPropertyIds.length} of {properties.length} properties selected
                    </span>

                    <div className="d-flex gap-3">
                      <button
                        type="button"
                        className="btn btn-link btn-sm p-0 text-decoration-none"
                        onClick={() =>
                          setMemberPropertyIds(
                            properties.map((property) => property.PropertyId)
                          )
                        }
                      >
                        Select all
                      </button>

                      <button
                        type="button"
                        className="btn btn-link btn-sm p-0 text-decoration-none"
                        onClick={() => setMemberPropertyIds([])}
                      >
                        Clear all
                      </button>
                    </div>
                  </div>

                  <div className="row g-2">
                    {properties.map((property) => (
                      <div
                        className="col-12 col-md-6"
                        key={property.PropertyId}
                      >
                        <label
                          className="d-flex align-items-start gap-3 p-3 h-100"
                          style={{
                            border: "1px solid var(--bs-border-color, #e5e7eb)",
                            borderRadius: "10px",
                            cursor: "pointer",
                            background: memberPropertyIds.includes(
                              property.PropertyId
                            )
                              ? "rgba(13, 110, 253, 0.045)"
                              : "transparent",
                          }}
                        >
                          <input
                            type="checkbox"
                            className="form-check-input mt-1"
                            checked={memberPropertyIds.includes(
                              property.PropertyId
                            )}
                            onChange={() =>
                              toggleProperty(property.PropertyId)
                            }
                          />

                          <span className="min-w-0">
                            <span className="d-block fw-semibold small">
                              {property.PropertyName}
                            </span>

                            <span className="d-block text-secondary small mt-1">
                              {[property.Address, property.City, property.Province]
                                .filter(Boolean)
                                .join(", ") || "No address available"}
                            </span>
                          </span>
                        </label>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div
              className="d-flex justify-content-end gap-2 p-3"
              style={{
                borderTop: "1px solid var(--bs-border-color, #e5e7eb)",
                background: "var(--bs-tertiary-bg, #f8f9fa)",
              }}
            >
              <button
                type="button"
                className="piq-btn-outline"
                onClick={() => setShowPropertyAccess(false)}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="button"
                className="piq-btn-primary d-inline-flex align-items-center gap-2"
                onClick={() => void savePropertyAccess()}
                disabled={saving || memberPropertiesLoading}
              >
                <CheckCircle2 size={16} />
                Save property access
              </button>
            </div>
          </section>
        )}

        {/* SEARCH AND FILTERS */}

        <div className="p-3 mb-3" style={cardStyle}>
          <div className="d-flex flex-wrap align-items-center gap-2">
            <div
              className="position-relative flex-grow-1"
              style={{ minWidth: "210px" }}
            >
              <Search
                size={16}
                className="position-absolute top-50 translate-middle-y text-secondary"
                style={{ left: "13px", pointerEvents: "none" }}
              />

              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={
                  activeTab === "internal"
                    ? "Search members by name, email, or role..."
                    : "Search companies, contacts, email, or city..."
                }
                className="piq-form-control w-100"
                style={{
                  ...fieldStyle,
                  paddingLeft: "39px",
                }}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="piq-form-control"
              style={{ ...fieldStyle, minWidth: "155px" }}
              aria-label="Filter by status"
            >
              <option value="All">All statuses</option>

              {activeTab === "internal" ? (
                <>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </>
              ) : (
                <>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </>
              )}
            </select>

            {(searchTerm || statusFilter !== "All") && (
              <button
                type="button"
                className="btn btn-sm btn-link text-decoration-none"
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("All");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* LOADING */}

        {authLoading || loading ? (
          <div className="text-center py-5" style={cardStyle}>
            <div
              className="spinner-border text-primary mb-3"
              role="status"
            >
              <span className="visually-hidden">Loading...</span>
            </div>

            <h3 className="h6 fw-bold mb-1">
              Loading team information
            </h3>

            <p className="small text-secondary mb-0">
              Retrieving members, invitations, and service providers...
            </p>
          </div>
        ) : (
          <>
            {/* INTERNAL TEAM */}

            {activeTab === "internal" && (
              <section>
                <div className="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3">
                  <div>
                    <h2 className="h5 fw-bold mb-1">
                      Internal team members
                    </h2>

                    <p className="small text-secondary mb-0">
                      People who have access to your PropertyIQ organization.
                    </p>
                  </div>

                  <span className="small text-secondary">
                    {filteredMembers.length} members
                  </span>
                </div>

                {filteredMembers.length === 0 ? (
                  <div className="text-center py-5 px-3" style={cardStyle}>
                    <div
                      className="mx-auto mb-3 d-flex align-items-center justify-content-center"
                      style={{
                        width: "60px",
                        height: "60px",
                        borderRadius: "16px",
                        background: "rgba(13, 110, 253, 0.09)",
                        color: "#0d6efd",
                      }}
                    >
                      <Users size={27} />
                    </div>

                    <h3 className="h5 fw-bold mb-2">
                      {members.length === 0
                        ? "No internal team members yet"
                        : "No matching members"}
                    </h3>

                    <p
                      className="text-secondary small mx-auto mb-4"
                      style={{ maxWidth: "430px" }}
                    >
                      Invite employees and team members to give them access to your organization and its properties.
                    </p>

                    {members.length === 0 && (
                      <button
                        type="button"
                        onClick={openInviteForm}
                        className="piq-btn-primary d-inline-flex align-items-center gap-2"
                      >
                        <Plus size={17} />
                        Invite your first member
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="row g-3">
                    {filteredMembers.map((member) => (
                      <div
                        className="col-12 col-xl-6"
                        key={member.membershipId}
                      >
                        <article
                          className="p-3 p-lg-4 h-100"
                          style={cardStyle}
                        >
                          <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
                            <div className="d-flex align-items-start gap-3 min-w-0">
                              <div
                                className="d-flex align-items-center justify-content-center flex-shrink-0"
                                style={{
                                  width: "44px",
                                  height: "44px",
                                  borderRadius: "12px",
                                  background: "rgba(13, 110, 253, 0.10)",
                                  color: "#0d6efd",
                                }}
                              >
                                <UserRound size={21} />
                              </div>

                              <div className="min-w-0">
                                <h3 className="fw-bold mb-1 text-break" style={{ fontSize: "15px" }}>
                                  {getMemberName(member)}
                                </h3>

                                <div className="small text-secondary text-break">
                                  {member.email}
                                </div>
                              </div>
                            </div>

                            <span
                              style={statusStyle(
                                member.userStatus?.toLowerCase() === "active"
                                  ? "active"
                                  : "inactive"
                              )}
                            >
                              {member.userStatus || "Unknown"}
                            </span>
                          </div>

                          <div
                            className="d-flex flex-wrap align-items-center gap-3 py-3 mb-3"
                            style={{
                              borderTop: "1px solid var(--bs-border-color, #e5e7eb)",
                              borderBottom: "1px solid var(--bs-border-color, #e5e7eb)",
                            }}
                          >
                            <div className="d-flex align-items-center gap-2">
                              <Shield size={15} className="text-secondary" />
                              <span style={roleStyle(member.role)}>
                                {member.role}
                              </span>
                            </div>

                            <div className="d-flex align-items-center gap-2 small text-secondary">
                              <Building2 size={15} />
                              {member.assignedPropertyCount ?? 0} properties
                            </div>

                            <div className="d-flex align-items-center gap-2 small text-secondary">
                              <Clock size={15} />
                              Joined {formatDate(member.joinedAt)}
                            </div>
                          </div>

                          <div className="d-flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="btn btn-sm btn-light d-inline-flex align-items-center gap-2"
                              onClick={() => void openPropertyAccess(member)}
                              disabled={saving || member.role.toLowerCase() === "owner"}
                              title={
                                member.role.toLowerCase() === "owner"
                                  ? "Owner property access cannot be edited here"
                                  : "Manage property access"
                              }
                            >
                              <Building2 size={15} />
                              Property access
                            </button>

                            {member.role.toLowerCase() !== "owner" && (
                              <>
                                <select
                                  aria-label={`Change role for ${getMemberName(member)}`}
                                  value={member.role}
                                  disabled={saving}
                                  onChange={(event) =>
                                    void updateMemberRole(
                                      member,
                                      event.target.value
                                    )
                                  }
                                  className="form-select form-select-sm"
                                  style={{
                                    width: "auto",
                                    minWidth: "135px",
                                    borderRadius: "8px",
                                  }}
                                >
                                  {roleOptions.map((role) => (
                                    <option
                                      key={role.value}
                                      value={role.value}
                                    >
                                      {role.label}
                                    </option>
                                  ))}
                                </select>

                                <button
                                  type="button"
                                  className="btn btn-sm btn-light text-danger d-inline-flex align-items-center gap-2"
                                  onClick={() => void removeMember(member)}
                                  disabled={saving}
                                >
                                  <Trash2 size={15} />
                                  Remove
                                </button>
                              </>
                            )}
                          </div>
                        </article>
                      </div>
                    ))}
                  </div>
                )}

                {/* INVITATIONS */}

                <div className="mt-4">
                  <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                    <div>
                      <h2 className="h5 fw-bold mb-1">
                        Team invitations
                      </h2>

                      <p className="small text-secondary mb-0">
                        Track invitations sent to people joining this organization.
                      </p>
                    </div>

                    <span className="small text-secondary">
                      {invitations.length} invitations
                    </span>
                  </div>

                  {invitations.length === 0 ? (
                    <div className="p-4 text-center" style={cardStyle}>
                      <Mail size={24} className="text-secondary mb-2" />

                      <p className="small text-secondary mb-0">
                        No invitations to display, or your account does not have permission to view them.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-hidden" style={cardStyle}>
                      <div className="table-responsive">
                        <table className="table align-middle mb-0">
                          <thead>
                            <tr className="small text-secondary">
                              <th className="px-3 py-3">Email</th>
                              <th className="py-3">Role</th>
                              <th className="py-3">Status</th>
                              <th className="py-3">Expires</th>
                              <th className="py-3 text-end px-3">Action</th>
                            </tr>
                          </thead>

                          <tbody>
                            {invitations.map((invitation) => {
                              const status = getInvitationStatus(invitation);

                              return (
                                <tr key={invitation.invitationId}>
                                  <td className="px-3">
                                    <div className="small fw-semibold">
                                      {invitation.email}
                                    </div>

                                    <div className="small text-secondary">
                                      Invited {formatDate(invitation.createdAt)}
                                    </div>
                                  </td>

                                  <td>
                                    <span style={roleStyle(invitation.role)}>
                                      {invitation.role}
                                    </span>
                                  </td>

                                  <td>
                                    <span style={statusStyle(status)}>
                                      {status}
                                    </span>
                                  </td>

                                  <td className="small text-secondary">
                                    {formatDate(invitation.expiresAt)}
                                  </td>

                                  <td className="text-end px-3">
                                    {status === "pending" && (
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-light text-danger"
                                        onClick={() =>
                                          void revokeInvitation(
                                            invitation.invitationId
                                          )
                                        }
                                        disabled={saving}
                                      >
                                        Revoke
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* EXTERNAL SERVICE PROVIDERS */}

            {activeTab === "external" && (
              <section>
                <div className="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3">
                  <div>
                    <h2 className="h5 fw-bold mb-1">
                      External service providers
                    </h2>

                    <p className="small text-secondary mb-0">
                      Manage the companies that provide services to your properties.
                    </p>
                  </div>

                  <span className="small text-secondary">
                    {filteredProviders.length} companies
                  </span>
                </div>

                {filteredProviders.length === 0 ? (
                  <div className="text-center py-5 px-3" style={cardStyle}>
                    <div
                      className="mx-auto mb-3 d-flex align-items-center justify-content-center"
                      style={{
                        width: "60px",
                        height: "60px",
                        borderRadius: "16px",
                        background: "rgba(25, 135, 84, 0.10)",
                        color: "#198754",
                      }}
                    >
                      <Truck size={27} />
                    </div>

                    <h3 className="h5 fw-bold mb-2">
                      {providers.length === 0
                        ? "No service providers yet"
                        : "No matching service providers"}
                    </h3>

                    <p
                      className="text-secondary small mx-auto mb-4"
                      style={{ maxWidth: "430px" }}
                    >
                      Add contractors, maintenance companies, landscapers, cleaning services, and other external providers.
                    </p>

                    {providers.length === 0 && (
                      <button
                        type="button"
                        onClick={openNewProvider}
                        className="piq-btn-primary d-inline-flex align-items-center gap-2"
                      >
                        <Plus size={17} />
                        Add your first provider
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="row g-3">
                    {filteredProviders.map((provider) => (
                      <div
                        className="col-12 col-xl-6"
                        key={provider.serviceProviderId}
                      >
                        <article
                          className="p-3 p-lg-4 h-100"
                          style={cardStyle}
                        >
                          <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
                            <div className="d-flex align-items-start gap-3 min-w-0">
                              <div
                                className="d-flex align-items-center justify-content-center flex-shrink-0"
                                style={{
                                  width: "44px",
                                  height: "44px",
                                  borderRadius: "12px",
                                  background: "rgba(25, 135, 84, 0.10)",
                                  color: "#198754",
                                }}
                              >
                                <Truck size={21} />
                              </div>

                              <div className="min-w-0">
                                <h3
                                  className="fw-bold mb-1 text-break"
                                  style={{ fontSize: "15px" }}
                                >
                                  {provider.companyName}
                                </h3>

                                <div className="small text-secondary">
                                  {provider.contactName || "No primary contact"}
                                </div>
                              </div>
                            </div>

                            <span
                              style={statusStyle(
                                provider.status?.toLowerCase() === "active"
                                  ? "active"
                                  : "inactive"
                              )}
                            >
                              {provider.status}
                            </span>
                          </div>

                          <div
                            className="d-flex flex-column gap-2 py-3 mb-3"
                            style={{
                              borderTop: "1px solid var(--bs-border-color, #e5e7eb)",
                              borderBottom: "1px solid var(--bs-border-color, #e5e7eb)",
                            }}
                          >
                            {provider.email && (
                              <a
                                href={`mailto:${provider.email}`}
                                className="small text-secondary text-decoration-none d-flex align-items-center gap-2"
                              >
                                <Mail size={15} />
                                {provider.email}
                              </a>
                            )}

                            {provider.phone && (
                              <a
                                href={`tel:${provider.phone}`}
                                className="small text-secondary text-decoration-none d-flex align-items-center gap-2"
                              >
                                <Phone size={15} />
                                {provider.phone}
                              </a>
                            )}

                            {provider.website && (
                              <a
                                href={
                                  /^https?:\/\//i.test(provider.website)
                                    ? provider.website
                                    : `https://${provider.website}`
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="small text-secondary text-decoration-none d-flex align-items-center gap-2"
                              >
                                <Globe size={15} />
                                {provider.website}
                              </a>
                            )}

                            {(provider.address ||
                              provider.city ||
                              provider.province) && (
                              <div className="small text-secondary d-flex align-items-start gap-2">
                                <MapPin size={15} className="flex-shrink-0 mt-1" />

                                <span>
                                  {[
                                    provider.address,
                                    provider.city,
                                    provider.province,
                                    provider.postalCode,
                                    provider.country,
                                  ]
                                    .filter(Boolean)
                                    .join(", ")}
                                </span>
                              </div>
                            )}

                            {!provider.email &&
                              !provider.phone &&
                              !provider.website &&
                              !provider.address &&
                              !provider.city && (
                                <div className="small text-secondary">
                                  No additional contact information.
                                </div>
                              )}
                          </div>

                          {provider.notes && (
                            <div className="small text-secondary mb-3">
                              <strong>Notes:</strong> {provider.notes}
                            </div>
                          )}

                          <div className="d-flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="btn btn-sm btn-light d-inline-flex align-items-center gap-2"
                              onClick={() => openEditProvider(provider)}
                              disabled={saving}
                            >
                              <Edit3 size={15} />
                              Edit details
                            </button>

                            <button
                              type="button"
                              className="btn btn-sm btn-light d-inline-flex align-items-center gap-2"
                              onClick={() => void toggleProviderStatus(provider)}
                              disabled={saving}
                            >
                              {provider.status?.toLowerCase() === "active" ? (
                                <>
                                  <UserX size={15} />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <UserCheck size={15} />
                                  Activate
                                </>
                              )}
                            </button>
                          </div>
                        </article>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
