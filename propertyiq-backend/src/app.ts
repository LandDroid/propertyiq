import express, {
  Request,
  Response,
  NextFunction,
} from "express";

import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

import { requireAuth } from "./middleware/auth.middleware";

import authRoutes from "./modules/auth/auth.routes";
import teamsRoutes from "./modules/teams/team.routes";
import propertiesRoutes from "./modules/properties/properties.routes";
import devicesRoutes from "./modules/devices/devices.routes";
import telemetryRoutes from "./modules/telemetry/telemetry.routes";
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

// =====================================================
// SECURITY
// =====================================================

app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN
          .split(",")
          .map((origin) =>
            origin.trim()
          )
      : [
          "http://localhost:3000",
        ],

    credentials: true,
  })
);

// =====================================================
// RATE LIMITING
// =====================================================
// =====================================================
// RATE LIMITING
// =====================================================

const isProduction =
  process.env.NODE_ENV === "production";

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 100 : 10000,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "Too many login attempts. Please try again later.",
  },
});

app.use("/api/v1", apiLimiter);


// =====================================================
// REQUEST PARSING
// =====================================================

app.use(
  express.json({
    limit: "1mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
  })
);

app.use(cookieParser());

// =====================================================
// HEALTH CHECK
// =====================================================

app.get(
  "/api/v1/health",
  (
    _req: Request,
    res: Response
  ) => {
    res.status(200).json({
      success: true,
      message:
        "PropertyIQ API is running",
      timestamp:
        new Date().toISOString(),
    });
  }
);

// =====================================================
// PUBLIC ROUTES
// =====================================================

app.use(
  "/api/v1/auth",
  authRoutes
);

// =====================================================
// AUTH REQUIRED
// =====================================================

app.use(
  "/api/v1",
  requireAuth
);

// =====================================================
// PROTECTED ROUTES
// =====================================================

app.use(
  "/api/v1/teams",
  teamsRoutes
);

app.use(
  "/api/v1/properties",
  propertiesRoutes
);

app.use(
  "/api/v1/devices",
  devicesRoutes
);

app.use(
  "/api/v1/telemetry",
  telemetryRoutes
);

app.use(
  "/api/v1/alerts",
  alertsRoutes
);

app.use(
  "/api/v1/alert-assignments",
  alertAssignmentsRoutes
);

app.use(
  "/api/v1/assets",
  assetsRoutes
);

app.use(
  "/api/v1/warranties",
  warrantiesRoutes
);

app.use(
  "/api/v1/maintenance",
  maintenanceRoutes
);

app.use(
  "/api/v1/settings",
  settingsRoutes
);

app.use(
  "/api/v1/property-managers",
  propertyManagersRoutes
);

app.use(
  "/api/v1/property-services",
  propertyServicesRoutes
);

app.use(
  "/api/v1/service-providers",
  serviceProvidersRoutes
);

app.use(
  "/api/v1/service-provider-contacts",
  serviceProviderContactsRoutes
);

app.use(
  "/api/v1/service-provider-contracts",
  serviceProviderContractsRoutes
);

app.use(
  "/api/v1/maintenance-task-assignments",
  maintenanceTaskAssignmentsRoutes
);

app.use(
  "/api/v1/maintenance-tasks",
  maintenanceTasksRoutes
);

app.use(
  "/api/v1/notifications/preferences",
  notificationPreferencesRoutes
);

app.use(
  "/api/v1/notifications/deliveries",
  notificationDeliveriesRoutes
);

// =====================================================
// 404 HANDLER
// =====================================================

app.use(
  (
    _req: Request,
    res: Response
  ) => {
    res.status(404).json({
      success: false,
      message:
        "API endpoint not found",
    });
  }
);

// =====================================================
// GLOBAL ERROR HANDLER
// =====================================================

app.use(
  (
    error: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    if (
      process.env.NODE_ENV !==
      "production"
    ) {
      console.error(error);
    }

    res.status(500).json({
      success: false,
      message:
        "An unexpected server error occurred",
    });
  }
);

export default app;