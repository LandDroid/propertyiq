import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
  register,
  login,
  refresh,
  logout,
} from "./auth.controller";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message:
      "Too many login attempts. Please try again later.",
  },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "Too many registration attempts. Please try again later.",
  },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "Too many refresh requests. Please try again later.",
  },
});

router.post(
  "/register",
  registerLimiter,
  register
);

router.post(
  "/login",
  loginLimiter,
  login
);

router.post(
  "/refresh",
  refreshLimiter,
  refresh
);

router.post(
  "/logout",
  logout
);

export default router;