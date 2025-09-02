import { Router } from "express";
import { createBus, listVehicles } from "../controllers/busController";



const router = Router();

// POST /api/vehicles
router.post("/create", createBus);

router.get("/getvechicle", listVehicles)

export default router;
