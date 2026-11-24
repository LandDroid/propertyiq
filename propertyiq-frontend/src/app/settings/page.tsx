
"use client";

import { useEffect, useState } from "react";
import {
  User,
  Building2,
  Bell,
  Shield,
  Mail,
  Lock,
  Settings as SettingsIcon,
  CheckCircle2,
  Info,
  Pencil,
  X,
  Save,
  Loader2,
  AlertCircle,
} from "lucide-react";

import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/components/auth/AuthProvider";

type NotificationPreferences = {
  emailAlerts: boolean;
  criticalAlerts: boolean;
  maintenanceReminders: boolean;
  weeklyReports: boolean;
};

type OrganizationUpdateResponse = {
  success: boolean;
  message?: string;
  data?: {
    organizationId: string;
    organizationName: string;
  };
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  emailAlerts: true,
  criticalAlerts: true,
  maintenanceReminders: true,
  weeklyReports: false,
};

const STORAGE_KEY = "propertyiq-notification-preferences";

export default function SettingsPage() {
  const {
    user,
    memberships,
    apiFetch,
    isLoading: authLoading,
    isAuthenticated,
  } = useAuth();

  const [activeTab, setActiveTab] = useState("account");

  const [preferences, setPreferences] =
    useState<NotificationPreferences>(DEFAULT_PREFERENCES);

  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  const [editingOrganization, setEditingOrganization] = useState(false);
  const [organizationName, setOrganizationName] = useState("");
  const [savingOrganization, setSavingOrganization] = useState(false);
  const [organizationMessage, setOrganizationMessage] = useState("");
  const [organizationError, setOrganizationError] = useState("");

  const [organizationOverrides, setOrganizationOverrides] = useState<
    Record<string, string>
  >({});

  const membership = memberships?.[0];

  const currentOrganizationName = membership
    ? organizationOverrides[membership.organizationId] ||
      membership.organizationName ||
      ""
    : "";

  const normalizedRole = membership?.role
    ?.trim()
    .toLowerCase();

  const canEditOrganization =
    normalizedRole === "owner" ||
    normalizedRole === "administrator";

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);

      if (stored) {
        const parsed = JSON.parse(stored);

        setPreferences({
          ...DEFAULT_PREFERENCES,
          ...parsed,
        });
      }
    } catch (error) {
      console.error(
        "Could not load notification preferences:",
        error
      );
    } finally {
      setPreferencesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(preferences)
      );

      setSaved(true);

      const timeout = window.setTimeout(() => {
        setSaved(false);
      }, 2000);

      return () => window.clearTimeout(timeout);
    } catch (error) {
      console.error(
        "Could not save notification preferences:",
        error
      );
    }
  }, [preferences, preferencesLoaded]);

  useEffect(() => {
    setOrganizationName(currentOrganizationName);
  }, [currentOrganizationName]);

  function updatePreference(
    key: keyof NotificationPreferences,
    value: boolean
  ) {
    setPreferences((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function startOrganizationEdit() {
    setOrganizationName(currentOrganizationName);
    setOrganizationError("");
    setOrganizationMessage("");
    setEditingOrganization(true);
  }

  function cancelOrganizationEdit() {
    setOrganizationName(currentOrganizationName);
    setOrganizationError("");
    setEditingOrganization(false);
  }

  async function saveOrganizationName() {
    if (!membership) return;

    const normalizedName = organizationName.trim();

    if (!normalizedName) {
      setOrganizationError("Organization name is required.");
      return;
    }

    if (normalizedName.length > 150) {
      setOrganizationError(
        "Organization name cannot exceed 150 characters."
      );
      return;
    }

    if (normalizedName === currentOrganizationName.trim()) {
      setEditingOrganization(false);
      return;
    }

    setSavingOrganization(true);
    setOrganizationError("");
    setOrganizationMessage("");

    try {
      const response = await apiFetch(
        "/settings/organization",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organizationId: membership.organizationId,
            organizationName: normalizedName,
          }),
        }
      );

      const result =
        (await response.json()) as OrganizationUpdateResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Unable to update organization name."
        );
      }

      const updatedName =
        result.data?.organizationName || normalizedName;

      setOrganizationOverrides((current) => ({
        ...current,
        [membership.organizationId]: updatedName,
      }));

      setOrganizationName(updatedName);
      setEditingOrganization(false);
      setOrganizationMessage(
        "Organization name updated successfully."
      );
    } catch (error) {
      setOrganizationError(
        error instanceof Error
          ? error.message
          : "Unable to update organization name."
      );
    } finally {
      setSavingOrganization(false);
    }
  }

  if (authLoading) {
    return (
      <AppLayout>
        <div className="settings-loading">
          Loading settings...
        </div>
      </AppLayout>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <AppLayout>
        <div className="settings-loading">
          Please sign in to view your settings.
        </div>
      </AppLayout>
    );
  }

  const fullName = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(" ");

  return (
    <AppLayout>
      <div className="settings-page">
        <div className="settings-header">
          <div>
            <div className="settings-eyebrow">
              <SettingsIcon size={15} />
              ACCOUNT MANAGEMENT
            </div>

            <h1>Settings</h1>

            <p>
              Manage your account, organization and notification preferences.
            </p>
          </div>

          {saved && (
            <div className="saved-indicator">
              <CheckCircle2 size={16} />
              Preferences saved
            </div>
          )}
        </div>

        <div className="settings-layout">
          <aside className="settings-sidebar">
            <div className="settings-user">
              <div className="settings-avatar">
                {user.firstName?.charAt(0)?.toUpperCase() || "U"}
              </div>

              <div className="settings-user-info">
                <strong>{fullName || "Account User"}</strong>
                <span>{user.email}</span>
              </div>
            </div>

            <div className="settings-nav">
              <button
                className={activeTab === "account" ? "active" : ""}
                onClick={() => setActiveTab("account")}
              >
                <User size={18} />
                My Account
              </button>

              <button
                className={activeTab === "organization" ? "active" : ""}
                onClick={() => setActiveTab("organization")}
              >
                <Building2 size={18} />
                Organization
              </button>

              <button
                className={activeTab === "notifications" ? "active" : ""}
                onClick={() => setActiveTab("notifications")}
              >
                <Bell size={18} />
                Notifications
              </button>

              <button
                className={activeTab === "security" ? "active" : ""}
                onClick={() => setActiveTab("security")}
              >
                <Shield size={18} />
                Security
              </button>
            </div>
          </aside>

          <main className="settings-content">
            {activeTab === "account" && (
              <section>
                <div className="section-heading">
                  <div className="section-icon">
                    <User size={21} />
                  </div>

                  <div>
                    <h2>My Account</h2>
                    <p>
                      Your personal PropertyIQ account information.
                    </p>
                  </div>
                </div>

                <div className="settings-card">
                  <h3>Personal Information</h3>

                  <div className="settings-fields">
                    <div className="settings-field">
                      <label>First Name</label>
                      <input value={user.firstName || ""} readOnly />
                    </div>

                    <div className="settings-field">
                      <label>Last Name</label>
                      <input value={user.lastName || ""} readOnly />
                    </div>

                    <div className="settings-field full-width">
                      <label>Email Address</label>

                      <div className="input-with-icon">
                        <Mail size={17} />
                        <input value={user.email || ""} readOnly />
                      </div>
                    </div>
                  </div>

                  <div className="information-note">
                    <Info size={17} />
                    <span>
                      Your account information is currently managed through
                      your PropertyIQ account. Profile editing will be
                      available when the account update service is connected.
                    </span>
                  </div>
                </div>

                <div className="settings-card">
                  <h3>Account Status</h3>

                  <div className="status-row">
                    <div>
                      <strong>Account</strong>
                      <span>Your PropertyIQ login account</span>
                    </div>

                    <span className="status-active">Active</span>
                  </div>
                </div>
              </section>
            )}

            {activeTab === "organization" && (
              <section>
                <div className="section-heading">
                  <div className="section-icon">
                    <Building2 size={21} />
                  </div>

                  <div>
                    <h2>Organization</h2>
                    <p>
                      Manage your organization's identity and details.
                    </p>
                  </div>
                </div>

                <div className="organization-banner">
                  <div className="organization-banner-icon">
                    <Building2 size={27} />
                  </div>

                  <div className="organization-banner-content">
                    <span>ACTIVE ORGANIZATION</span>
                    <strong>
                      {currentOrganizationName || "No organization"}
                    </strong>
                    <small>
                      PropertyIQ organization workspace
                    </small>
                  </div>

                  <div className="organization-banner-status">
                    <span />
                    Active
                  </div>
                </div>

                <div className="settings-card">
                  <div className="organization-card-heading">
                    <div>
                      <h3>Organization Details</h3>
                      <p>
                        Update the name displayed throughout PropertyIQ.
                      </p>
                    </div>

                    {!editingOrganization && canEditOrganization && membership && (
                      <button
                        type="button"
                        className="edit-button"
                        onClick={startOrganizationEdit}
                      >
                        <Pencil size={15} />
                        Edit
                      </button>
                    )}
                  </div>

                  {membership ? (
                    <>
                      <div className="settings-fields">
                        <div className="settings-field full-width">
                          <label>Organization Name</label>

                          {editingOrganization ? (
                            <input
                              value={organizationName}
                              onChange={(event) =>
                                setOrganizationName(event.target.value)
                              }
                              maxLength={150}
                              autoFocus
                              disabled={savingOrganization}
                              placeholder="Enter organization name"
                            />
                          ) : (
                            <input
                              value={currentOrganizationName}
                              readOnly
                            />
                          )}

                          {editingOrganization && (
                            <span className="character-count">
                              {organizationName.length}/150 characters
                            </span>
                          )}
                        </div>

                        <div className="settings-field">
                          <label>Your Role</label>
                          <input
                            value={membership.role || ""}
                            readOnly
                          />
                        </div>

                        <div className="settings-field">
                          <label>Membership Status</label>
                          <input value="Active" readOnly />
                        </div>
                      </div>

                      {editingOrganization && (
                        <div className="organization-actions">
                          <button
                            type="button"
                            className="cancel-button"
                            onClick={cancelOrganizationEdit}
                            disabled={savingOrganization}
                          >
                            <X size={16} />
                            Cancel
                          </button>

                          <button
                            type="button"
                            className="save-button"
                            onClick={saveOrganizationName}
                            disabled={savingOrganization}
                          >
                            {savingOrganization ? (
                              <Loader2 size={16} className="spin" />
                            ) : (
                              <Save size={16} />
                            )}

                            {savingOrganization
                              ? "Saving..."
                              : "Save Changes"}
                          </button>
                        </div>
                      )}

                      {organizationError && (
                        <div className="feedback-message error">
                          <AlertCircle size={17} />
                          {organizationError}
                        </div>
                      )}

                      {organizationMessage && (
                        <div className="feedback-message success">
                          <CheckCircle2 size={17} />
                          {organizationMessage}
                        </div>
                      )}

                      {!canEditOrganization && (
                        <div className="information-note">
                          <Info size={17} />
                          <span>
                            Only organization Owners and Administrators
                            can change the organization name. Contact
                            your organization administrator if you need
                            assistance.
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="empty-message">
                      No organization membership was found for this account.
                    </p>
                  )}
                </div>

                <div className="settings-card">
                  <h3>Organization Access</h3>

                  <div className="status-row">
                    <div>
                      <strong>Organization membership</strong>
                      <span>
                        Your role determines which properties and features
                        you can access.
                      </span>
                    </div>

                    <span className="status-active">
                      {membership?.role || "Not assigned"}
                    </span>
                  </div>
                </div>
              </section>
            )}

            {activeTab === "notifications" && (
              <section>
                <div className="section-heading">
                  <div className="section-icon">
                    <Bell size={21} />
                  </div>

                  <div>
                    <h2>Notifications</h2>
                    <p>
                      Choose which notifications you want to receive.
                    </p>
                  </div>
                </div>

                <div className="settings-card">
                  <h3>Email Notifications</h3>

                  <p className="card-description">
                    Manage your notification preferences.
                  </p>

                  <div className="preference-row">
                    <div>
                      <strong>Email Notifications</strong>
                      <span>
                        Enable or disable email notifications.
                      </span>
                    </div>

                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={preferences.emailAlerts}
                        onChange={(event) =>
                          updatePreference(
                            "emailAlerts",
                            event.target.checked
                          )
                        }
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>

                  <div className="preference-row">
                    <div>
                      <strong>Critical Property Alerts</strong>
                      <span>
                        Notifications for critical sensor and property events.
                      </span>
                    </div>

                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={preferences.criticalAlerts}
                        onChange={(event) =>
                          updatePreference(
                            "criticalAlerts",
                            event.target.checked
                          )
                        }
                        disabled={!preferences.emailAlerts}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>

                  <div className="preference-row">
                    <div>
                      <strong>Maintenance Reminders</strong>
                      <span>
                        Reminders about scheduled maintenance tasks.
                      </span>
                    </div>

                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={preferences.maintenanceReminders}
                        onChange={(event) =>
                          updatePreference(
                            "maintenanceReminders",
                            event.target.checked
                          )
                        }
                        disabled={!preferences.emailAlerts}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>

                  <div className="preference-row">
                    <div>
                      <strong>Weekly Reports</strong>
                      <span>
                        Receive a weekly summary of property activity.
                      </span>
                    </div>

                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={preferences.weeklyReports}
                        onChange={(event) =>
                          updatePreference(
                            "weeklyReports",
                            event.target.checked
                          )
                        }
                        disabled={!preferences.emailAlerts}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                </div>

                <div className="information-note">
                  <Info size={17} />
                  <span>
                    These preferences are currently saved in this browser.
                    They do not yet control server-side email delivery.
                  </span>
                </div>
              </section>
            )}

            {activeTab === "security" && (
              <section>
                <div className="section-heading">
                  <div className="section-icon">
                    <Shield size={21} />
                  </div>

                  <div>
                    <h2>Security</h2>
                    <p>Manage your account security.</p>
                  </div>
                </div>

                <div className="settings-card">
                  <h3>Password</h3>

                  <div className="security-item">
                    <div className="security-icon">
                      <Lock size={20} />
                    </div>

                    <div className="security-description">
                      <strong>Password Management</strong>
                      <span>
                        Change your account password.
                      </span>
                    </div>

                    <span className="coming-soon">Coming soon</span>
                  </div>
                </div>

                <div className="settings-card">
                  <h3>Login Sessions</h3>

                  <div className="security-item">
                    <div className="security-icon">
                      <Shield size={20} />
                    </div>

                    <div className="security-description">
                      <strong>Active Sessions</strong>
                      <span>
                        Review and revoke devices currently signed in
                        to your account.
                      </span>
                    </div>

                    <span className="coming-soon">Coming soon</span>
                  </div>
                </div>

                <div className="information-note">
                  <Info size={17} />
                  <span>
                    Password changes and session management require
                    additional backend security endpoints.
                  </span>
                </div>
              </section>
            )}
          </main>
        </div>
      </div>

      <style jsx>{`
        .settings-page {
          max-width: 1250px;
          margin: 0 auto;
          padding: 28px;
          color: #172033;
        }

        .settings-loading {
          padding: 50px;
          text-align: center;
          color: #64748b;
        }

        .settings-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          margin-bottom: 30px;
        }

        .settings-eyebrow {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #64748b;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.2px;
          margin-bottom: 10px;
        }

        .settings-header h1 {
          font-size: 30px;
          font-weight: 750;
          margin: 0 0 8px;
        }

        .settings-header p {
          color: #64748b;
          margin: 0;
          font-size: 14px;
        }

        .saved-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #15803d;
          font-size: 13px;
          font-weight: 600;
        }

        .settings-layout {
          display: grid;
          grid-template-columns: 250px minmax(0, 1fr);
          gap: 24px;
          align-items: start;
        }

        .settings-sidebar,
        .settings-card {
          background: #fff;
          border: 1px solid #e5eaf0;
          border-radius: 12px;
        }

        .settings-sidebar {
          padding: 18px;
        }

        .settings-user {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-bottom: 20px;
          border-bottom: 1px solid #edf0f4;
          margin-bottom: 15px;
        }

        .settings-avatar {
          width: 42px;
          height: 42px;
          flex-shrink: 0;
          border-radius: 50%;
          background: #e9efff;
          color: #3156b8;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 17px;
          font-weight: 700;
        }

        .settings-user-info {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .settings-user-info strong {
          font-size: 13px;
          overflow-wrap: anywhere;
        }

        .settings-user-info span {
          font-size: 11px;
          color: #64748b;
          overflow-wrap: anywhere;
        }

        .settings-nav {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .settings-nav button {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 12px;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: #526078;
          text-align: left;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s, color 0.2s;
        }

        .settings-nav button:hover {
          background: #f5f7fb;
          color: #244db2;
        }

        .settings-nav button.active {
          background: #edf2ff;
          color: #244db2;
        }

        .settings-content {
          min-width: 0;
        }

        .section-heading {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 20px;
        }

        .section-icon {
          width: 45px;
          height: 45px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background: #edf2ff;
          color: #3156b8;
        }

        .section-heading h2 {
          margin: 0 0 5px;
          font-size: 19px;
          font-weight: 700;
        }

        .section-heading p {
          margin: 0;
          color: #64748b;
          font-size: 13px;
        }

        .settings-card {
          padding: 24px;
          margin-bottom: 18px;
        }

        .settings-card h3 {
          font-size: 15px;
          font-weight: 700;
          margin: 0 0 20px;
        }

        .organization-banner {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 21px;
          margin-bottom: 20px;
          border: 1px solid #dce6fa;
          border-radius: 13px;
          background: linear-gradient(120deg, #f2f6ff, #ffffff);
        }

        .organization-banner-icon {
          width: 52px;
          height: 52px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 13px;
          background: #e1eaff;
          color: #3156b8;
        }

        .organization-banner-content {
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }

        .organization-banner-content > span {
          color: #64748b;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 1.1px;
        }

        .organization-banner-content strong {
          color: #172d57;
          font-size: 19px;
          font-weight: 750;
          overflow-wrap: anywhere;
        }

        .organization-banner-content small {
          color: #64748b;
          font-size: 11px;
        }

        .organization-banner-status {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #168044;
          font-size: 11px;
          font-weight: 700;
        }

        .organization-banner-status span {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #22c55e;
        }

        .organization-card-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 15px;
          margin-bottom: 20px;
        }

        .organization-card-heading h3 {
          margin: 0 0 5px;
        }

        .organization-card-heading p {
          margin: 0;
          color: #64748b;
          font-size: 12px;
        }

        .edit-button,
        .cancel-button,
        .save-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 38px;
          padding: 0 13px;
          border-radius: 7px;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
          transition: 0.2s;
        }

        .edit-button {
          color: #3156b8;
          background: #edf2ff;
          border: 1px solid #dce6fa;
        }

        .edit-button:hover {
          background: #e1eaff;
        }

        .cancel-button {
          color: #475569;
          background: white;
          border: 1px solid #dfe5ed;
        }

        .cancel-button:hover {
          background: #f8fafc;
        }

        .save-button {
          color: white;
          background: #3156b8;
          border: 1px solid #3156b8;
        }

        .save-button:hover:not(:disabled) {
          background: #24469e;
        }

        .edit-button:disabled,
        .cancel-button:disabled,
        .save-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .organization-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 20px;
        }

        .character-count {
          align-self: flex-end;
          color: #94a3b8;
          font-size: 10px;
        }

        .feedback-message {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          padding: 12px;
          margin-top: 16px;
          border-radius: 8px;
          font-size: 12px;
          line-height: 1.5;
        }

        .feedback-message svg {
          flex-shrink: 0;
        }

        .feedback-message.error {
          color: #b42318;
          background: #fef3f2;
          border: 1px solid #fecdca;
        }

        .feedback-message.success {
          color: #15803d;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .settings-fields {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .settings-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
        }

        .settings-field.full-width {
          grid-column: 1 / -1;
        }

        .settings-field label {
          font-size: 12px;
          font-weight: 650;
          color: #475569;
        }

        .settings-field input {
          width: 100%;
          height: 43px;
          border: 1px solid #dfe5ed;
          border-radius: 7px;
          padding: 0 12px;
          background: #f8fafc;
          color: #334155;
          font-size: 13px;
          outline: none;
        }

        .settings-field input:focus:not(:read-only) {
          border-color: #3156b8;
          background: white;
          box-shadow: 0 0 0 3px rgba(49, 86, 184, 0.1);
        }

        .input-with-icon {
          position: relative;
        }

        .input-with-icon svg {
          position: absolute;
          left: 12px;
          top: 13px;
          color: #94a3b8;
        }

        .input-with-icon input {
          padding-left: 38px;
        }

        .information-note {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 14px;
          margin-top: 20px;
          border: 1px solid #dbeafe;
          border-radius: 8px;
          background: #f5f9ff;
          color: #475569;
          font-size: 12px;
          line-height: 1.6;
        }

        .information-note svg {
          flex-shrink: 0;
          color: #3970c9;
          margin-top: 1px;
        }

        .status-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
        }

        .status-row > div {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .status-row strong {
          font-size: 13px;
        }

        .status-row span {
          font-size: 12px;
          color: #64748b;
        }

        .status-row .status-active {
          display: inline-flex;
          padding: 6px 10px;
          border-radius: 20px;
          background: #eaf8ef;
          color: #168044;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
        }

        .card-description {
          margin: -10px 0 15px;
          color: #64748b;
          font-size: 12px;
        }

        .preference-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 17px 0;
          border-top: 1px solid #edf0f4;
        }

        .preference-row > div {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .preference-row strong {
          font-size: 13px;
        }

        .preference-row span {
          font-size: 12px;
          color: #64748b;
        }

        .toggle {
          position: relative;
          display: inline-block;
          width: 43px;
          height: 24px;
          flex-shrink: 0;
        }

        .toggle input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          inset: 0;
          border-radius: 20px;
          background: #cbd5e1;
          cursor: pointer;
          transition: 0.2s;
        }

        .toggle-slider:before {
          content: "";
          position: absolute;
          height: 18px;
          width: 18px;
          left: 3px;
          top: 3px;
          border-radius: 50%;
          background: white;
          transition: 0.2s;
        }

        .toggle input:checked + .toggle-slider {
          background: #3156b8;
        }

        .toggle input:checked + .toggle-slider:before {
          transform: translateX(19px);
        }

        .toggle input:disabled + .toggle-slider {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .security-item {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 15px 0;
          border-top: 1px solid #edf0f4;
        }

        .security-icon {
          width: 40px;
          height: 40px;
          flex-shrink: 0;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f1f5f9;
          color: #526078;
        }

        .security-description {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 5px;
          min-width: 0;
        }

        .security-description strong {
          font-size: 13px;
        }

        .security-description span {
          color: #64748b;
          font-size: 12px;
        }

        .coming-soon {
          color: #64748b;
          background: #f1f5f9;
          padding: 6px 9px;
          border-radius: 20px;
          font-size: 10px;
          font-weight: 700;
          white-space: nowrap;
        }

        .empty-message {
          color: #64748b;
          font-size: 13px;
        }

        @media (max-width: 850px) {
          .settings-layout {
            grid-template-columns: 1fr;
          }

          .settings-nav {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 550px) {
          .settings-page {
            padding: 16px;
          }

          .settings-header {
            align-items: flex-start;
          }

          .settings-fields {
            grid-template-columns: 1fr;
          }

          .settings-field.full-width {
            grid-column: auto;
          }

          .settings-card {
            padding: 18px;
          }

          .preference-row {
            gap: 12px;
          }

          .security-item {
            flex-wrap: wrap;
          }

          .organization-banner {
            flex-wrap: wrap;
          }

          .organization-banner-status {
            margin-left: 68px;
          }
        }
      `}</style>
    </AppLayout>
  );
}
