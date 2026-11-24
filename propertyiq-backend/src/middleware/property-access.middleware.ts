
import type { Request, Response, NextFunction } from "express";
import { getDatabase, sql } from "../config/database";

// =====================================================
// CHECK WHETHER USER CAN ACCESS A PROPERTY
// =====================================================

export async function userCanAccessProperty(
  userId: string,
  propertyId: string
): Promise<boolean> {
  const pool = await getDatabase();

  const result = await pool
    .request()
    .input("userId", sql.UniqueIdentifier, userId)
    .input("propertyId", sql.UniqueIdentifier, propertyId)
    .query(`
      SELECT TOP 1
        p.PropertyId
      FROM dbo.Properties p
      INNER JOIN dbo.Memberships m
        ON m.OrganizationId = p.OrganizationId
      LEFT JOIN dbo.UserPropertyAccess upa
        ON upa.MembershipId = m.MembershipId
        AND upa.PropertyId = p.PropertyId
      WHERE p.PropertyId = @propertyId
        AND m.UserId = @userId
        AND (
          LOWER(LTRIM(RTRIM(m.Role))) IN ('owner', 'administrator')
          OR upa.AccessId IS NOT NULL
        );
    `);

  return result.recordset.length > 0;
}

// =====================================================
// EXTRACT PROPERTY ID FROM REQUEST
// =====================================================

function getPropertyId(req: Request): string | null {
  const candidates = [
    req.params.propertyId,
    req.params.id,
    req.body?.propertyId,
    req.query.propertyId,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

// =====================================================
// REQUIRE PROPERTY ACCESS
// =====================================================

export async function requirePropertyAccess(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  const propertyId = getPropertyId(req);

  if (!propertyId) {
    return res.status(400).json({
      success: false,
      message: "A property ID is required.",
    });
  }

  // Validate UUID format before sending it to SQL Server.
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(propertyId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid property ID.",
    });
  }

  try {
    const allowed = await userCanAccessProperty(
      req.user.userId,
      propertyId
    );

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this property.",
      });
    }

    return next();
  } catch (error) {
    console.error("Property access check failed:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify property access.",
    });
  }
}
