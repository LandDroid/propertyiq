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

// Do not reveal the underlying server framework in response headers.
app.disable("x-powered-by");
app.use(helmet());

// Allow only explicitly configured frontend origins. CORS is a browser policy,
// not an authorization mechanism; protected routes still require authentication.
const configuredOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set(
  configuredOrigins.length > 0
    ? configuredOrigins
    : process.env.NODE_ENV === "production"
      ? []
      : ["http://localhost:3000"]
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Requests without an Origin header (for example health checks and server
      // to server calls) are not subject to browser CORS enforcement.
      callback(null, !origin || allowedOrigins.has(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    maxAge: 600,
  })
);

// Keep request bodies bounded to reduce resource-exhaustion risk.
app.use(express.json({ limit: "1mb", strict: true }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(cookieParser());

const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again later.",
  },
});

// Public health check is intentionally not rate limited so monitoring can
// continue to detect service availability.
app.get("/api/v1/health", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "PropertyIQ API is running",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/v1", apiRateLimit);

// Public authentication and team routes.
app.use("/api/v1/auth", authRateLimit, authRoutes);
app.use("/api/v1/teams", teamsRoutes);

// Authentication required for application APIs.
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
  res.status(404).json({
    success: false,
    message: "API endpoint not found",
  });
});

app.use(
  (
    error: Error & { status?: number; statusCode?: number },
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    // Avoid returning stack traces or internal details to API clients.
    const status = error.statusCode ?? error.status;
    if (status === 400 || status === 413) {
      res.status(status).json({
        success: false,
        message: status === 413 ? "Request body is too large." : "Invalid request body.",
      });
      return;
    }

    // Keep logs useful without serializing request data or credentials.
    console.error("API request failed:", error.name || "UnknownError");
    res.status(500).json({
      success: false,
      message: "An unexpected server error occurred",
    });
  }
);

export default app;
