import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { sendOtpEmail, sendWelcomeEmail } from "../lib/mailer";

const router = Router();

function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

// ------------------------- REGISTER (Step 1: Send OTP) -------------------------
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { name, email, mobile, password } = req.body;

    if (!name || !email || !password || !mobile) {
      return res.status(400).json({
        success: false,
        message: "Name, email, mobile, and password are required",
      });
    }

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { mobile }] },
    });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User with this email or mobile already exists",
      });
    }

    const pending = await prisma.pendingRegistration.findUnique({
      where: { email },
    });
    if (pending) {
      await prisma.pendingRegistration.delete({ where: { email } });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const otpCode = generateOtp();

    await prisma.pendingRegistration.create({
      data: {
        name,
        email,
        mobile,
        passwordHash: hashedPassword,
        otpCode,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    await sendOtpEmail(email, otpCode);

    return res.status(200).json({
      success: true,
      message: "Verification code sent to your email",
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ------------------------- VERIFY OTP (Step 2: Create user) -------------------------
router.post("/verify-otp", async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and OTP are required" });
    }

    const pending = await prisma.pendingRegistration.findUnique({
      where: { email },
    });

    if (!pending) {
      return res.status(400).json({ success: false, message: "No pending registration found" });
    }

    if (pending.otpCode !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    if (pending.expiresAt < new Date()) {
      await prisma.pendingRegistration.delete({ where: { email } });
      return res.status(400).json({ success: false, message: "OTP expired. Please register again." });
    }

    // Create user with role = "customer"
    const user = await prisma.user.create({
      data: {
        name: pending.name,
        email: pending.email,
        mobile: pending.mobile,
        password: pending.passwordHash,
        emailVerified: new Date(),
        role: "customer",   // explicitly set role
      },
      select: { id: true, name: true, email: true, role: true },
    });

    await prisma.pendingRegistration.delete({ where: { email } });

    if (user.email) {
      await sendWelcomeEmail(user.email, user.name || undefined);
    }

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      user,
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ------------------------- LOGIN -------------------------
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: "Identifier and password are required" });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { mobile: identifier }],
      },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
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
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ------------------------- OAUTH USER SYNC (no Account table) -------------------------
router.post("/oauth-sync", async (req: Request, res: Response) => {
  try {
    const { name, email, image } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email required" });

    let user = await prisma.user.findUnique({ where: { email } });
    let isNew = false;

    if (!user) {
      isNew = true;
      user = await prisma.user.create({
        data: {
          name: name || email.split('@')[0],
          email,
          image: image || null,
          emailVerified: new Date(),
          role: "customer",   // default role for OAuth users
        },
      });
    } else if (!user.emailVerified) {
      // Mark email as verified if it wasn't already
      user = await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      });
    }

    if (isNew && email) {
      await sendWelcomeEmail(email, name || undefined);
    }

    return res.json({ success: true, user });
  } catch (error) {
    console.error("OAuth sync error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;