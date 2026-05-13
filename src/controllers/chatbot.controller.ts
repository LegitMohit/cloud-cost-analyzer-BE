import type { Response } from "express";
import { sendMessage, getHistory, clearHistory, getUserAccounts } from "../services/chatbot/chatbot.service.js";
import { sendMessageSchema } from "../services/chatbot/chatbot.validation.js";
import type { AuthRequest } from "../middleware/auth.middleware.js";

export const sendMessageHandler = async (req: AuthRequest, res: Response) => {
  try {
    const { message, context } = sendMessageSchema.parse(req.body);
    const userId = req.user.id;

    const contextWithUser = {
      ...context,
      userId,
    };

    const response = await sendMessage(userId, message, contextWithUser);

    res.status(200).json({ message: response });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input" });
    }
    res.status(500).json({ error: error.message || "Failed to send message" });
  }
};

export const getHistoryHandler = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const history = getHistory(userId);
    res.status(200).json({ history });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to get history" });
  }
};

export const clearHistoryHandler = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    clearHistory(userId);
    res.status(200).json({ message: "History cleared" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to clear history" });
  }
};

export const getAccountsHandler = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const accounts = await getUserAccounts(userId);
    res.status(200).json({ accounts });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to get accounts" });
  }
};