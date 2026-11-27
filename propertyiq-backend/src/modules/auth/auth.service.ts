import argon2 from "argon2";
import jwt from "jsonwebtoken";
import crypto from "crypto";

import { authConfig } from "../../config/auth";

import {
  findUserByEmail,
  findUserById,
  getUserMemberships,
  createCustomerAccount,
  saveRefreshToken,
  findRefreshToken,
  revokeRefreshToken,
} from "./auth.repository";

import type {
  RegisterInput,
  LoginInput,
} from "./auth.validation";

// =====================================================
// HASH REFRESH TOKENS
// =====================================================

function hashToken(token: string): string {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

// =====================================================
// CREATE ACCESS TOKEN
// =====================================================

function createAccessToken(
  userId: string
): string {
  return jwt.sign(
    {
      type: "access",
    },
    authConfig.accessTokenSecret,
    {
      subject: userId,
      expiresIn: "15m",
    }
  );
}

// =====================================================
// CREATE REFRESH TOKEN
// =====================================================

async function createRefreshToken(
  userId: string
): Promise<string> {
  const token = jwt.sign(
    {
      type: "refresh",
    },
    authConfig.refreshTokenSecret,
    {
      subject: userId,
      expiresIn: `${authConfig.refreshTokenDays}d`,
    }
  );

  const expiresAt = new Date(
    Date.now() +
      authConfig.refreshTokenDays *
        24 *
        60 *
        60 *
        1000
  );

  await saveRefreshToken({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });

  return token;
}

// =====================================================
// CREATE SESSION
// =====================================================

async function createSession(
  userId: string
) {
  const accessToken =
    createAccessToken(userId);

  const refreshToken =
    await createRefreshToken(userId);

  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresIn: 900,
  };
}

// =====================================================
// REGISTER USER
// =====================================================

export async function registerUser(
  input: RegisterInput
) {
  const existingUser =
    await findUserByEmail(
      input.email
    );

  if (existingUser) {
    throw new Error(
      "An account with this email already exists."
    );
  }

  const passwordHash =
    await argon2.hash(
      input.password,
      {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      }
    );

  const account =
    await createCustomerAccount({
      organizationName:
        input.organizationName,
      firstName:
        input.firstName,
      lastName:
        input.lastName ??
        null,
      email: input.email,
      passwordHash,
    });

  const memberships =
    await getUserMemberships(
      account.userId
    );

  const session =
    await createSession(
      account.userId
    );

  return {
    user: {
      userId:
        account.userId,
      email: input.email,
      firstName:
        input.firstName,
      lastName:
        input.lastName ??
        null,
    },

    memberships,

    ...session,
  };
}

// =====================================================
// LOGIN USER
// =====================================================

export async function loginUser(
  input: LoginInput
) {
  const user =
    await findUserByEmail(
      input.email
    );

  if (
    !user ||
    !user.passwordHash ||
    user.status !==
      "active"
  ) {
    throw new Error(
      "Invalid email or password."
    );
  }

  const passwordMatches =
    await argon2.verify(
      user.passwordHash,
      input.password
    );

  if (!passwordMatches) {
    throw new Error(
      "Invalid email or password."
    );
  }

  const memberships =
    await getUserMemberships(
      user.userId
    );

  if (
    memberships.length === 0
  ) {
    throw new Error(
      "Your account has no active organization access."
    );
  }

  const session =
    await createSession(
      user.userId
    );

  return {
    user: {
      userId:
        user.userId,
      email: user.email,
      firstName:
        user.firstName,
      lastName:
        user.lastName,
    },

    memberships,

    ...session,
  };
}

// =====================================================
// REFRESH SESSION
// =====================================================

export async function refreshSession(
  refreshToken: string
) {
  let decoded: jwt.JwtPayload;

  try {
    const verified =
      jwt.verify(
        refreshToken,
        authConfig.refreshTokenSecret
      );

    if (
      typeof verified ===
        "string" ||
      verified.type !==
        "refresh" ||
      !verified.sub
    ) {
      throw new Error(
        "Invalid refresh token."
      );
    }

    decoded = verified;
  } catch {
    throw new Error(
      "Invalid or expired refresh token."
    );
  }

  const userId =
    decoded.sub;

  if (!userId) {
    throw new Error(
      "Invalid refresh token."
    );
  }

  const tokenHash =
    hashToken(refreshToken);

  const storedToken =
    await findRefreshToken(
      tokenHash
    );

  if (
    !storedToken ||
    storedToken.userId !==
      userId
  ) {
    throw new Error(
      "Refresh token is no longer valid."
    );
  }

  const user =
    await findUserById(
      userId
    );

  if (
    !user ||
    user.status !==
      "active"
  ) {
    await revokeRefreshToken(
      tokenHash
    );

    throw new Error(
      "Account is inactive."
    );
  }

  const memberships =
    await getUserMemberships(
      userId
    );

  if (
    memberships.length === 0
  ) {
    await revokeRefreshToken(
      tokenHash
    );

    throw new Error(
      "Account has no active organization access."
    );
  }

const revoked =
  await revokeRefreshToken(
    tokenHash
  );
if (!revoked) {
  console.warn(
    "Duplicate refresh request detected"
  );

  const user = await findUserById(userId);

  const memberships =
    await getUserMemberships(userId);

  const session =
    await createSession(userId);

  return {
    user: {
      userId: user!.userId,
      email: user!.email,
      firstName: user!.firstName,
      lastName: user!.lastName,
    },
    memberships,
    ...session,
  };
}


  const session =
    await createSession(
      userId
    );

  return {
    user: {
      userId:
        user.userId,
      email: user.email,
      firstName:
        user.firstName,
      lastName:
        user.lastName,
    },

    memberships,

    ...session,
  };
}

// =====================================================
// LOGOUT USER
// =====================================================

export async function logoutUser(
  refreshToken: string
) {
  return revokeRefreshToken(
    hashToken(refreshToken)
  );
}