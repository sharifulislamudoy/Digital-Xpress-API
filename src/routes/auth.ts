import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = Router();

// Register with email/password
router.post("/register", async (req: Request, res: Response) => {
    try {
        const { name, email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email and password are required" });
        }

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return res.status(409).json({ success: false, message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const user = await prisma.user.create({
            data: { name, email, password: hashedPassword },
            select: { id: true, name: true, email: true, createdAt: true },
        });

        return res.status(201).json({ success: true, message: "Account created", user });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});

// Login with email/password
router.post("/login", async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({
            where: { email } ,
    select: {
                id: true,
                name: true,
                email: true,
                password: true,
            },
        });
        if (!user || !user.password) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET || "fallback_secret",
            { expiresIn: "7d" }
        );

        return res.json({
            success: true,
            token,
            user: { id: user.id, name: user.name, email: user.email },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});

// OAuth sync – called by Next.js after Google login
router.post("/oauth-sync", async (req: Request, res: Response) => {
    try {
        const { name, email, image, provider, providerAccountId } = req.body;
        if (!email) return res.status(400).json({ success: false });

        let user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            user = await prisma.user.create({
                data: { name, email, image },
            });
        }

        // Upsert account link
        await prisma.account.upsert({
            where: { provider_providerAccountId: { provider, providerAccountId } },
            update: {},
            create: {
                userId: user.id,
                type: "oauth",
                provider,
                providerAccountId,
            },
        });

        return res.json({ success: true, user });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false });
    }
});

export default router;