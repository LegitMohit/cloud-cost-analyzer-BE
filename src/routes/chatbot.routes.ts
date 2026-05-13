import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { sendMessageHandler, getHistoryHandler, clearHistoryHandler, getAccountsHandler } from "../controllers/chatbot.controller.js";

const router = Router();

router.post("/message", requireAuth, sendMessageHandler);
router.get("/history", requireAuth, getHistoryHandler);
router.post("/clear", requireAuth, clearHistoryHandler);
router.get("/accounts", requireAuth, getAccountsHandler);

export default router;