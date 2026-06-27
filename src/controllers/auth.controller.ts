import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "@cloud_cost_analyzer/db";
import { z } from "zod";

import { env } from "@cloud_cost_analyzer/env/server";

const JWT_SECRET = env.JWT_SECRET;
const JWT_EXPIRES_IN = env.JWT_EXPIRES_IN;

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

export const register = async (req: Request, res: Response) => {
    try {
        const { email, password } = registerSchema.parse(req.body);

        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            console.warn(`Registration attempt Email already exists: ${email}`);
            return res.status(409).json({ error: "Email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
            },
        });

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
            expiresIn: JWT_EXPIRES_IN as any,
        });

        console.info(`User registered: ${email} (ID: ${user.id})`);

        return res.status(201).json({
            success: true,
            token,
            user: { id: user.id, email: user.email },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.issues });
        }
        console.error("Register error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = loginSchema.parse(req.body);

        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            console.warn(`Login attempt with non-existent email: ${email}`);
            return res.status(404).json({ error: "User not found" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            console.warn(`Login attempt with invalid password for email: ${email}`);
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
            expiresIn: JWT_EXPIRES_IN as any,
        });

        console.info(`User logged in: ${email} (ID: ${user.id})`);

        res.cookie("token", token, { httpOnly: true, secure: true, sameSite: "none" });

        return res.status(200).json({
            success: true,
            token,
            user: { id: user.id, email: user.email },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.issues });
        }
        console.error("Login error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const logout = async (_req: Request, res: Response) => {
    console.info("User logged out");
    return res.status(200).json({ success: true, message: "Logged out successfully" });
};

export const getCurrentUser = async (req: Request, res: Response) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ success: false, error: "Unauthorized: No token provided" });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
        return res.status(200).json({ user: { id: decoded.id, email: decoded.email } });
    } catch {
        return res.status(401).json({ success: false, error: "Unauthorized: Invalid token" });
    }
};

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

export const changePassword = async (req: Request, res: Response) => {
    try {
        const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(" ")[1];
        if (!token) {
            return res.status(401).json({ success: false, error: "Unauthorized: No token provided" });
        }

        const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
        const userId = decoded.id;

        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }

        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            return res.status(401).json({ success: false, error: "Current password is incorrect" });
        }

        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(400).json({ success: false, error: "New password must be different from current password" });
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedNewPassword },
        });

        console.info(`Password changed for user: ${user.email} (ID: ${userId})`);

        return res.status(200).json({
            success: true,
            message: "Password changed successfully",
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.issues });
        }
        console.error("Change password error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};
