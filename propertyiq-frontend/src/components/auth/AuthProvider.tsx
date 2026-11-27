
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3000/api/v1";

const ACTIVE_ORGANIZATION_KEY =
  "propertyiq.activeOrganizationId";

// =====================================================
// TYPES
// =====================================================

type User = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string | null;
};

type Membership = {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  role: string;
};

type AuthResponse = {
  success: boolean;
  message?: string;
  data?: {
    user: User;
    memberships: Membership[];
    organizationId?: string | null;
    accessToken: string;
    tokenType: string;
    expiresIn: number;
  };
};

type RegisterInput = {
  organizationName: string;
  firstName: string;
  lastName?: string;
  email: string;
  password: string;
};

type AuthContextType = {
  user: User | null;
  memberships: Membership[];
  accessToken: string | null;
  activeOrganizationId: string | null;
  setActiveOrganization: (organizationId: string) => void;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  apiFetch: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<Response>;
};

// =====================================================
// CONTEXT
// =====================================================

const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);

// =====================================================
// AUTH PROVIDER
// =====================================================

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [activeOrganizationId, setActiveOrganizationId] =
    useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  // =====================================================
  // APPLY SESSION
  // =====================================================

  const applySession = useCallback(
    (data: NonNullable<AuthResponse["data"]>) => {
      setUser(data.user);
      setMemberships(data.memberships);
      setAccessToken(data.accessToken);

      const savedOrganizationId =
        window.localStorage.getItem(ACTIVE_ORGANIZATION_KEY);

      console.log("SAVED ORG:", savedOrganizationId);

      console.log(
        "AVAILABLE ORGS:",
        data.memberships.map((membership) => ({
          id: membership.organizationId,
          name: membership.organizationName,
        }))
      );

      console.log("BACKEND DEFAULT ORG:", data.organizationId);

      const savedMembership = data.memberships.find(
        (membership) =>
          membership.organizationId === savedOrganizationId
      );

      const defaultMembership = data.memberships.find(
        (membership) =>
          membership.organizationId === data.organizationId
      );

      const selectedOrganizationId =
        savedMembership?.organizationId ??
        defaultMembership?.organizationId ??
        data.memberships[0]?.organizationId ??
        null;

      console.log(
        "SELECTED ORG AFTER REFRESH:",
        selectedOrganizationId
      );

      setActiveOrganizationId(selectedOrganizationId);

      if (selectedOrganizationId) {
        window.localStorage.setItem(
          ACTIVE_ORGANIZATION_KEY,
          selectedOrganizationId
        );
      } else {
        window.localStorage.removeItem(
          ACTIVE_ORGANIZATION_KEY
        );
      }
    },
    []
  );

  // =====================================================
  // CLEAR SESSION
  // =====================================================

  const clearSession = useCallback(() => {
    setUser(null);
    setMemberships([]);
    setAccessToken(null);
    setActiveOrganizationId(null);

    window.localStorage.removeItem(
      ACTIVE_ORGANIZATION_KEY
    );
  }, []);

  // =====================================================
  // CHANGE ACTIVE ORGANIZATION
  // =====================================================

  const setActiveOrganization = useCallback(
    (organizationId: string) => {
      const membership = memberships.find(
        (item) => item.organizationId === organizationId
      );

      if (!membership) {
        console.error(
          "Cannot select an organization without an active membership."
        );
        return;
      }

      setActiveOrganizationId(membership.organizationId);

      window.localStorage.setItem(
        ACTIVE_ORGANIZATION_KEY,
        membership.organizationId
      );
    },
    [memberships]
  );

  // =====================================================
  // REFRESH ACCESS TOKEN
  // =====================================================

  const refreshAccessToken = useCallback(
    async (): Promise<string | null> => {
      try {
        const response = await fetch(
          `${API_URL}/auth/refresh`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          clearSession();
          return null;
        }

        const result: AuthResponse = await response.json();

        if (!result.success || !result.data?.accessToken) {
          clearSession();
          return null;
        }

        applySession(result.data);

        return result.data.accessToken;
      } catch (error) {
        console.error("Refresh token error:", error);
        clearSession();
        return null;
      }
    },
    [applySession, clearSession]
  );

  // =====================================================
  // RESTORE SESSION
  // =====================================================

  useEffect(() => {
    let active = true;

    async function initialize() {
      await refreshAccessToken();

      if (active) {
        setIsLoading(false);
      }
    }

    initialize();

    return () => {
      active = false;
    };
  }, [refreshAccessToken]);

  // =====================================================
  // LOGIN
  // =====================================================

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await fetch(
        `${API_URL}/auth/login`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        }
      );

      const result: AuthResponse = await response.json();

      if (
        !response.ok ||
        !result.success ||
        !result.data?.accessToken
      ) {
        throw new Error(
          result.message || "Unable to sign in."
        );
      }

      applySession(result.data);
    },
    [applySession]
  );

  // =====================================================
  // REGISTRATION
  // =====================================================

  const register = useCallback(
    async (input: RegisterInput) => {
      const response = await fetch(
        `${API_URL}/auth/register`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
        }
      );

      const result: AuthResponse = await response.json();

      if (
        !response.ok ||
        !result.success ||
        !result.data?.accessToken
      ) {
        throw new Error(
          result.message || "Unable to create your account."
        );
      }

      applySession(result.data);
    },
    [applySession]
  );

  // =====================================================
  // LOGOUT
  // =====================================================

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: accessToken
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : {},
      });
    } finally {
      clearSession();
      window.location.replace("/login");
    }
  }, [accessToken, clearSession]);

  // =====================================================
  // AUTHENTICATED API REQUEST
  // =====================================================

  const apiFetch = useCallback(
    async (
      input: RequestInfo | URL,
      init: RequestInit = {}
    ): Promise<Response> => {
      let requestInput: RequestInfo | URL = input;

      if (typeof input === "string") {
        if (!/^https?:\/\//i.test(input)) {
          const normalizedPath = input.replace(/^\/+/, "");

          requestInput = `${API_URL}/${normalizedPath}`;
        }
      } else if (input instanceof URL) {
        if (input.origin === window.location.origin) {
          const normalizedPath = input.pathname.replace(/^\/+/, "");

          requestInput =
            `${API_URL}/${normalizedPath}${input.search}${input.hash}`;
        }
      }

      const makeRequest = (token: string | null) => {
        const headers = new Headers(init.headers);

        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }

        return fetch(requestInput, {
          ...init,
          headers,
          credentials: "include",
        });
      };

      let response = await makeRequest(accessToken);

      if (response.status !== 401) {
        return response;
      }

      const newToken = await refreshAccessToken();

      if (!newToken) {
        window.location.replace("/login");
        return response;
      }

      response = await makeRequest(newToken);

      return response;
    },
    [accessToken, refreshAccessToken]
  );

  // =====================================================
  // PROVIDER
  // =====================================================

  return (
    <AuthContext.Provider
      value={{
        user,
        memberships,
        accessToken,
        activeOrganizationId,
        setActiveOrganization,
        isLoading,
        isAuthenticated: Boolean(accessToken && user),
        login,
        register,
        logout,
        apiFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// =====================================================
// AUTH HOOK
// =====================================================

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider."
    );
  }

  return context;
}