import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import ms from "ms";
import { prisma } from "@cloud_cost_analyzer/db";
import { z } from "zod";

import { env } from "@cloud_cost_analyzer/env/server";

const JWT_SECRET = env.JWT_SECRET;
const JWT_EXPIRES_IN = env.JWT_EXPIRES_IN;
const COOKIE_MAX_AGE = ms(JWT_EXPIRES_IN as ms.StringValue) ?? 7 * 24 * 60 * 60 * 1000;

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
            return res.status(400).json({ error: "Email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
            },
        });

        const token = jwt.sign({ id: user.id }, JWT_SECRET, {
            expiresIn: JWT_EXPIRES_IN as any,
        });

        res.cookie("token", token, {
            httpOnly: true,
            secure: env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: COOKIE_MAX_AGE
        });

        return res.status(201).json({
            message: "User registered successfully",
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
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign({ id: user.id }, JWT_SECRET, {
            expiresIn: JWT_EXPIRES_IN as any,
        });

        res.cookie("token", token, {
            httpOnly: true,
            secure: env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: COOKIE_MAX_AGE
        });

        return res.status(200).json({
            message: "Login successful",
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
    res.cookie("token", "", {
        httpOnly: true,
        expires: new Date(0),
    });
    return res.status(200).json({ message: "Logged out successfully" });
};
