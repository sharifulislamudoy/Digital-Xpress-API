"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const cloudinary_1 = require("../lib/cloudinary");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
            return cb(new Error("Only image files are allowed"));
        }
        cb(null, true);
    },
});
function getStringParam(param) {
    if (typeof param === "string")
        return param;
    if (Array.isArray(param) && param.length > 0)
        return param[0];
    return undefined;
}
function normalizeProductLink(productLink) {
    if (typeof productLink !== "string")
        return null;
    const trimmed = productLink.trim();
    return trimmed.length > 0 ? trimmed : null;
}
// Public route: frontend hero slider can use this later
router.get("/published", async (_req, res) => {
    try {
        const banners = await prisma_1.prisma.banner.findMany({
            where: { isPublished: true },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                imageUrl: true,
                productLink: true,
                isPublished: true,
                createdAt: true,
            },
        });
        return res.json({ success: true, banners });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Failed to load banners" });
    }
});
// Admin/moderator: get all banners
router.get("/", auth_1.authenticate, auth_1.requireAdminOrModerator, async (_req, res) => {
    try {
        const banners = await prisma_1.prisma.banner.findMany({
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                imageUrl: true,
                cloudinaryPublicId: true,
                productLink: true,
                isPublished: true,
                createdById: true,
                createdByName: true,
                createdByEmail: true,
                createdByRole: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        return res.json({
            success: true,
            banners: banners.map((banner) => ({
                ...banner,
                createdByRole: banner.createdByRole.toString(),
            })),
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Failed to load banners" });
    }
});
// Admin/moderator: create banner
router.post("/", auth_1.authenticate, auth_1.requireAdminOrModerator, upload.single("image"), async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!req.file) {
        return res.status(400).json({ success: false, message: "Banner image is required" });
    }
    try {
        const uploaded = await (0, cloudinary_1.uploadToCloudinary)(req.file.buffer);
        const productLink = normalizeProductLink(req.body.productLink);
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
            },
        });
        if (!user) {
            await (0, cloudinary_1.deleteFromCloudinary)(uploaded.public_id);
            return res.status(404).json({ success: false, message: "Creator user not found" });
        }
        const banner = await prisma_1.prisma.banner.create({
            data: {
                imageUrl: uploaded.secure_url,
                cloudinaryPublicId: uploaded.public_id,
                productLink,
                isPublished: true,
                createdById: user.id,
                createdByName: user.name || null,
                createdByEmail: user.email || null,
                createdByRole: user.role,
            },
        });
        return res.status(201).json({
            success: true,
            message: "Banner created successfully",
            banner: {
                ...banner,
                createdByRole: banner.createdByRole.toString(),
            },
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Failed to create banner" });
    }
});
// Admin/moderator: update banner
router.patch("/:id", auth_1.authenticate, auth_1.requireAdminOrModerator, upload.single("image"), async (req, res) => {
    const id = getStringParam(req.params.id);
    if (!id) {
        return res.status(400).json({ success: false, message: "Invalid banner ID" });
    }
    try {
        const existingBanner = await prisma_1.prisma.banner.findUnique({ where: { id } });
        if (!existingBanner) {
            return res.status(404).json({ success: false, message: "Banner not found" });
        }
        let imageUrl = existingBanner.imageUrl;
        let cloudinaryPublicId = existingBanner.cloudinaryPublicId;
        if (req.file) {
            const uploaded = await (0, cloudinary_1.uploadToCloudinary)(req.file.buffer);
            await (0, cloudinary_1.deleteFromCloudinary)(existingBanner.cloudinaryPublicId);
            imageUrl = uploaded.secure_url;
            cloudinaryPublicId = uploaded.public_id;
        }
        const productLink = typeof req.body.productLink === "string"
            ? normalizeProductLink(req.body.productLink)
            : existingBanner.productLink;
        const isPublished = typeof req.body.isPublished === "string"
            ? req.body.isPublished === "true"
            : existingBanner.isPublished;
        const updatedBanner = await prisma_1.prisma.banner.update({
            where: { id },
            data: {
                imageUrl,
                cloudinaryPublicId,
                productLink,
                isPublished,
            },
        });
        return res.json({
            success: true,
            message: "Banner updated successfully",
            banner: {
                ...updatedBanner,
                createdByRole: updatedBanner.createdByRole.toString(),
            },
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Failed to update banner" });
    }
});
// Admin/moderator: delete banner
router.delete("/:id", auth_1.authenticate, auth_1.requireAdminOrModerator, async (req, res) => {
    const id = getStringParam(req.params.id);
    if (!id) {
        return res.status(400).json({ success: false, message: "Invalid banner ID" });
    }
    try {
        const banner = await prisma_1.prisma.banner.findUnique({ where: { id } });
        if (!banner) {
            return res.status(404).json({ success: false, message: "Banner not found" });
        }
        await prisma_1.prisma.banner.delete({ where: { id } });
        await (0, cloudinary_1.deleteFromCloudinary)(banner.cloudinaryPublicId);
        return res.json({ success: true, message: "Banner deleted successfully" });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Failed to delete banner" });
    }
});
exports.default = router;
