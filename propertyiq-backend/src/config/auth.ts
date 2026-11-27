
import dotenv from "dotenv";

dotenv.config();

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim().length < 32) {
    throw new Error(
      `${name} must be configured with at least 32 characters.`
    );
  }

  return value;
}

export const authConfig = {
  accessTokenSecret: requiredEnv("JWT_ACCESS_SECRET"),
  refreshTokenSecret: requiredEnv("JWT_REFRESH_SECRET"),

  accessTokenExpiresIn:
    process.env.JWT_ACCESS_EXPIRES_IN || "15m",

  refreshTokenDays: Number(
    process.env.JWT_REFRESH_DAYS || 30
  ),

  frontendUrl:
    process.env.FRONTEND_URL || "http://localhost:3000",
};

if (
  !Number.isInteger(authConfig.refreshTokenDays) ||
  authConfig.refreshTokenDays < 1
) {
  throw new Error("JWT_REFRESH_DAYS must be a positive integer.");
}
