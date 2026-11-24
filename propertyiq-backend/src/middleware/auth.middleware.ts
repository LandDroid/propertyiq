
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import { authConfig } from "../config/auth";
import { getDatabase, sql } from "../config/database";

// =====================================================
// AUTHENTICATED USER TYPE
// =====================================================

export interface AuthenticatedUser {
  userId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// =====================================================
// AUTHENTICATION HANDLER
// =====================================================

async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
  required: boolean
): Promise<void> {
  const authorization = req.headers.authorization;

  if (!authorization) {
    if (required) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
      return;
    }

    next();
    return;
  }

  if (!authorization.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      message: "Invalid authentication header.",
    });
    return;
  }

  const token = authorization.substring(7).trim();

  if (!token) {
    res.status(401).json({
      success: false,
      message: "Authentication token is missing.",
    });
    return;
  }

  let userId: string;

  // Verify the access token.
  try {
    const decoded = jwt.verify(
      token,
      authConfig.accessTokenSecret
    );

    if (
      typeof decoded === "string" ||
      decoded.type !== "access" ||
      typeof decoded.sub !== "string"
    ) {
      res.status(401).json({
        success: false,
        message: "Invalid authentication token.",
      });
      return;
    }

    userId = decoded.sub;
  } catch {
    res.status(401).json({
      success: false,
      message:
        "Your session is invalid or expired. Please log in again.",
    });
    return;
  }

  // Confirm the account still exists and is active.
  try {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        SELECT UserId
        FROM dbo.Users
        WHERE
          UserId = @userId
          AND LOWER(LTRIM(RTRIM(Status))) = 'active'
      `);

    if (result.recordset.length === 0) {
      res.status(401).json({
        success: false,
        message:
          "Your account is inactive or no longer exists. Please contact support.",
      });
      return;
    }

    req.user = { userId };

    next();
  } catch (error) {
    next(error);
  }
}

// =====================================================
// REQUIRE AUTHENTICATION
// =====================================================

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  await authenticate(req, res, next, true);
}

// =====================================================
// OPTIONAL AUTHENTICATION
//
// Allows anonymous requests but validates credentials
// whenever an Authorization header is supplied.
// =====================================================

export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  await authenticate(req, res, next, false);
}
