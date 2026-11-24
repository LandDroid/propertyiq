
import type { Request, Response, NextFunction } from "express";
import { getDatabase, sql } from "../config/database";

// =====================================================
// ORGANIZATION CONTEXT
// =====================================================

export interface OrganizationContext {
  organizationId: string;
  membershipId: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      organizationContext?: OrganizationContext;
    }
  }
}

// =====================================================
// UUID VALIDATION
// =====================================================

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// =====================================================
// GET ORGANIZATION ID FROM REQUEST
// =====================================================

function getRequestedOrganizationId(req: Request): string | null {
  const queryValue = req.query.organizationId;
  const bodyValue = req.body?.organizationId;

  const queryId =
    typeof queryValue === "string" ? queryValue.trim() : null;

  const bodyId =
    typeof bodyValue === "string" ? bodyValue.trim() : null;

  // Reject conflicting organization IDs.
  if (queryId && bodyId && queryId.toLowerCase() !== bodyId.toLowerCase()) {
    return null;
  }

  const organizationId = queryId || bodyId;

  if (!organizationId || !UUID_REGEX.test(organizationId)) {
    return null;
  }

  return organizationId;
}

// =====================================================
// REQUIRE ACTIVE ORGANIZATION MEMBERSHIP
// =====================================================

export async function requireOrganizationMembership(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const organizationId = getRequestedOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "A valid organizationId is required.",
      });
    }

    const pool = await getDatabase();

    const result = await pool
      .request()
      .input("userId", sql.UniqueIdentifier, userId)
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .query(`
        SELECT TOP 1
          m.MembershipId AS membershipId,
          m.OrganizationId AS organizationId,
          m.Role AS role
        FROM dbo.Memberships m
        INNER JOIN dbo.Organizations o
          ON o.OrganizationId = m.OrganizationId
        INNER JOIN dbo.Users u
          ON u.UserId = m.UserId
        WHERE m.UserId = @userId
          AND m.OrganizationId = @organizationId
          AND LOWER(LTRIM(RTRIM(o.Status))) = 'active'
          AND LOWER(LTRIM(RTRIM(u.Status))) = 'active';
      `);

    const membership = result.recordset[0];

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this organization.",
      });
    }

    req.organizationContext = {
      organizationId: membership.organizationId,
      membershipId: membership.membershipId,
      role: membership.role,
    };

    return next();
  } catch (error) {
    console.error("Organization authorization error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not verify organization access.",
    });
  }
}


export function requireOrganizationRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.organizationContext?.role;

    if (!role) {
      return res.status(403).json({
        success: false,
        message: "Verified organization access is required.",
      });
    }

    const normalizedRole = role.trim().toLowerCase();

    const allowed = allowedRoles.some(
      (allowedRole) =>
        allowedRole.trim().toLowerCase() === normalizedRole
    );

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action.",
      });
    }

    return next();
  };
}
