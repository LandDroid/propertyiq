import type {
  Request,
  Response,
  NextFunction,
} from "express";

import { getDatabase, sql } from "../config/database";

// =====================================================
// REQUIRE ROLE
// =====================================================

export function requireRole(
  ...allowedRoles: string[]
) {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });

      return;
    }

    const hasRole = allowedRoles.some(
      (role) =>
        role.toLowerCase() ===
        req.user!.role.toLowerCase()
    );

    if (!hasRole) {
      res.status(403).json({
        success: false,
        message:
          "You do not have permission to perform this action.",
      });

      return;
    }

    next();
  };
}

// =====================================================
// COMMON ROLE CHECKS
// =====================================================

export const requireOwner =
  requireRole("Owner");

export const requireManager =
  requireRole(
    "Owner",
    "Manager"
  );

export const requireViewer =
  requireRole(
    "Owner",
    "Manager",
    "Viewer"
  );

export const requireTeamMember =
  requireRole(
    "Owner",
    "Manager",
    "Viewer",
    "Member"
  );

// =====================================================
// REQUIRE PLATFORM ROLE
// =====================================================

export function requirePlatformRole(
  ...allowedRoles: string[]
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message:
            "Authentication required.",
        });

        return;
      }

      const pool =
        await getDatabase();

      const result = await pool
        .request()
        .input(
          "userId",
          sql.UniqueIdentifier,
          req.user.userId
        )
        .query(`
          SELECT
              Role
          FROM dbo.PlatformStaffRoles
          WHERE
              UserId = @userId
              AND LOWER(Status) = 'active'
        `);

      const roles =
        result.recordset.map(
          (
            r: {
              Role: string;
            }
          ) =>
            r.Role.toLowerCase()
        );

      const match =
        allowedRoles.some(
          (role) =>
            roles.includes(
              role.toLowerCase()
            )
        );

      if (!match) {
        res.status(403).json({
          success: false,
          message:
            "Platform administrator access required.",
        });

        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

// =====================================================
// PLATFORM ROLE HELPERS
// =====================================================

export const requirePlatformAdmin =
  requirePlatformRole(
    "Admin"
  );

export const requirePlatformSupport =
  requirePlatformRole(
    "Admin",
    "Support"
  );

export const requireDeveloper =
  requirePlatformRole(
    "Admin",
    "Developer"
  );

// =====================================================
// REQUIRE PROPERTY ACCESS
// =====================================================

export function requirePropertyAccess(
  propertyIdParam = "propertyId"
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message:
            "Authentication required.",
        });

        return;
      }

      const propertyId =
        req.params[
          propertyIdParam
        ];

      if (!propertyId) {
        res.status(400).json({
          success: false,
          message:
            "Property identifier is required.",
        });

        return;
      }

      const pool =
        await getDatabase();

      const result = await pool
        .request()
        .input(
          "membershipId",
          sql.UniqueIdentifier,
          req.user.membershipId
        )
        .input(
          "propertyId",
          sql.UniqueIdentifier,
          propertyId
        )
        .query(`
          SELECT TOP 1
              AccessId
          FROM dbo.UserPropertyAccess
          WHERE
              MembershipId = @membershipId
              AND PropertyId = @propertyId
        `);

      if (
        result.recordset.length === 0 &&
        ![
          "owner",
          "manager",
        ].includes(
          req.user.role.toLowerCase()
        )
      ) {
        res.status(403).json({
          success: false,
          message:
            "You do not have access to this property.",
        });

        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

// =====================================================
// REQUIRE ORGANIZATION ACCESS
// =====================================================

export function requireSameOrganization(
  organizationIdParam =
    "organizationId"
) {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message:
          "Authentication required.",
      });

      return;
    }

    const organizationId =
      req.params[
        organizationIdParam
      ];

    if (
      organizationId !==
      req.user.organizationId
    ) {
      res.status(403).json({
        success: false,
        message:
          "Access denied for this organization.",
      });

      return;
    }

    next();
  };
}

// =====================================================
// REQUIRE CURRENT USER
// =====================================================

export function requireCurrentUser(
  userIdParam = "userId"
) {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message:
          "Authentication required.",
      });

      return;
    }

    const userId =
      req.params[userIdParam];

    if (
      userId !== req.user.userId
    ) {
      res.status(403).json({
        success: false,
        message:
          "Access denied.",
      });

      return;
    }

    next();
  };
}