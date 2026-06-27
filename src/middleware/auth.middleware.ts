import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "@cloud_cost_analyzer/db";
import { env } from "@cloud_cost_analyzer/env/server";

const JWT_SECRET = env.JWT_SECRET;

export interface AuthRequest extends Request {
    user?: any;
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(" ")[1];
        const cookieToken = (req as any).cookies?.token;
        const finalToken = cookieToken || token;

        if (!finalToken) {
            return res.status(401).json({ success: false, error: "Unauthorized: No token provided" });
        }

        const decoded = jwt.verify(finalToken, JWT_SECRET) as { id: string };

        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, email: true },
        });

        if (!user) {
            return res.status(401).json({ success: false, error: "Unauthorized: User not found" });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: "Unauthorized: Invalid token" });
    }
};
