import { Router } from "express";

import {
  requireAuth,
} from "../../middleware/auth.middleware";

import {
  requireViewer,
} from "../../middleware/authorization.middleware";

import { TelemetryController } from "./telemetry.controller";

const router = Router();

const controller =
  new TelemetryController();

// =====================================================
// CREATE TELEMETRY
// Future:
// Replace with device authentication
// =====================================================

router.post(
  "/",
  requireAuth,
  requireViewer,
  controller.create.bind(
    controller
  )
);

// =====================================================
// LATEST READING
// =====================================================

router.get(
  "/sensor/:sensorId/latest",
  requireAuth,
  requireViewer,
  controller.getLatest.bind(
    controller
  )
);

// =====================================================
// HISTORY
// =====================================================

router.get(
  "/sensor/:sensorId/history",
  requireAuth,
  requireViewer,
  controller.getHistory.bind(
    controller
  )
);

// =====================================================
// PROPERTY DASHBOARD
// =====================================================

router.get(
  "/dashboard/:propertyId",
  requireAuth,
  requireViewer,
  controller.getPropertyDashboard.bind(
    controller
  )
);

export default router;