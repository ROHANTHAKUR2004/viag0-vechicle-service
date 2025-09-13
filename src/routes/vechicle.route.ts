import { Router } from "express";
import { createBus, listVehicles, searchVehicles } from "../controllers/busController";



const router = Router();

// POST /api/vehicles
router.post("/create", createBus);

router.get("/getvechicle", listVehicles);
router.get("/search", searchVehicles);

export default router;
