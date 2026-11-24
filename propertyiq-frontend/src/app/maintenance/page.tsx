
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
  ClipboardList,
  Plus,
  RefreshCw,
  Search,
  CalendarDays,
  Building2,
  UserRound,
  Truck,
  CheckCircle2,
  AlertCircle,
  Clock,
  X,
  Wrench,
  ListTodo,
  SlidersHorizontal,
  CalendarCheck,
  CircleDot,
  History,
  FileText,
  Mail,
  Phone,
  UserCheck,
  ChevronDown,
  ChevronUp,
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

type MaintenanceTask = {
  MaintenanceTaskId: string;
  OrganizationId: string;
  PropertyId: string;
  DeviceId: string | null;
  AssignedToUserId: string | null;
  Title: string;
  Description: string | null;
  Priority: string;
  Status: string;
  ScheduledDate: string | null;
  CompletedAt: string | null;
  CreatedAt: string;
  DeviceName?: string | null;
};

type TaskAssignment = {
  taskAssignmentId: string;
  organizationId: string;
  maintenanceTaskId: string;
  taskTitle: string;
  propertyId: string;
  propertyName: string;
  membershipId: string | null;
  serviceProviderId: string | null;
  serviceProviderName: string | null;
  assignedByUserId: string;
  assignedAt: string;
  completedAt: string | null;
  status: string;
  notes: string | null;
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
  propertyIds?: string[];
};

type ServiceProvider = {
  serviceProviderId: string;
  organizationId: string;
  companyName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
};

type ApiResponse<T = unknown> = {
  success?: boolean;
  message?: string;
  data?: T;
  errors?: Array<{
    message?: string;
  }>;
};

type TaskForm = {
  propertyId: string;
  title: string;
  description: string;
  priority: string;
  scheduledDate: string;
  assigneeType: "none" | "member" | "provider";
  membershipId: string;
  serviceProviderId: string;
  assignmentNotes: string;
};

// =====================================================
// CONSTANTS
// =====================================================

const emptyForm: TaskForm = {
  propertyId: "",
  title: "",
  description: "",
  priority: "normal",
  scheduledDate: "",
  assigneeType: "none",
  membershipId: "",
  serviceProviderId: "",
  assignmentNotes: "",
};

const priorityOptions = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const statusOptions = [
  "open",
  "in_progress",
  "completed",
  "cancelled",
];

const cardStyle = {
  border: "1px solid var(--bs-border-color, #e5e7eb)",
  borderRadius: "14px",
  background: "var(--bs-body-bg, #fff)",
  boxShadow: "0 2px 8px rgba(15, 23, 42, 0.035)",
};

const iconBoxStyle = {
  width: "44px",
  height: "44px",
  borderRadius: "12px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const fieldStyle = {
  minHeight: "44px",
  borderRadius: "9px",
};

const mutedLabelStyle = {
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.055em",
  textTransform: "uppercase" as const,
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

// =====================================================
// PAGE
// =====================================================

export default function MaintenancePage() {
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

  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [providers, setProviders] = useState<ServiceProvider[]>([]);

  const [assignmentsByTask, setAssignmentsByTask] = useState<
    Record<string, TaskAssignment[]>
  >({});

  // Hover/focus expansion.
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  // Click-to-expand state. This keeps a card open on touchscreens
  // even when there is no mouse hover.
  const [pinnedTaskId, setPinnedTaskId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<TaskForm>(emptyForm);

  const [searchTerm, setSearchTerm] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  // ===================================================
  // LOAD DATA
  // ===================================================

  const loadData = useCallback(async () => {
    if (authLoading) return;

    if (!isAuthenticated) {
      setTasks([]);
      setProperties([]);
      setMembers([]);
      setProviders([]);
      setAssignmentsByTask({});
      setPinnedTaskId(null);
      setError("Your session has expired. Please log in again.");
      setLoading(false);
      return;
    }

    if (!activeOrganizationId) {
      setTasks([]);
      setProperties([]);
      setMembers([]);
      setProviders([]);
      setAssignmentsByTask({});
      setPinnedTaskId(null);
      setError("Select an organization to view maintenance tasks.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const errors: string[] = [];

    try {
      const [
        tasksResponse,
        propertiesResponse,
        membersResponse,
        providersResponse,
      ] = await Promise.all([
        apiFetchRef.current(
          `${API_URL}/maintenance-tasks?${organizationQuery}`,
          { method: "GET", cache: "no-store" }
        ),
        apiFetchRef.current(
          `${API_URL}/properties?${organizationQuery}`,
          { method: "GET", cache: "no-store" }
        ),
        apiFetchRef.current(
          `${API_URL}/teams/members?${organizationQuery}`,
          { method: "GET", cache: "no-store" }
        ),
        apiFetchRef.current(
          `${API_URL}/service-providers?${organizationQuery}`,
          { method: "GET", cache: "no-store" }
        ),
      ]);

      const [
        tasksResult,
        propertiesResult,
        membersResult,
        providersResult,
      ] = await Promise.all([
        readApiResponse<MaintenanceTask[]>(tasksResponse),
        readApiResponse<Property[]>(propertiesResponse),
        readApiResponse<TeamMember[]>(membersResponse),
        readApiResponse<ServiceProvider[]>(providersResponse),
      ]);

      let loadedTasks: MaintenanceTask[] = [];

      if (!tasksResponse.ok || !tasksResult.success) {
        errors.push(
          getErrorMessage(tasksResult, "Could not load maintenance tasks.")
        );
        setTasks([]);
        setAssignmentsByTask({});
      } else {
        loadedTasks = getArrayData(tasksResult);
        setTasks(loadedTasks);

        const assignmentEntries = await Promise.all(
          loadedTasks.map(async (task) => {
            try {
              const response = await apiFetchRef.current(
                `${API_URL}/maintenance-task-assignments/task/${encodeURIComponent(
                  task.MaintenanceTaskId
                )}?${organizationQuery}`,
                {
                  method: "GET",
                  cache: "no-store",
                }
              );

              const result = await readApiResponse<TaskAssignment[]>(response);

              if (!response.ok || !result.success) {
                console.error(
                  "Could not load assignment history for task:",
                  task.MaintenanceTaskId,
                  result.message
                );

                return [task.MaintenanceTaskId, []] as const;
              }

              return [
                task.MaintenanceTaskId,
                getArrayData(result),
              ] as const;
            } catch (assignmentError) {
              console.error(
                "Assignment history request failed:",
                task.MaintenanceTaskId,
                assignmentError
              );

              return [task.MaintenanceTaskId, []] as const;
            }
          })
        );

        setAssignmentsByTask(
          Object.fromEntries(assignmentEntries)
        );
      }

      if (!propertiesResponse.ok || !propertiesResult.success) {
        errors.push(
          getErrorMessage(propertiesResult, "Could not load properties.")
        );
        setProperties([]);
      } else {
        setProperties(getArrayData(propertiesResult));
      }

      if (!membersResponse.ok || !membersResult.success) {
        errors.push(
          getErrorMessage(
            membersResult,
            "Internal team members could not be loaded."
          )
        );
        setMembers([]);
      } else {
        const activeMembers = getArrayData(membersResult).filter(
          (member) => member.userStatus?.toLowerCase() === "active"
        );

        const membersWithProperties = await Promise.all(
          activeMembers.map(async (member) => {
            try {
              const response = await apiFetchRef.current(
                `${API_URL}/teams/members/${member.membershipId}/properties?${organizationQuery}`,
                { method: "GET", cache: "no-store" }
              );

              const result = await readApiResponse<
                Array<{
                  PropertyId?: string;
                  propertyId?: string;
                }>
              >(response);

              if (!response.ok || !result.success) {
                console.error(
                  "Could not load property access for team member:",
                  member.membershipId,
                  result.message
                );

                return { ...member, propertyIds: [] };
              }

              return {
                ...member,
                propertyIds: getArrayData(result)
                  .map((property) =>
                    property.PropertyId ?? property.propertyId ?? ""
                  )
                  .filter(Boolean),
              };
            } catch (err) {
              console.error(
                "Team member property access request failed:",
                member.membershipId,
                err
              );

              return { ...member, propertyIds: [] };
            }
          })
        );

        setMembers(membersWithProperties);
      }

      if (!providersResponse.ok || !providersResult.success) {
        errors.push(
          getErrorMessage(
            providersResult,
            "Service providers could not be loaded."
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
          : "Unable to load Maintenance. Check that your backend is running."
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
  // FORM HELPERS
  // ===================================================

  function updateField(field: keyof TaskForm, value: string) {
    setForm((current) => {
      const updated = {
        ...current,
        [field]: value,
      };

      if (field === "propertyId") {
        updated.membershipId = "";
        updated.serviceProviderId = "";
      }

      if (field === "assigneeType") {
        updated.membershipId = "";
        updated.serviceProviderId = "";
      }

      return updated;
    });
  }

  function startNewTask() {
    setForm({
      ...emptyForm,
      propertyId: propertyFilter !== "All" ? propertyFilter : "",
    });

    setError("");
    setSuccess("");
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;

    setShowForm(false);
    setForm(emptyForm);
  }

  // ===================================================
  // ASSIGNEES
  // ===================================================

  const selectedPropertyId = form.propertyId.trim().toLowerCase();

  const availableMembers = members.filter((member) =>
    member.propertyIds?.some(
      (propertyId) =>
        propertyId.trim().toLowerCase() === selectedPropertyId
    )
  );

  const activeProviders = providers.filter(
    (provider) => provider.status?.toLowerCase() === "active"
  );

  // ===================================================
  // CREATE TASK
  // ===================================================

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isAuthenticated || !activeOrganizationId) {
      setError(
        "Please log in and select an organization before creating a task."
      );
      return;
    }

    if (!form.propertyId) {
      setError("Please select a property.");
      return;
    }

    if (!form.title.trim()) {
      setError("Please enter a task title.");
      return;
    }

    if (form.assigneeType === "member" && !form.membershipId) {
      setError("Please select an internal team member.");
      return;
    }

    if (form.assigneeType === "provider" && !form.serviceProviderId) {
      setError("Please select a service provider.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const taskBody = {
        propertyId: form.propertyId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        status: "open",
        scheduledDate: form.scheduledDate
          ? `${form.scheduledDate}T12:00:00.000Z`
          : null,
      };

      const taskResponse = await apiFetchRef.current(
        `${API_URL}/maintenance-tasks?${organizationQuery}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(taskBody),
        }
      );

      const taskResult =
        await readApiResponse<MaintenanceTask>(taskResponse);

      if (
        !taskResponse.ok ||
        !taskResult.success ||
        !taskResult.data
      ) {
        throw new Error(
          getErrorMessage(taskResult, "Could not create the maintenance task.")
        );
      }

      const createdTask = taskResult.data;

      if (form.assigneeType !== "none") {
        const assignmentBody = {
          maintenanceTaskId: createdTask.MaintenanceTaskId,
          membershipId:
            form.assigneeType === "member" ? form.membershipId : null,
          serviceProviderId:
            form.assigneeType === "provider"
              ? form.serviceProviderId
              : null,
          notes: form.assignmentNotes.trim() || null,
        };

        const assignmentResponse = await apiFetchRef.current(
          `${API_URL}/maintenance-task-assignments?${organizationQuery}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(assignmentBody),
          }
        );

        const assignmentResult =
          await readApiResponse(assignmentResponse);

        if (!assignmentResponse.ok || !assignmentResult.success) {
          throw new Error(
            getErrorMessage(
              assignmentResult,
              "The task was created, but its assignment could not be saved."
            )
          );
        }
      }

      setSuccess(
        form.assigneeType === "none"
          ? "Maintenance task created successfully."
          : "Maintenance task created and assigned successfully."
      );

      setShowForm(false);
      setForm(emptyForm);

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create the maintenance task."
      );
    } finally {
      setSaving(false);
    }
  }

  // ===================================================
  // FILTERS AND STATISTICS
  // ===================================================

  const filteredTasks = tasks.filter((task) => {
    const query = searchTerm.trim().toLowerCase();

    const property = properties.find(
      (item) => item.PropertyId === task.PropertyId
    );

    const matchesSearch =
      !query ||
      [
        task.Title,
        task.Description,
        task.DeviceName,
        property?.PropertyName,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));

    const matchesProperty =
      propertyFilter === "All" || task.PropertyId === propertyFilter;

    const matchesStatus =
      statusFilter === "All" ||
      task.Status?.toLowerCase() === statusFilter;

    return matchesSearch && matchesProperty && matchesStatus;
  });

  const openCount = tasks.filter(
    (task) => task.Status?.toLowerCase() === "open"
  ).length;

  const inProgressCount = tasks.filter(
    (task) => task.Status?.toLowerCase() === "in_progress"
  ).length;

  const completedCount = tasks.filter(
    (task) => task.Status?.toLowerCase() === "completed"
  ).length;

  const urgentCount = tasks.filter(
    (task) =>
      task.Priority?.toLowerCase() === "urgent" &&
      !["completed", "cancelled"].includes(task.Status?.toLowerCase())
  ).length;

  // ===================================================
  // DISPLAY HELPERS
  // ===================================================

  function formatStatus(value: string) {
    return value
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function formatPriority(value: string) {
    return value
      ? value.charAt(0).toUpperCase() + value.slice(1)
      : "Normal";
  }

  function statusStyle(status: string): React.CSSProperties {
    const common: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "6px 10px",
      borderRadius: "20px",
      fontSize: "11px",
      fontWeight: 700,
      whiteSpace: "nowrap",
    };

    switch (status?.toLowerCase()) {
      case "completed":
        return {
          ...common,
          background: "rgba(25, 135, 84, 0.11)",
          color: "#198754",
        };
      case "in_progress":
        return {
          ...common,
          background: "rgba(13, 110, 253, 0.10)",
          color: "#0d6efd",
        };
      case "cancelled":
        return {
          ...common,
          background: "rgba(108, 117, 125, 0.12)",
          color: "#6c757d",
        };
      default:
        return {
          ...common,
          background: "rgba(255, 193, 7, 0.15)",
          color: "#9a6700",
        };
    }
  }

  function priorityStyle(priority: string): React.CSSProperties {
    const common: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      padding: "5px 9px",
      borderRadius: "7px",
      fontSize: "11px",
      fontWeight: 700,
    };

    switch (priority?.toLowerCase()) {
      case "urgent":
        return {
          ...common,
          color: "#dc3545",
          background: "rgba(220, 53, 69, 0.10)",
        };
      case "high":
        return {
          ...common,
          color: "#b7791f",
          background: "rgba(255, 193, 7, 0.16)",
        };
      case "low":
        return {
          ...common,
          color: "#6c757d",
          background: "rgba(108, 117, 125, 0.10)",
        };
      default:
        return {
          ...common,
          color: "#0d6efd",
          background: "rgba(13, 110, 253, 0.09)",
        };
    }
  }

  function getPropertyName(propertyId: string) {
    return (
      properties.find(
        (property) => property.PropertyId === propertyId
      )?.PropertyName || "Unknown property"
    );
  }

  function formatDate(value: string | null) {
    if (!value) return "Not scheduled";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "Invalid date";

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatDateTime(value: string | null) {
    if (!value) return "Not available";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "Not available";

    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function getMemberName(membershipId: string | null) {
    if (!membershipId) return null;

    const member = members.find(
      (item) => item.membershipId === membershipId
    );

    if (!member) return "Team member";

    return (
      [member.firstName, member.lastName]
        .filter(Boolean)
        .join(" ") || member.email
    );
  }

  function getMemberDetails(membershipId: string | null) {
    if (!membershipId) return null;

    return (
      members.find((item) => item.membershipId === membershipId) ?? null
    );
  }

  function getProviderDetails(serviceProviderId: string | null) {
    if (!serviceProviderId) return null;

    return (
      providers.find(
        (item) => item.serviceProviderId === serviceProviderId
      ) ?? null
    );
  }

  function getAssignmentName(assignment: TaskAssignment) {
    if (assignment.serviceProviderId) {
      return (
        assignment.serviceProviderName ||
        getProviderDetails(assignment.serviceProviderId)?.companyName ||
        "Service provider"
      );
    }

    if (assignment.membershipId) {
      return getMemberName(assignment.membershipId) || "Team member";
    }

    return "Unassigned";
  }

  function getAssignmentType(assignment: TaskAssignment) {
    if (assignment.serviceProviderId) {
      return "External service provider";
    }

    if (assignment.membershipId) {
      return "Internal team member";
    }

    return "Unassigned";
  }

  function getCurrentAssignment(taskId: string) {
    const history = assignmentsByTask[taskId] ?? [];

    return (
      history.find(
        (assignment) =>
          !["cancelled", "completed"].includes(
            assignment.status?.toLowerCase()
          )
      ) ?? history[0] ?? null
    );
  }

  function getAssigneeSummary(task: MaintenanceTask) {
    const assignment = getCurrentAssignment(task.MaintenanceTaskId);

    if (assignment) {
      return getAssignmentName(assignment);
    }

    if (assignmentsByTask[task.MaintenanceTaskId]?.length === 0) {
      return "No current assignment";
    }

    return task.AssignedToUserId
      ? "Internal team member"
      : "No current assignment";
  }

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
    tone: "blue" | "cyan" | "amber" | "red";
  }) {
    const tones = {
      blue: {
        background: "rgba(13, 110, 253, 0.10)",
        color: "#0d6efd",
      },
      cyan: {
        background: "rgba(13, 202, 240, 0.12)",
        color: "#087990",
      },
      amber: {
        background: "rgba(255, 193, 7, 0.16)",
        color: "#9a6700",
      },
      red: {
        background: "rgba(220, 53, 69, 0.10)",
        color: "#dc3545",
      },
    };

    return (
      <div className="h-100 p-3 p-lg-4" style={cardStyle}>
        <div className="d-flex align-items-start justify-content-between gap-3">
          <div>
            <div
              className="text-secondary mb-2"
              style={{ fontSize: "13px", fontWeight: 600 }}
            >
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
            style={{
              ...iconBoxStyle,
              ...tones[tone],
              width: "46px",
              height: "46px",
            }}
          >
            {icon}
          </div>
        </div>
      </div>
    );
  }

  // ===================================================
  // ASSIGNMENT DETAILS PANEL
  // ===================================================

  function AssignmentDetails({
    task,
  }: {
    task: MaintenanceTask;
  }) {
    const history = assignmentsByTask[task.MaintenanceTaskId] ?? [];
    const currentAssignment = getCurrentAssignment(
      task.MaintenanceTaskId
    );

    return (
      <div
        className="mt-3 pt-3"
        style={{
          borderTop: "1px solid var(--bs-border-color, #e5e7eb)",
        }}
      >
        <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
          <div className="d-flex align-items-center gap-2 fw-bold small">
            <UserCheck size={16} className="text-primary" />
            Assignment details
          </div>

          <span className="small text-secondary">
            {history.length} {history.length === 1 ? "record" : "records"}
          </span>
        </div>

        {currentAssignment ? (
          <div
            className="p-3 mb-3"
            style={{
              borderRadius: "10px",
              background: "var(--bs-tertiary-bg, #f8f9fa)",
            }}
          >
            <div className="d-flex align-items-start justify-content-between gap-2 mb-3">
              <div className="d-flex align-items-start gap-2 min-w-0">
                <div
                  className="d-flex align-items-center justify-content-center flex-shrink-0"
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: "rgba(13, 110, 253, 0.10)",
                    color: "#0d6efd",
                  }}
                >
                  {currentAssignment.serviceProviderId ? (
                    <Truck size={17} />
                  ) : (
                    <UserRound size={17} />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="fw-bold small text-break">
                    {getAssignmentName(currentAssignment)}
                  </div>

                  <div className="small text-secondary">
                    {getAssignmentType(currentAssignment)}
                  </div>
                </div>
              </div>

              <span style={statusStyle(currentAssignment.status)}>
                {formatStatus(currentAssignment.status)}
              </span>
            </div>

            {currentAssignment.membershipId && (
              <div className="d-flex flex-wrap gap-3 mb-2">
                {(() => {
                  const member = getMemberDetails(
                    currentAssignment.membershipId
                  );

                  if (!member) return null;

                  return (
                    <>
                      {member.email && (
                        <a
                          href={`mailto:${member.email}`}
                          className="small text-secondary text-decoration-none d-inline-flex align-items-center gap-1"
                        >
                          <Mail size={13} />
                          {member.email}
                        </a>
                      )}

                      {member.role && (
                        <span className="small text-secondary">
                          Role: {member.role}
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {currentAssignment.serviceProviderId && (
              <div className="d-flex flex-wrap gap-3 mb-2">
                {(() => {
                  const provider = getProviderDetails(
                    currentAssignment.serviceProviderId
                  );

                  if (!provider) return null;

                  return (
                    <>
                      {provider.contactName && (
                        <span className="small text-secondary">
                          Contact: {provider.contactName}
                        </span>
                      )}

                      {provider.email && (
                        <a
                          href={`mailto:${provider.email}`}
                          className="small text-secondary text-decoration-none d-inline-flex align-items-center gap-1"
                        >
                          <Mail size={13} />
                          {provider.email}
                        </a>
                      )}

                      {provider.phone && (
                        <a
                          href={`tel:${provider.phone}`}
                          className="small text-secondary text-decoration-none d-inline-flex align-items-center gap-1"
                        >
                          <Phone size={13} />
                          {provider.phone}
                        </a>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            <div className="small text-secondary d-flex align-items-center gap-2">
              <CalendarDays size={13} />
              Assigned {formatDateTime(currentAssignment.assignedAt)}
            </div>

            {currentAssignment.completedAt && (
              <div className="small text-secondary d-flex align-items-center gap-2 mt-1">
                <CheckCircle2 size={13} />
                Completed {formatDateTime(currentAssignment.completedAt)}
              </div>
            )}

            {currentAssignment.notes && (
              <div className="mt-3 pt-3 border-top">
                <div
                  className="text-secondary mb-1"
                  style={mutedLabelStyle}
                >
                  Assignment notes
                </div>

                <div className="small" style={{ lineHeight: 1.6 }}>
                  {currentAssignment.notes}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            className="p-3 mb-3"
            style={{
              borderRadius: "10px",
              background: "var(--bs-tertiary-bg, #f8f9fa)",
            }}
          >
            <div className="d-flex align-items-center gap-2 small fw-semibold">
              <UserRound size={16} className="text-secondary" />
              No assignment recorded
            </div>

            <p className="small text-secondary mb-0 mt-1">
              This task has not been assigned to an internal team member or service provider.
            </p>
          </div>
        )}

        {history.length > 1 && (
          <div>
            <div className="d-flex align-items-center gap-2 small fw-bold mb-2">
              <History size={15} className="text-secondary" />
              Previous assignments
            </div>

            <div className="d-flex flex-column gap-2">
              {history
                .filter(
                  (assignment) =>
                    assignment.taskAssignmentId !==
                    currentAssignment?.taskAssignmentId
                )
                .slice(0, 3)
                .map((assignment) => (
                  <div
                    key={assignment.taskAssignmentId}
                    className="d-flex align-items-start justify-content-between gap-2 py-2"
                    style={{
                      borderBottom:
                        "1px solid var(--bs-border-color, #e5e7eb)",
                    }}
                  >
                    <div className="min-w-0">
                      <div className="small fw-semibold text-break">
                        {getAssignmentName(assignment)}
                      </div>

                      <div className="small text-secondary">
                        {formatDate(assignment.assignedAt)}
                      </div>

                      {assignment.notes && (
                        <div
                          className="small text-secondary mt-1"
                          style={{ overflowWrap: "anywhere" }}
                        >
                          {assignment.notes}
                        </div>
                      )}
                    </div>

                    <span className="small text-secondary text-nowrap">
                      {formatStatus(assignment.status)}
                    </span>
                  </div>
                ))}
            </div>

            {history.length > 4 && (
              <div className="small text-secondary mt-2">
                Showing the 3 most recent previous assignments.
              </div>
            )}
          </div>
        )}

        {history.length === 0 && (
          <div className="small text-secondary d-flex align-items-center gap-2">
            <FileText size={14} />
            Assignment history will appear here when the task is assigned.
          </div>
        )}
      </div>
    );
  }

  // ===================================================
  // PAGE
  // ===================================================

  return (
    <AppLayout>
      <div className="container-fluid px-0 pb-4">

        {/* PAGE HEADER */}

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
              <span className="fw-semibold">Maintenance</span>
            </div>

            <div className="d-flex align-items-center gap-3">
              <div
                style={{
                  ...iconBoxStyle,
                  width: "50px",
                  height: "50px",
                  background: "rgba(13, 110, 253, 0.10)",
                  color: "#0d6efd",
                }}
              >
                <Wrench size={24} />
              </div>

              <div>
                <h1
                  className="mb-1 fw-bold"
                  style={{
                    fontSize: "clamp(25px, 3vw, 32px)",
                    letterSpacing: "-0.8px",
                  }}
                >
                  Maintenance
                </h1>

                <p className="text-secondary mb-0" style={{ fontSize: "14px" }}>
                  Manage work orders, property repairs, and service assignments.
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

            <button
              type="button"
              onClick={startNewTask}
              disabled={
                !isAuthenticated ||
                !activeOrganizationId ||
                properties.length === 0
              }
              className="piq-btn-primary d-inline-flex align-items-center gap-2"
              style={{ minHeight: "42px" }}
            >
              <Plus size={18} />
              Create Task
            </button>
          </div>
        </div>

        {/* NOTIFICATIONS */}

        {error && (
          <div
            className="alert alert-danger d-flex align-items-start gap-2 mb-4"
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
            className="alert alert-success d-flex align-items-start gap-2 mb-4"
            role="status"
            style={{ borderRadius: "10px" }}
          >
            <CheckCircle2 size={19} className="flex-shrink-0 mt-1" />
            <div className="flex-grow-1">{success}</div>
            <button
              type="button"
              className="btn-close"
              aria-label="Dismiss success message"
              onClick={() => setSuccess("")}
            />
          </div>
        )}

        {/* SUMMARY CARDS */}

        <div className="row g-3 mb-4">
          <div className="col-12 col-sm-6 col-xl-3">
            <StatCard
              label="Total work orders"
              value={tasks.length}
              description="All recorded maintenance tasks"
              icon={<ClipboardList size={22} />}
              tone="blue"
            />
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <StatCard
              label="Open tasks"
              value={openCount}
              description="Waiting to be started"
              icon={<ListTodo size={22} />}
              tone="cyan"
            />
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <StatCard
              label="In progress"
              value={inProgressCount}
              description="Currently being worked on"
              icon={<Clock size={22} />}
              tone="amber"
            />
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <StatCard
              label="Urgent attention"
              value={urgentCount}
              description="Outstanding urgent tasks"
              icon={<AlertCircle size={22} />}
              tone="red"
            />
          </div>
        </div>

        {/* OPERATIONAL SUMMARY */}

        <div
          className="d-flex flex-wrap align-items-center gap-3 gap-lg-4 px-3 py-3 mb-4"
          style={{
            ...cardStyle,
            background: "var(--bs-tertiary-bg, #f8f9fa)",
          }}
        >
          <div className="d-flex align-items-center gap-2">
            <CheckCircle2 size={17} className="text-success" />
            <span className="small">
              <strong>{completedCount}</strong>
              <span className="text-secondary ms-1">completed</span>
            </span>
          </div>

          <div className="d-flex align-items-center gap-2">
            <Building2 size={17} className="text-secondary" />
            <span className="small">
              <strong>{properties.length}</strong>
              <span className="text-secondary ms-1">properties</span>
            </span>
          </div>

          <div className="d-flex align-items-center gap-2">
            <UserRound size={17} className="text-secondary" />
            <span className="small">
              <strong>{members.length}</strong>
              <span className="text-secondary ms-1">team members</span>
            </span>
          </div>

          <div className="d-flex align-items-center gap-2">
            <Truck size={17} className="text-secondary" />
            <span className="small">
              <strong>{activeProviders.length}</strong>
              <span className="text-secondary ms-1">service providers</span>
            </span>
          </div>
        </div>

        {/* CREATE TASK FORM */}

        {showForm && (
          <section
            className="mb-4 overflow-hidden"
            style={cardStyle}
          >
            <div
              className="d-flex justify-content-between align-items-start gap-3 px-3 px-lg-4 py-3"
              style={{
                borderBottom: "1px solid var(--bs-border-color, #e5e7eb)",
                background: "var(--bs-tertiary-bg, #f8f9fa)",
              }}
            >
              <div className="d-flex align-items-center gap-3">
                <div
                  style={{
                    ...iconBoxStyle,
                    width: "40px",
                    height: "40px",
                    background: "rgba(13, 110, 253, 0.10)",
                    color: "#0d6efd",
                  }}
                >
                  <Plus size={20} />
                </div>

                <div>
                  <h2 className="h5 fw-bold mb-1">
                    Create maintenance task
                  </h2>
                  <p className="small text-secondary mb-0">
                    Add a work order and assign responsibility.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="btn btn-light btn-sm"
                aria-label="Close task form"
                style={{ borderRadius: "8px" }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={createTask}>
              <div className="p-3 p-lg-4">
                <div className="mb-4">
                  <div className="d-flex align-items-center gap-2 mb-3">
                    <span className="text-primary">
                      <ClipboardList size={17} />
                    </span>
                    <h3 className="small fw-bold mb-0">
                      TASK DETAILS
                    </h3>
                  </div>

                  <div className="row g-3">
                    <div className="col-12 col-md-6">
                      <label className="piq-form-label">
                        Property <span className="text-danger">*</span>
                      </label>

                      <select
                        required
                        value={form.propertyId}
                        onChange={(event) =>
                          updateField("propertyId", event.target.value)
                        }
                        className="piq-form-control"
                        style={fieldStyle}
                      >
                        <option value="">Select a property</option>

                        {properties.map((property) => (
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
                        Task title <span className="text-danger">*</span>
                      </label>

                      <input
                        required
                        maxLength={200}
                        value={form.title}
                        onChange={(event) =>
                          updateField("title", event.target.value)
                        }
                        placeholder="e.g. Inspect HVAC system"
                        className="piq-form-control"
                        style={fieldStyle}
                      />
                    </div>

                    <div className="col-12">
                      <label className="piq-form-label">
                        Description and work instructions
                      </label>

                      <textarea
                        rows={3}
                        maxLength={2000}
                        value={form.description}
                        onChange={(event) =>
                          updateField("description", event.target.value)
                        }
                        placeholder="Describe the issue, required work, or any important details..."
                        className="piq-form-control"
                        style={{ borderRadius: "9px", resize: "vertical" }}
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="piq-form-label">
                        Priority <span className="text-danger">*</span>
                      </label>

                      <select
                        required
                        value={form.priority}
                        onChange={(event) =>
                          updateField("priority", event.target.value)
                        }
                        className="piq-form-control"
                        style={fieldStyle}
                      >
                        {priorityOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="piq-form-label">
                        Scheduled date
                      </label>

                      <input
                        type="date"
                        value={form.scheduledDate}
                        onChange={(event) =>
                          updateField("scheduledDate", event.target.value)
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
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <span className="text-primary">
                      <UserRound size={17} />
                    </span>
                    <h3 className="small fw-bold mb-0">
                      ASSIGNMENT
                    </h3>
                  </div>

                  <p className="small text-secondary mb-3">
                    Assign the work to an internal team member or an external service provider.
                  </p>

                  <div className="row g-3">
                    <div className="col-12 col-md-6">
                      <label className="piq-form-label">
                        Assign responsibility
                      </label>

                      <select
                        value={form.assigneeType}
                        onChange={(event) =>
                          updateField("assigneeType", event.target.value)
                        }
                        className="piq-form-control"
                        style={fieldStyle}
                      >
                        <option value="none">No assignment</option>
                        <option value="member">Internal team member</option>
                        <option value="provider">External service provider</option>
                      </select>
                    </div>

                    {form.assigneeType === "member" && (
                      <div className="col-12 col-md-6">
                        <label className="piq-form-label">
                          Team member <span className="text-danger">*</span>
                        </label>

                        <select
                          required
                          value={form.membershipId}
                          onChange={(event) =>
                            updateField("membershipId", event.target.value)
                          }
                          disabled={!form.propertyId}
                          className="piq-form-control"
                          style={{
                            ...fieldStyle,
                            cursor: form.propertyId ? "pointer" : "not-allowed",
                            appearance: "auto",
                            WebkitAppearance: "menulist",
                            position: "relative",
                            zIndex: 2,
                            pointerEvents: "auto",
                          }}
                        >
                          <option value="">
                            {!form.propertyId
                              ? "Select a property first"
                              : availableMembers.length > 0
                                ? `Select a team member (${availableMembers.length} available)`
                                : "No team members available"}
                          </option>

                          {availableMembers.map((member) => (
                            <option
                              key={member.membershipId}
                              value={member.membershipId}
                            >
                              {[
                                member.firstName,
                                member.lastName,
                              ]
                                .filter(Boolean)
                                .join(" ") || member.email}
                              {" — "}
                              {member.role}
                            </option>
                          ))}
                        </select>

                        {form.propertyId && availableMembers.length === 0 && (
                          <p className="small text-warning mt-2 mb-0">
                            No active team members with access to this property were found.
                          </p>
                        )}

                        {!form.propertyId && (
                          <p className="small text-secondary mt-2 mb-0">
                            Select a property first.
                          </p>
                        )}
                      </div>
                    )}

                    {form.assigneeType === "provider" && (
                      <div className="col-12 col-md-6">
                        <label className="piq-form-label">
                          Service provider <span className="text-danger">*</span>
                        </label>

                        <select
                          required
                          value={form.serviceProviderId}
                          onChange={(event) =>
                            updateField(
                              "serviceProviderId",
                              event.target.value
                            )
                          }
                          className="piq-form-control"
                          style={fieldStyle}
                        >
                          <option value="">Select a service provider</option>

                          {activeProviders.map((provider) => (
                            <option
                              key={provider.serviceProviderId}
                              value={provider.serviceProviderId}
                            >
                              {provider.companyName}
                              {provider.contactName
                                ? ` — ${provider.contactName}`
                                : ""}
                            </option>
                          ))}
                        </select>

                        {activeProviders.length === 0 && (
                          <p className="small text-warning mt-2 mb-0">
                            No active service providers are available.
                          </p>
                        )}
                      </div>
                    )}

                    {form.assigneeType !== "none" && (
                      <div className="col-12">
                        <label className="piq-form-label">
                          Assignment notes
                        </label>

                        <textarea
                          rows={2}
                          maxLength={1000}
                          value={form.assignmentNotes}
                          onChange={(event) =>
                            updateField("assignmentNotes", event.target.value)
                          }
                          placeholder="Provide additional instructions for the assigned person or company..."
                          className="piq-form-control"
                          style={{ borderRadius: "9px", resize: "vertical" }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div
                className="d-flex flex-wrap justify-content-end gap-2 px-3 px-lg-4 py-3"
                style={{
                  borderTop: "1px solid var(--bs-border-color, #e5e7eb)",
                  background: "var(--bs-tertiary-bg, #f8f9fa)",
                }}
              >
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="piq-btn-outline"
                >
                  Cancel
                </button>

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
                      Creating task...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={17} />
                      Create task
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* TASKS SECTION */}

        <section>
          <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
            <div>
              <div className="d-flex align-items-center gap-2 mb-1">
                <h2 className="h5 fw-bold mb-0">
                  Maintenance work orders
                </h2>
                <span
                  className="badge rounded-pill text-bg-light border"
                  style={{ fontSize: "11px" }}
                >
                  {filteredTasks.length}
                </span>
              </div>

              <p className="small text-secondary mb-0">
                Track work, monitor progress, and manage property maintenance.
              </p>
            </div>
          </div>

          {/* FILTER BAR */}

          <div
            className="p-3 mb-3"
            style={cardStyle}
          >
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
                  placeholder="Search by task, property, or description..."
                  aria-label="Search maintenance tasks"
                  className="piq-form-control w-100"
                  style={{
                    ...fieldStyle,
                    paddingLeft: "39px",
                  }}
                />
              </div>

              <div
                className="d-flex align-items-center gap-2"
                style={{ minWidth: "180px" }}
              >
                <Building2 size={16} className="text-secondary flex-shrink-0" />
                <select
                  value={propertyFilter}
                  onChange={(event) => setPropertyFilter(event.target.value)}
                  aria-label="Filter tasks by property"
                  className="piq-form-control"
                  style={{ ...fieldStyle, minWidth: "150px" }}
                >
                  <option value="All">All properties</option>

                  {properties.map((property) => (
                    <option
                      key={property.PropertyId}
                      value={property.PropertyId}
                    >
                      {property.PropertyName}
                    </option>
                  ))}
                </select>
              </div>

              <div
                className="d-flex align-items-center gap-2"
                style={{ minWidth: "165px" }}
              >
                <SlidersHorizontal
                  size={16}
                  className="text-secondary flex-shrink-0"
                />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  aria-label="Filter tasks by status"
                  className="piq-form-control"
                  style={{ ...fieldStyle, minWidth: "135px" }}
                >
                  <option value="All">All statuses</option>

                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {formatStatus(status)}
                    </option>
                  ))}
                </select>
              </div>

              {(searchTerm || propertyFilter !== "All" || statusFilter !== "All") && (
                <button
                  type="button"
                  className="btn btn-sm btn-link text-decoration-none"
                  onClick={() => {
                    setSearchTerm("");
                    setPropertyFilter("All");
                    setStatusFilter("All");
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>

            <div className="d-flex justify-content-between align-items-center mt-3 pt-2 border-top">
              <span className="small text-secondary">
                Showing <strong>{filteredTasks.length}</strong> of{" "}
                <strong>{tasks.length}</strong> work orders
              </span>

              <span className="small text-secondary d-flex align-items-center gap-1">
                <CircleDot size={12} />
                Live organization data
              </span>
            </div>
          </div>

          {/* LOADING */}

          {authLoading || loading ? (
            <div
              className="text-center py-5"
              style={cardStyle}
            >
              <div
                className="spinner-border text-primary mb-3"
                role="status"
              >
                <span className="visually-hidden">Loading...</span>
              </div>

              <h3 className="h6 fw-bold mb-1">
                Loading maintenance
              </h3>

              <p className="small text-secondary mb-0">
                Retrieving work orders, assignments, and property information...
              </p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div
              className="text-center py-5 px-3"
              style={cardStyle}
            >
              <div
                className="mx-auto mb-3"
                style={{
                  ...iconBoxStyle,
                  width: "60px",
                  height: "60px",
                  background: "rgba(13, 110, 253, 0.09)",
                  color: "#0d6efd",
                  borderRadius: "16px",
                }}
              >
                <Wrench size={27} />
              </div>

              <h3 className="h5 fw-bold mb-2">
                {tasks.length === 0
                  ? "No maintenance work orders yet"
                  : "No matching work orders"}
              </h3>

              <p
                className="text-secondary mx-auto mb-4"
                style={{ maxWidth: "430px", fontSize: "14px" }}
              >
                {tasks.length === 0
                  ? "Create your first maintenance task to start organizing repairs, inspections, and service work across your properties."
                  : "No tasks match your current search and filters. Try adjusting your criteria."}
              </p>

              {tasks.length === 0 ? (
                <button
                  type="button"
                  onClick={startNewTask}
                  disabled={properties.length === 0}
                  className="piq-btn-primary d-inline-flex align-items-center gap-2"
                >
                  <Plus size={17} />
                  Create your first task
                </button>
              ) : (
                <button
                  type="button"
                  className="piq-btn-outline"
                  onClick={() => {
                    setSearchTerm("");
                    setPropertyFilter("All");
                    setStatusFilter("All");
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            /* TASK CARDS */

            <div className="row g-3">
              {filteredTasks.map((task) => {
                const taskId = task.MaintenanceTaskId;

                const isExpanded =
                  expandedTaskId === taskId ||
                  pinnedTaskId === taskId;

                const isPinned = pinnedTaskId === taskId;

                const assignmentCount =
                  assignmentsByTask[taskId]?.length ?? 0;

                return (
                  <div
                    className="col-12 col-xl-6"
                    key={taskId}
                  >
                    <article
                      className="h-100 p-3 p-lg-4"
                      tabIndex={0}
                      onMouseEnter={() => setExpandedTaskId(taskId)}
                      onMouseLeave={() =>
                        setExpandedTaskId((current) =>
                          current === taskId ? null : current
                        )
                      }
                      onFocus={() => setExpandedTaskId(taskId)}
                      onBlur={(event) => {
                        if (
                          !event.currentTarget.contains(
                            event.relatedTarget as Node | null
                          )
                        ) {
                          setExpandedTaskId((current) =>
                            current === taskId ? null : current
                          );
                        }
                      }}
                      style={{
                        ...cardStyle,
                        transition:
                          "box-shadow 180ms ease, transform 180ms ease, border-color 180ms ease",
                        borderColor: isExpanded
                          ? "rgba(13, 110, 253, 0.35)"
                          : "var(--bs-border-color, #e5e7eb)",
                        boxShadow: isExpanded
                          ? "0 8px 24px rgba(15, 23, 42, 0.09)"
                          : cardStyle.boxShadow,
                        transform: isExpanded
                          ? "translateY(-2px)"
                          : "translateY(0)",
                        outline: "none",
                      }}
                    >
                      {/* CARD HEADER */}

                      <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
                        <div className="d-flex align-items-start gap-3 min-w-0">
                          <div
                            style={{
                              ...iconBoxStyle,
                              background: "rgba(13, 110, 253, 0.09)",
                              color: "#0d6efd",
                            }}
                          >
                            <ClipboardList size={21} />
                          </div>

                          <div className="min-w-0">
                            <h3
                              className="fw-bold mb-1"
                              style={{
                                fontSize: "15px",
                                lineHeight: 1.4,
                                overflowWrap: "anywhere",
                              }}
                            >
                              {task.Title}
                            </h3>

                            <div className="d-flex align-items-center gap-1 text-secondary small">
                              <Building2 size={13} />
                              <span>{getPropertyName(task.PropertyId)}</span>
                            </div>
                          </div>
                        </div>

                        <span style={statusStyle(task.Status)}>
                          <CircleDot size={11} />
                          {formatStatus(task.Status)}
                        </span>
                      </div>

                      {/* DESCRIPTION */}

                      {task.Description ? (
                        <p
                          className="small text-secondary mb-3"
                          style={{
                            lineHeight: 1.6,
                            overflowWrap: "anywhere",
                          }}
                        >
                          {task.Description}
                        </p>
                      ) : (
                        <p className="small text-secondary fst-italic mb-3">
                          No additional description provided.
                        </p>
                      )}

                      {/* TASK DETAILS */}

                      <div
                        className="row g-3 p-3 mb-3"
                        style={{
                          borderRadius: "10px",
                          background: "var(--bs-tertiary-bg, #f8f9fa)",
                        }}
                      >
                        <div className="col-6">
                          <div
                            className="text-secondary mb-2"
                            style={mutedLabelStyle}
                          >
                            Priority
                          </div>

                          <span style={priorityStyle(task.Priority)}>
                            {task.Priority?.toLowerCase() === "urgent" && (
                              <AlertCircle size={12} />
                            )}
                            {formatPriority(task.Priority)}
                          </span>
                        </div>

                        <div className="col-6">
                          <div
                            className="text-secondary mb-2"
                            style={mutedLabelStyle}
                          >
                            Scheduled
                          </div>

                          <div className="d-flex align-items-center gap-2 small fw-semibold">
                            <CalendarDays
                              size={15}
                              className="text-secondary"
                            />
                            {formatDate(task.ScheduledDate)}
                          </div>
                        </div>

                        {task.DeviceName && (
                          <div className="col-12">
                            <div
                              className="text-secondary mb-1"
                              style={mutedLabelStyle}
                            >
                              Associated device
                            </div>

                            <div className="d-flex align-items-center gap-2 small fw-semibold">
                              <Wrench size={14} className="text-secondary" />
                              {task.DeviceName}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* CARD FOOTER */}

                      <div
                        className="d-flex flex-wrap justify-content-between align-items-center gap-2 pt-3"
                        style={{
                          borderTop: "1px solid var(--bs-border-color, #e5e7eb)",
                        }}
                      >
                        <div className="d-flex align-items-center gap-2 small text-secondary min-w-0">
                          <UserRound size={15} className="flex-shrink-0" />
                          <span className="text-truncate">
                            {getAssigneeSummary(task)}
                          </span>
                        </div>

                        <div className="d-flex align-items-center gap-2 small text-secondary">
                          <CalendarCheck size={14} />
                          Created {formatDate(task.CreatedAt)}
                        </div>
                      </div>

                      {/* EXPANDABLE ASSIGNMENT DETAILS */}

                      <div
                        id={`assignment-details-${taskId}`}
                        style={{
                          display: "grid",
                          gridTemplateRows: isExpanded ? "1fr" : "0fr",
                          opacity: isExpanded ? 1 : 0,
                          transition:
                            "grid-template-rows 200ms ease, opacity 180ms ease",
                        }}
                      >
                        <div style={{ overflow: "hidden" }}>
                          {isExpanded && (
                            <AssignmentDetails task={task} />
                          )}
                        </div>
                      </div>

                      {/* CLICK / TOUCH EXPAND CONTROL */}

                      <div
                        className="d-flex justify-content-center align-items-center mt-2 pt-2"
                        style={{
                          borderTop: isExpanded
                            ? "1px solid var(--bs-border-color, #e5e7eb)"
                            : "none",
                        }}
                      >
                        <button
                          type="button"
                          className="btn btn-link text-secondary text-decoration-none d-inline-flex align-items-center justify-content-center gap-1 py-1 px-2"
                          style={{
                            fontSize: "11px",
                            minHeight: "32px",
                          }}
                          aria-expanded={isExpanded}
                          aria-controls={`assignment-details-${taskId}`}
                          onClick={() => {
                            setPinnedTaskId((current) =>
                              current === taskId ? null : taskId
                            );
                          }}
                        >
                          {isPinned ? (
                            <>
                              <ChevronUp size={14} />
                              <span>Click to collapse details</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown size={14} />
                              <span>
                                {isExpanded
                                  ? "Tap to keep details open"
                                  : "Hover, focus, or tap for assignment details"}
                                {assignmentCount > 0
                                  ? ` · ${assignmentCount} assignment${assignmentCount === 1 ? "" : "s"}`
                                  : ""}
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    </article>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
