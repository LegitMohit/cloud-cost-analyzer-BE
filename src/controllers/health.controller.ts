import type { Response } from "express";
import { HealthService } from "../services/health.service.js";

const healthService = new HealthService();

export const getHealth = async (res: Response) => {
    try {
        const health = await healthService.getHealthStatus();
        res.status(200).json(health);
    } catch (error) {
        res.status(500).json({ status: "ERROR", message: "Failed to fetch health check status" });
    }
};
