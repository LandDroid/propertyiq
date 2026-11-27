
import type { Request, Response } from "express";

import { authConfig } from "../../config/auth";

import {
  registerSchema,
  loginSchema,
} from "./auth.validation";

import {
  registerUser,
  loginUser,
  refreshSession,
  logoutUser,
} from "./auth.service";

const refreshCookieOptions = {
  httpOnly: true,
  secure: false,
  sameSite: "lax" as const,
  path: "/",
};

function setRefreshCookie(res: Response, token: string) {
  res.cookie("propertyiq_refresh", token, {
    ...refreshCookieOptions,
    maxAge: authConfig.refreshTokenDays * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie("propertyiq_refresh", refreshCookieOptions);
}

function createSafeResponse(result: {
  user: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string | null;
  };
  memberships: Array<{
    membershipId: string;
    organizationId: string;
    organizationName: string;
    role: string;
  }>;
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}) {
  return {
    user: result.user,
    organizationId: result.memberships[0]?.organizationId ?? null,
    memberships: result.memberships,
    accessToken: result.accessToken,
    tokenType: result.tokenType,
    expiresIn: result.expiresIn,
  };
}

// REGISTER
export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Please check your registration details.",
      errors: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const result = await registerUser(parsed.data);

    setRefreshCookie(res, result.refreshToken);

    return res.status(201).json({
      success: true,
      message: "Your account has been created.",
      data: createSafeResponse(result),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (
      message.includes("already exists") ||
      message.includes("duplicate") ||
      message.includes("UNIQUE")
    ) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    console.error("Registration error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create your account.",
    });
  }
}

// LOGIN
export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid email and password.",
      errors: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const result = await loginUser(parsed.data);

    setRefreshCookie(res, result.refreshToken);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: createSafeResponse(result),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (
      message === "Invalid email or password." ||
      message.includes("no active organization access")
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password, or account access is inactive.",
      });
    }

    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to log in.",
    });
  }
}

// REFRESH SESSION
export async function refresh(
  req: Request,
  res: Response
) {
  console.log("========== REFRESH ==========");
  console.log("Cookies received:");
  console.log(req.cookies);

  const refreshToken =
    req.cookies?.propertyiq_refresh;

  console.log("Refresh token exists:", !!refreshToken);

  if (!refreshToken || typeof refreshToken !== "string") {
    return res.status(401).json({
      success: false,
      message: "Refresh token is missing.",
    });
  }

  try {
    const result = await refreshSession(refreshToken);

    setRefreshCookie(res, result.refreshToken);

    return res.status(200).json({
      success: true,
      message: "Session refreshed.",
      data: createSafeResponse(result),
    });
  } catch (error) {
    console.log("REFRESH FAILED:");
    console.log(error);

    clearRefreshCookie(res);

    return res.status(401).json({
      success: false,
      message: "Your session has expired. Please log in again.",
    });
  }
}
// LOGOUT
export async function logout(req: Request, res: Response) {
  const refreshToken = req.cookies?.propertyiq_refresh;

  try {
    if (typeof refreshToken === "string" && refreshToken.length > 0) {
      await logoutUser(refreshToken);
    }

    clearRefreshCookie(res);

    return res.status(200).json({
      success: true,
      message: "You have been logged out.",
    });
  } catch (error) {
    console.error("Logout error:", error);

    clearRefreshCookie(res);

    return res.status(500).json({
      success: false,
      message: "Unable to complete logout.",
    });
  }
}
