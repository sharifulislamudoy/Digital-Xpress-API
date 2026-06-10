import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma";
import {
  authenticate,
  requireAdminOrModerator,
  AuthRequest,
} from "../middleware/auth";
import { uploadToCloudinary, deleteFromCloudinary } from "../lib/cloudinary";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
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

function getStringParam(param: string | string[] | undefined): string | undefined {
  if (typeof param === "string") return param;
  if (Array.isArray(param) && param.length > 0) return param[0];
  return undefined;
}

function normalizeProductLink(productLink?: unknown) {
  if (typeof productLink !== "string") return null;
  const trimmed = productLink.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Public route: frontend hero slider can use this later
router.get("/published", async (_req, res) => {
  try {
    const banners = await prisma.banner.findMany({
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
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to load banners" });
  }
});

// Admin/moderator: get all banners
router.get("/", authenticate, requireAdminOrModerator, async (_req: AuthRequest, res) => {
  try {
    const banners = await prisma.banner.findMany({
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
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to load banners" });
  }
});

// Admin/moderator: create banner
router.post(
  "/",
  authenticate,
  requireAdminOrModerator,
  upload.single("image"),
  async (req: AuthRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "Banner image is required" });
    }

    try {
      const uploaded = await uploadToCloudinary(req.file.buffer);
      const productLink = normalizeProductLink(req.body.productLink);

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      });

      if (!user) {
        await deleteFromCloudinary(uploaded.public_id);
        return res.status(404).json({ success: false, message: "Creator user not found" });
      }

      const banner = await prisma.banner.create({
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
    } catch (error) {
      console.error(error);
      return res.status(500).json({ success: false, message: "Failed to create banner" });
    }
  }
);

// Admin/moderator: update banner
router.patch(
  "/:id",
  authenticate,
  requireAdminOrModerator,
  upload.single("image"),
  async (req: AuthRequest, res) => {
    const id = getStringParam(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: "Invalid banner ID" });
    }

    try {
      const existingBanner = await prisma.banner.findUnique({ where: { id } });

      if (!existingBanner) {
        return res.status(404).json({ success: false, message: "Banner not found" });
      }

      let imageUrl = existingBanner.imageUrl;
      let cloudinaryPublicId = existingBanner.cloudinaryPublicId;

      if (req.file) {
        const uploaded = await uploadToCloudinary(req.file.buffer);
        await deleteFromCloudinary(existingBanner.cloudinaryPublicId);

        imageUrl = uploaded.secure_url;
        cloudinaryPublicId = uploaded.public_id;
      }

      const productLink =
        typeof req.body.productLink === "string"
          ? normalizeProductLink(req.body.productLink)
          : existingBanner.productLink;

      const isPublished =
        typeof req.body.isPublished === "string"
          ? req.body.isPublished === "true"
          : existingBanner.isPublished;

      const updatedBanner = await prisma.banner.update({
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
    } catch (error) {
      console.error(error);
      return res.status(500).json({ success: false, message: "Failed to update banner" });
    }
  }
);

// Admin/moderator: delete banner
router.delete("/:id", authenticate, requireAdminOrModerator, async (req: AuthRequest, res) => {
  const id = getStringParam(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: "Invalid banner ID" });
  }

  try {
    const banner = await prisma.banner.findUnique({ where: { id } });

    if (!banner) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }

    await prisma.banner.delete({ where: { id } });
    await deleteFromCloudinary(banner.cloudinaryPublicId);

    return res.json({ success: true, message: "Banner deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to delete banner" });
  }
});

export default router;