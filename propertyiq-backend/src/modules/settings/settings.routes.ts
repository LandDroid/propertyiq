import { Router } from "express";

import {
  getSettings,
  updateOrganizationName,
} from "./settings.controller";

const router = Router();

router.get("/", getSettings);
router.patch("/organization", updateOrganizationName);

export default router;