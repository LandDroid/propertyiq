import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

import { requireAuth } from "./middleware/auth.middleware";

import authRoutes from "./modules/auth/auth.routes";
import teamsRoutes from "./modules/teams/team.routes";
import propertiesRoutes from "./modules/properties/properties.routes";
import devicesRoutes from "./modules/devices/devices.routes";
import alertsRoutes from "./modules/alerts/alerts.routes";
import alertAssignmentsRoutes from "./modules/alert-assignments/alert-assignments.routes";
import assetsRoutes from "./modules/assets/assets.routes";
import warrantiesRoutes from "./modules/warranties/warranties.routes";
import maintenanceRoutes from "./modules/maintenance/maintenance.routes";
import settingsRoutes from "./modules/settings/settings.routes";
import maintenanceTasksRoutes from "./modules/maintenance-tasks/maintenance-tasks.routes";
import serviceProvidersRoutes from "./modules/service-providers/service-providers.routes";
import serviceProviderContactsRoutes from "./modules/service-provider-contacts/service-provider-contacts.routes";
import serviceProviderContractsRoutes from "./modules/service-provider-contracts/service-provider-contracts.routes";
import propertyManagersRoutes from "./modules/property-managers/property-managers.routes";
import propertyServicesRoutes from "./modules/property-services/property-services.routes";
import maintenanceTaskAssignmentsRoutes from "./modules/maintenance-task-assignments/maintenance-task-assignments.routes";
import notificationPreferencesRoutes from "./modules/notifications/notification-preferences.routes";
import notificationDeliveriesRoutes from "./modules/notifications/notification-deliveries.routes";

const app = express();

app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "same-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests:
          process.env.NODE_ENV === "production" ? [] : null,
      },
    },
  })
);

const origins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set(
  origins.length > 0
    ? origins
    : process.env.NODE_ENV === "production"
      ? []
      : ["http://localhost:3000"]
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    maxAge: 600,
  })
);

app.use(express.json({ limit: "64kb", strict: true }));
app.use(express.urlencoded({ extended: false, limit: "64kb" }));
app.use(cookieParser());

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Try again later." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Try again later.",
  },
});

app.get("/api/v1/health", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).json({
    success: true,
    message: "PropertyIQ API is running",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/v1", generalLimiter);
app.use("/api/v1/auth", authLimiter, authRoutes);
app.use("/api/v1/teams", teamsRoutes);

app.use("/api/v1", requireAuth);
app.use("/api/v1/properties", propertiesRoutes);
app.use("/api/v1/devices", devicesRoutes);
app.use("/api/v1/alerts", alertsRoutes);
app.use("/api/v1/alert-assignments", alertAssignmentsRoutes);
app.use("/api/v1/assets", assetsRoutes);
app.use("/api/v1/warranties", warrantiesRoutes);
app.use("/api/v1/maintenance", maintenanceRoutes);
app.use("/api/v1/settings", settingsRoutes);
app.use("/api/v1/property-managers", propertyManagersRoutes);
app.use("/api/v1/property-services", propertyServicesRoutes);
app.use("/api/v1/service-providers", serviceProvidersRoutes);
app.use("/api/v1/notifications/deliveries", notificationDeliveriesRoutes);
app.use("/api/v1/service-provider-contacts", serviceProviderContactsRoutes);
app.use("/api/v1/service-provider-contracts", serviceProviderContractsRoutes);
app.use("/api/v1/maintenance-task-assignments", maintenanceTaskAssignmentsRoutes);
app.use("/api/v1/maintenance-tasks", maintenanceTasksRoutes);
app.use("/api/v1/notifications/preferences", notificationPreferencesRoutes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: "API endpoint not found" });
});

app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = error.status ?? 500;

  if (status === 400) {
    res.status(400).json({ success: false, message: "Invalid request" });
    return;
  }

  if (status === 413) {
    res.status(413).json({ success: false, message: "Request is too large" });
    return;
  }

  if (error.message === "Origin is not allowed by CORS") {
    res.status(403).json({ success: false, message: "Origin is not allowed" });
    return;
  }

  console.error("Unhandled API error:", error.name);
  res.status(500).json({ success: false, message: "Unexpected server error" });
});

export default app;
