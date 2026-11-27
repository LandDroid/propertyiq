import type {
  Request,
  Response,
  NextFunction,
} from "express";

import jwt from "jsonwebtoken";

import { authConfig } from "../config/auth";
import { getDatabase, sql } from "../config/database";

// =====================================================
// AUTHENTICATED USER
// =====================================================

export interface AuthenticatedUser {
  userId: string;
  membershipId: string;
  organizationId: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// =====================================================
// JWT PAYLOAD
// =====================================================

interface AccessTokenPayload
  extends jwt.JwtPayload {
  sub: string;
  type: "access";
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
  const authorization =
    req.headers.authorization;

  if (!authorization) {
    if (required) {
      res.status(401).json({
        success: false,
        message:
          "Authentication required.",
      });

      return;
    }

    next();
    return;
  }

  if (
    !authorization.startsWith(
      "Bearer "
    )
  ) {
    res.status(401).json({
      success: false,
      message:
        "Invalid authentication header.",
    });

    return;
  }

  const token = authorization
    .substring(7)
    .trim();

  if (!token) {
    res.status(401).json({
      success: false,
      message:
        "Authentication token is missing.",
    });

    return;
  }

  let userId: string;

  try {
    const decoded = jwt.verify(
      token,
      authConfig.accessTokenSecret,
      {
        issuer: "propertyiq",
        audience: "propertyiq-app",
      }
    ) as AccessTokenPayload;

    if (
      !decoded ||
      typeof decoded === "string" ||
      decoded.type !== "access" ||
      typeof decoded.sub !== "string"
    ) {
      res.status(401).json({
        success: false,
        message:
          "Invalid authentication token.",
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

  try {
    const pool = await getDatabase();

    const result = await pool
      .request()
      .input(
        "userId",
        sql.UniqueIdentifier,
        userId
      )
      .query(`
        SELECT TOP 1
            u.UserId,
            m.MembershipId,
            m.OrganizationId,
            m.Role
        FROM dbo.Users u

        INNER JOIN dbo.Memberships m
            ON m.UserId = u.UserId

        INNER JOIN dbo.Organizations o
            ON o.OrganizationId = m.OrganizationId

        WHERE
            u.UserId = @userId
            AND LOWER(
                LTRIM(
                    RTRIM(
                        u.Status
                    )
                )
            ) = 'active'
            AND LOWER(
                LTRIM(
                    RTRIM(
                        o.Status
                    )
                )
            ) = 'active'

        ORDER BY
            m.CreatedAt ASC;
      `);

    if (
      result.recordset.length === 0
    ) {
      res.status(401).json({
        success: false,
        message:
          "Your account is inactive or no longer has organization access.",
      });

      return;
    }

    const user =
      result.recordset[0];

    req.user = {
      userId: user.UserId,
      membershipId:
        user.MembershipId,
      organizationId:
        user.OrganizationId,
      role: user.Role,
    };

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
  await authenticate(
    req,
    res,
    next,
    true
  );
}

// =====================================================
// OPTIONAL AUTHENTICATION
// =====================================================

export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  await authenticate(
    req,
    res,
    next,
    false
  );
}