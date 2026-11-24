
import { z } from "zod";

export const registerSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters.")
    .max(150),

  firstName: z
    .string()
    .trim()
    .min(1, "First name is required.")
    .max(100),

  lastName: z
    .string()
    .trim()
    .max(100)
    .optional()
    .nullable(),

  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .max(255)
    .transform((value) => value.toLowerCase()),

  password: z
    .string()
    .min(12, "Password must be at least 12 characters.")
    .max(128, "Password cannot exceed 128 characters.")
    .regex(/[A-Z]/, "Password must contain an uppercase letter.")
    .regex(/[a-z]/, "Password must contain a lowercase letter.")
    .regex(/[0-9]/, "Password must contain a number."),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .max(255)
    .transform((value) => value.toLowerCase()),

  password: z
    .string()
    .min(1, "Password is required.")
    .max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(32),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
