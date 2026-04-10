import { Router } from "express";
import { connectAWS, getAWSResources, getCostData, getForecast, getConnectedAccounts } from "../controllers/aws.controller.js";

const router = Router();

router.post("/connect", connectAWS);
router.get("/resources", getAWSResources);
router.post("/cost", getCostData);
router.get("/cost/forecast", getForecast);
router.get("/connected-accounts", getConnectedAccounts);

export default router;