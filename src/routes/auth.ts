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

// Helper: check if email or phone is banned
async function isIdentifierBanned(
  email?: string,
  mobile?: string
): Promise<{ banned: boolean; contact?: string; reason?: string }> {
  if (email) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { isBanned: true },
    });
    if (user?.isBanned) return { banned: true, contact: email };
    const bannedRecord = await prisma.bannedUser.findUnique({ where: { email } });
    if (bannedRecord)
      return { banned: true, contact: bannedRecord.email, reason: bannedRecord.reason };
  }
  if (mobile) {
    const user = await prisma.user.findFirst({
      where: { mobile },
      select: { isBanned: true },
    });
    if (user?.isBanned) return { banned: true, contact: mobile };
    const bannedRecord = await prisma.bannedUser.findFirst({ where: { mobile } });
    if (bannedRecord)
      return { banned: true, contact: bannedRecord.email, reason: bannedRecord.reason };
  }
  return { banned: false };
}

// ------------------------- REGISTER -------------------------
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { name, email, mobile, password } = req.body;
    if (!name || !email || !password || !mobile) {
      return res.status(400).json({ success: false, message: "All fields required" });
    }

    const bannedCheck = await isIdentifierBanned(email, mobile);
    if (bannedCheck.banned) {
      return res.status(403).json({
        success: false,
        message: "BANNED_ACCOUNT",
        contactEmail: process.env.CONTACT_EMAIL || "info@digital-xpress-bd.com",
        contactPhone: process.env.CONTACT_PHONE || "+8801995322033",
        bannedIdentifier: bannedCheck.contact,
        reason: bannedCheck.reason,
      });
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { mobile }] },
    });
    if (existing) {
      return res.status(409).json({ success: false, message: "User already exists" });
    }

    await prisma.pendingRegistration.deleteMany({ where: { email } });

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
    return res.status(200).json({ success: true, message: "Verification code sent" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ------------------------- VERIFY OTP -------------------------
router.post("/verify-otp", async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;
    const pending = await prisma.pendingRegistration.findUnique({ where: { email } });
    if (!pending)
      return res.status(400).json({ success: false, message: "No pending registration" });
    if (pending.otpCode !== otp)
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    if (pending.expiresAt < new Date()) {
      await prisma.pendingRegistration.delete({ where: { email } });
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    const user = await prisma.user.create({
      data: {
        name: pending.name,
        email: pending.email,
        mobile: pending.mobile,
        password: pending.passwordHash,
        emailVerified: new Date(),
        role: "customer",
        isBanned: false,
      },
      select: { id: true, name: true, email: true, role: true, sessionVersion: true },
    });

    await prisma.pendingRegistration.delete({ where: { email } });
    await sendWelcomeEmail(user.email!, user.name || undefined);

    return res.status(201).json({ success: true, message: "Account created", user });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ------------------------- LOGIN -------------------------
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body;

    const bannedCheck = await isIdentifierBanned(identifier, identifier);
    if (bannedCheck.banned) {
      return res.status(403).json({
        success: false,
        message: "BANNED_ACCOUNT",
        contactEmail: process.env.CONTACT_EMAIL || "info@digital-xpress-bd.com",
        contactPhone: process.env.CONTACT_PHONE || "+8801995322033",
        bannedIdentifier: bannedCheck.contact,
        reason: bannedCheck.reason,
      });
    }

    const user = await prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { mobile: identifier }] },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        isBanned: true,
        sessionVersion: true,
      },
    });

    if (!user || !user.password)
      return res.status(401).json({ success: false, message: "Invalid credentials" });

    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: "BANNED_ACCOUNT",
        contactEmail: process.env.CONTACT_EMAIL || "info@digital-xpress-bd.com",
        contactPhone: process.env.CONTACT_PHONE || "+8801995322033",
        bannedIdentifier: user.email || identifier,
      });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ success: false, message: "Invalid credentials" });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        sessionVersion: user.sessionVersion,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ------------------------- OAUTH SYNC (Google) -------------------------
router.post("/oauth-sync", async (req: Request, res: Response) => {
  try {
    const { name, email, image } = req.body;
    if (!email)
      return res.status(400).json({ success: false, message: "Email required" });

    const bannedCheck = await isIdentifierBanned(email, undefined);
    if (bannedCheck.banned) {
      return res.status(403).json({
        success: false,
        message: "BANNED_ACCOUNT",
        contactEmail: process.env.CONTACT_EMAIL || "info@digital-xpress-bd.com",
        contactPhone: process.env.CONTACT_PHONE || "+8801995322033",
        bannedIdentifier: bannedCheck.contact,
        reason: bannedCheck.reason,
      });
    }

    let user = await prisma.user.findUnique({ where: { email } });
    let isNew = false;

    if (!user) {
      isNew = true;
      user = await prisma.user.create({
        data: {
          name: name || email.split("@")[0],
          email,
          image: image || null,
          emailVerified: new Date(),
          role: "customer",
          isBanned: false,
        },
      });
    } else if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: "BANNED_ACCOUNT",
        contactEmail: process.env.CONTACT_EMAIL || "info@digital-xpress-bd.com",
        contactPhone: process.env.CONTACT_PHONE || "+8801995322033",
        bannedIdentifier: email,
      });
    }

    if (isNew) await sendWelcomeEmail(email, name || undefined);

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        sessionVersion: user.sessionVersion,
      },
      token,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ------------------------- SESSION CHECK -------------------------
router.get("/session-check", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "fallback_secret"
    ) as { userId: string };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, isBanned: true, sessionVersion: true },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: "User not found" });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, message: "Account is banned" });
    }

    return res.json({
      success: true,
      role: user.role.toString(),
      sessionVersion: user.sessionVersion,
    });
  } catch {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
});

// ------------------------- CHECK BANNED (for Google signIn callback) --------
router.get("/check-banned", async (req: Request, res: Response) => {
  const email = req.query.email as string | undefined;
  if (!email) return res.status(400).json({ success: false, message: "Email required" });

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { isBanned: true },
    });
    if (user?.isBanned) {
      return res.json({
        banned: true,
        identifier: email,
        contactEmail: process.env.CONTACT_EMAIL || "info@digital-xpress-bd.com",
        contactPhone: process.env.CONTACT_PHONE || "+8801995322033",
      });
    }

    const bannedRecord = await prisma.bannedUser.findUnique({ where: { email } });
    if (bannedRecord) {
      return res.json({
        banned: true,
        identifier: email,
        contactEmail: process.env.CONTACT_EMAIL || "info@digital-xpress-bd.com",
        contactPhone: process.env.CONTACT_PHONE || "+8801995322033",
        reason: bannedRecord.reason,
      });
    }

    return res.json({ banned: false });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;