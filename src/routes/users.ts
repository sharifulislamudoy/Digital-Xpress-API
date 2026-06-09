import { Router } from "express";
import { prisma } from "../lib/prisma";
import {
  authenticate,
  requireAdmin,
  requireAdminOrModerator,
  AuthRequest,
} from "../middleware/auth";
import { Role } from "@prisma/client";
import {
  sendBanEmail,
  sendUnbanEmail,
  sendDeletionEmail,
} from "../lib/mailer";

const router = Router();

function getStringParam(
  param: string | string[] | undefined
): string | undefined {
  if (typeof param === "string") return param;
  if (Array.isArray(param) && param.length > 0) return param[0];
  return undefined;
}

// ── GET all users (admin & moderator) ──────────────────────────────────────
router.get(
  "/",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          isBanned: true,
        },
        orderBy: { createdAt: "desc" },
      });
      const transformed = users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email || "",
        role: u.role.toString(),
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        isBanned: u.isBanned,
      }));
      return res.json({ success: true, users: transformed });
    } catch {
      return res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

// ── PATCH role (admin only) – bumps sessionVersion ─────────────────────────
router.patch(
  "/:id/role",
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res) => {
    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid ID" });

    const { role } = req.body;
    if (!role || !["admin", "moderator", "customer"].includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    try {
      const user = await prisma.user.update({
        where: { id },
        data: {
          role: role as Role,
          sessionVersion: { increment: 1 },
        },
        select: { id: true, role: true, name: true, email: true },
      });
      return res.json({
        success: true,
        user: {
          id: user.id,
          role: user.role.toString(),
          name: user.name,
          email: user.email || "",
        },
      });
    } catch {
      return res
        .status(500)
        .json({ success: false, message: "Failed to update role" });
    }
  }
);

// ── POST ban user – bumps sessionVersion ───────────────────────────────────
router.post(
  "/:id/ban",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    if (!req.user)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid ID" });
    if (req.user.id === id)
      return res
        .status(400)
        .json({ success: false, message: "You cannot ban yourself" });

    const { reason } = req.body;
    if (!reason || typeof reason !== "string" || reason.trim() === "") {
      return res
        .status(400)
        .json({ success: false, message: "Reason is required" });
    }

    try {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user)
        return res.status(404).json({ success: false, message: "User not found" });
      if (user.isBanned)
        return res
          .status(400)
          .json({ success: false, message: "User is already banned" });
      if (!user.email)
        return res
          .status(400)
          .json({ success: false, message: "User has no email, cannot ban" });

      // 👇 Moderator cannot ban admin
      if (req.user!.role === "moderator" && user.role === "admin") {
        return res
          .status(403)
          .json({ success: false, message: "Moderators cannot ban administrators" });
      }

      await prisma.user.update({
        where: { id },
        data: {
          isBanned: true,
          sessionVersion: { increment: 1 },
        },
      });

      await prisma.bannedUser.create({
        data: {
          email: user.email,
          mobile: user.mobile || "",
          name: user.name || undefined,
          reason: reason.trim(),
          bannedBy: req.user.id,
        },
      });

      await sendBanEmail(user.email, user.name || undefined, reason.trim());

      return res.json({ success: true, message: "User banned successfully" });
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ success: false, message: "Failed to ban user" });
    }
  }
);

// ── DELETE user permanently (admin only) ───────────────────────────────────
router.delete(
  "/:id",
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res) => {
    if (!req.user)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const id = getStringParam(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid ID" });
    if (req.user.id === id)
      return res
        .status(400)
        .json({ success: false, message: "You cannot delete yourself" });

    try {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user)
        return res.status(404).json({ success: false, message: "User not found" });

      const userEmail = user.email;
      const userName = user.name;

      await prisma.$transaction([
        prisma.user.delete({ where: { id } }),
        prisma.bannedUser.deleteMany({ where: { email: userEmail! } }),
      ]);

      if (userEmail) await sendDeletionEmail(userEmail, userName || undefined);

      return res.json({ success: true, message: "User permanently deleted" });
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ success: false, message: "Failed to delete user" });
    }
  }
);

// ── GET banned users list ──────────────────────────────────────────────────
router.get(
  "/banned",
  authenticate,
  requireAdminOrModerator,
  async (_req, res) => {
    try {
      const bannedUsers = await prisma.bannedUser.findMany({
        orderBy: { bannedAt: "desc" },
      });
      return res.json({ success: true, bannedUsers });
    } catch {
      return res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

// ── PATCH unban – bumps sessionVersion ─────────────────────────────────────
router.patch(
  "/banned/:id/unban",
  authenticate,
  requireAdminOrModerator,
  async (_req, res) => {
    const id = getStringParam(_req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid ID" });

    try {
      const bannedRecord = await prisma.bannedUser.findUnique({ where: { id } });
      if (!bannedRecord)
        return res
          .status(404)
          .json({ success: false, message: "Banned record not found" });

      const user = await prisma.user.findUnique({
        where: { email: bannedRecord.email },
      });
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            isBanned: false,
            sessionVersion: { increment: 1 },
          },
        });
      }

      await prisma.bannedUser.delete({ where: { id } });

      if (bannedRecord.email && !bannedRecord.email.startsWith("deleted-")) {
        await sendUnbanEmail(bannedRecord.email, bannedRecord.name || undefined);
      }

      return res.json({ success: true, message: "User unbanned successfully" });
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ success: false, message: "Failed to unban user" });
    }
  }
);

export default router;