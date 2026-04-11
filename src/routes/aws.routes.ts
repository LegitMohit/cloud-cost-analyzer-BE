import { Router } from "express";
import { connectAWS, getAWSResources, getCostData, getForecast, getConnectedAccounts, generateRecommendations, getRecommendations } from "../controllers/aws.controller.js";

const router = Router();

router.post("/connect", connectAWS);
router.get("/resources", getAWSResources);
router.post("/cost", getCostData);
router.get("/cost/forecast", getForecast);
router.get("/connected-accounts", getConnectedAccounts);
router.post("/recommendations/generate", generateRecommendations);
router.get("/recommendations", getRecommendations);

export default router;