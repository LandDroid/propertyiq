
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  LayoutDashboard,
  Building2,
  Cpu,
  Bell,
  BarChart3,
  Settings,
  Users,
  ShieldCheck,
  ChevronDown,
  Check,
} from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";

// =====================================================
// NAVIGATION
// =====================================================

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Properties", href: "/properties", icon: Building2 },
  { name: "Devices & Sensors", href: "/devices", icon: Cpu },
  { name: "Alerts", href: "/alerts", icon: Bell },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Assets & Warranties", href: "/warranties", icon: ShieldCheck },
];

// =====================================================
// SIDEBAR
// =====================================================

export default function Sidebar() {
  const pathname = usePathname();

  const [organizationMenuOpen, setOrganizationMenuOpen] =
    useState(false);

  const {
    memberships,
    activeOrganizationId,
    setActiveOrganization,
  } = useAuth();

  const activeOrganization =
    memberships.find(
      (membership) =>
        membership.organizationId === activeOrganizationId
    ) ?? memberships[0];

  const organizationName =
    activeOrganization?.organizationName || "Your Organization";

  // =====================================================
  // NAVIGATION STATE
  // =====================================================

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  // =====================================================
  // ORGANIZATION SELECTION
  // =====================================================

  const handleOrganizationChange = (organizationId: string) => {
    if (organizationId === activeOrganizationId) {
      setOrganizationMenuOpen(false);
      return;
    }

    setActiveOrganization(organizationId);
    setOrganizationMenuOpen(false);
  };

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <aside className="piq-sidebar">

      {/* BRAND */}
      <div className="piq-brand">
        <div className="piq-brand-icon">P</div>

        <div>
          <div className="piq-brand-name">PropertyIQ</div>
          <div className="piq-brand-subtitle">
            Property Intelligence
          </div>
        </div>
      </div>

      {/* ORGANIZATION SWITCHER */}
      <div className="px-3 py-3 mb-3">
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "1px",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.5)",
            marginBottom: 7,
          }}
        >
          Organization
        </div>

        {memberships.length > 1 ? (
          <div className="position-relative">

            <button
              type="button"
              className="w-100 text-start d-flex align-items-center justify-content-between"
              aria-expanded={organizationMenuOpen}
              aria-haspopup="true"
              onClick={() =>
                setOrganizationMenuOpen((current) => !current)
              }
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#fff",
                padding: "10px 11px",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              <span
                className="fw-semibold"
                style={{
                  fontSize: 13,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {organizationName}
              </span>

              <ChevronDown
                size={16}
                className="ms-2 flex-shrink-0"
                style={{
                  transform: organizationMenuOpen
                    ? "rotate(180deg)"
                    : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                }}
              />
            </button>

            {organizationMenuOpen && (
              <div
                className="shadow"
                role="menu"
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  right: 0,
                  zIndex: 1100,
                  background: "#fff",
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 8,
                  padding: "5px",
                  minWidth: 220,
                }}
              >
                {memberships.map((membership) => {
                  const selected =
                    membership.organizationId === activeOrganizationId;

                  return (
                    <button
                      key={membership.membershipId}
                      type="button"
                      role="menuitem"
                      onClick={() =>
                        handleOrganizationChange(
                          membership.organizationId
                        )
                      }
                      className="w-100 d-flex align-items-center justify-content-between text-start"
                      style={{
                        border: "none",
                        borderRadius: 5,
                        padding: "9px 10px",
                        background: selected
                          ? "#eef2ff"
                          : "transparent",
                        color: "#212529",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      <span className="text-truncate">
                        {membership.organizationName}
                      </span>

                      {selected && (
                        <Check
                          size={16}
                          className="ms-2 flex-shrink-0"
                          color="#3451b2"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div
            className="text-white fw-semibold"
            style={{
              fontSize: 13,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={organizationName}
          >
            {organizationName}
          </div>
        )}
      </div>

      {/* WORKSPACE */}
      <div className="piq-nav-label">
        Workspace
      </div>

      <nav>
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`piq-nav-link ${active ? "active" : ""}`}
            >
              <Icon size={18} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* ADMINISTRATION */}
      <div className="piq-nav-label mt-4">
        Administration
      </div>

      <Link
        href="/team"
        className={`piq-nav-link ${isActive("/team") ? "active" : ""}`}
      >
        <Users size={18} />
        <span>Team</span>
      </Link>

      <Link
        href="/settings"
        className={`piq-nav-link ${isActive("/settings") ? "active" : ""}`}
      >
        <Settings size={18} />
        <span>Settings</span>
      </Link>

      {/* FOOTER */}
      <div className="piq-sidebar-footer">
        <div className="fw-semibold text-white">
          PropertyIQ
        </div>

        <small>Development environment</small>
      </div>

    </aside>
  );
}
