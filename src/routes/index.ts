import { Router } from "express";
import healthRouter from "./health.routes.js";
import authRouter from "./auth.routes.js";
import awsRouter from "./aws.routes.js";
import chatbotRouter from "./chatbot.routes.js";

const router = Router();

router.use("/health", healthRouter);
router.use("/auth", authRouter);
router.use("/aws", awsRouter);
router.use("/chatbot", chatbotRouter);

export default router;
