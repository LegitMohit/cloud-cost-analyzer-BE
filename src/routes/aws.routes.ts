import { Router } from "express";
import { connectAWS, getAWSResources, getCostData, getForecast } from "../controllers/aws.controller.js";

const router = Router();

router.post("/connect", connectAWS);
router.get("/resources", getAWSResources);
router.post("/cost", getCostData);
router.get("/cost/forecast", getForecast);

export default router;