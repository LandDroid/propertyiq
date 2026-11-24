
"use client";

import Link from "next/link";
import {
  Bell,
  Search,
  UserCircle,
} from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";

export default function Topbar() {
  const {
    user,
    memberships,
    activeOrganizationId,
  } = useAuth();

  const activeOrganization =
    memberships.find(
      (membership) =>
        membership.organizationId === activeOrganizationId
    ) ?? memberships[0];

  const organizationName =
    activeOrganization?.organizationName ||
    "Your Organization";

  const fullName = user
    ? `${user.firstName} ${user.lastName || ""}`.trim()
    : "Administrator";

  return (
    <header className="piq-topbar">
      <div className="d-flex align-items-center gap-3">
        <div className="text-secondary d-none d-md-block">
          Workspace / Property Management
        </div>
      </div>

      <div className="d-flex align-items-center gap-4">
        <Search
          size={19}
          className="text-secondary"
        />

        <Link
          href="/alerts"
          className="btn p-0 border-0"
          aria-label="Notifications"
        >
          <Bell
            size={19}
            className="text-secondary"
          />
        </Link>

        <div className="d-flex align-items-center gap-2">
          <UserCircle
            size={29}
            className="text-secondary"
          />

          <div className="d-none d-md-block">
            <div className="fw-semibold small">
              {fullName}
            </div>

            <div
              className="text-secondary"
              style={{
                fontSize: 11,
                maxWidth: 220,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={organizationName}
            >
              {organizationName}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
