
import { Router } from "express";

import { PropertiesController } from "./properties.controller";
import { requireAuth } from "../../middleware/auth.middleware";

const router = Router();
const controller = new PropertiesController();

// All property endpoints require a valid access token.
router.use(requireAuth);

router.get("/", (req, res) => controller.getAll(req, res));
router.get("/:id", (req, res) => controller.getById(req, res));
router.post("/", (req, res) => controller.create(req, res));
router.put("/:id", (req, res) => controller.update(req, res));
router.delete("/:id", (req, res) => controller.delete(req, res));

export default router;
