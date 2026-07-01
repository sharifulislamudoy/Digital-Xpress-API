import { Router } from "express";
import multer from "multer";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  authenticate,
  requireAdminOrModerator,
  AuthRequest,
} from "../middleware/auth";
import {
  uploadImageToCloudinary,
  deleteFromCloudinary,
} from "../lib/cloudinary";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 5,
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }

    cb(null, true);
  },
});

const categoryUpload = upload.any();

type UploadedFilesMap = Record<string, Express.Multer.File[]>;

function getFilesFromRequest(req: AuthRequest): UploadedFilesMap {
  const files = req.files as Express.Multer.File[] | undefined;

  if (!files) return {};

  return files.reduce<UploadedFilesMap>((acc, file) => {
    if (!acc[file.fieldname]) acc[file.fieldname] = [];
    acc[file.fieldname].push(file);
    return acc;
  }, {});
}

function getStringParam(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function requiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }

  return value.trim();
}

function optionalString(value: unknown) {
  if (typeof value !== "string") return null;

  const cleanValue = value.trim();
  return cleanValue ? cleanValue : null;
}

function numberFromBody(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
}

function intFromBody(value: unknown, fallback = 0) {
  return Math.max(Math.trunc(numberFromBody(value, fallback)), 0);
}

function booleanFromBody(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    return value === "true" || value === "1" || value === "on";
  }

  return fallback;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim() !== "") {
    try {
      const parsed = JSON.parse(value);

      if (Array.isArray(parsed)) {
        return parsed.map(String).map((item) => item.trim()).filter(Boolean);
      }
    } catch {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function optionalSvg(value: unknown) {
  const svg = optionalString(value);
  if (!svg) return null;

  const lower = svg.toLowerCase();

  if (
    !lower.startsWith("<svg") ||
    lower.includes("<script") ||
    /\son[a-z]+\s*=/.test(lower)
  ) {
    throw new Error(
      "SVG icon must be a safe inline <svg> without script or event handlers",
    );
  }

  return svg;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function createUniqueCategorySlug(baseText: string, ignoreId?: string) {
  const baseSlug = slugify(baseText) || Date.now().toString();
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await prisma.productCategory.findUnique({
      where: { slug },
    });

    if (!existing || existing.id === ignoreId) return slug;

    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }
}

async function createUniqueSubCategorySlug(
  categoryId: string,
  baseText: string,
  ignoreId?: string,
) {
  const baseSlug = slugify(baseText) || Date.now().toString();
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await prisma.productSubCategory.findUnique({
      where: {
        categoryId_slug: {
          categoryId,
          slug,
        },
      },
    });

    if (!existing || existing.id === ignoreId) return slug;

    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }
}

function serializeCategory(category: any) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    imageUrl: category.imageUrl,
    imageCloudinaryPublicId: category.imageCloudinaryPublicId,
    iconSvg: category.iconSvg,
    sortOrder: category.sortOrder,
    isPublished: category.isPublished,
    seoTitle: category.seoTitle,
    seoDescription: category.seoDescription,
    seoKeywords: category.seoKeywords || [],
    productCount: category._count?.products || 0,
    subCategories: (category.subCategories || []).map((subCategory: any) => ({
      id: subCategory.id,
      name: subCategory.name,
      slug: subCategory.slug,
      categoryId: subCategory.categoryId,
      description: subCategory.description,
      imageUrl: subCategory.imageUrl,
      imageCloudinaryPublicId: subCategory.imageCloudinaryPublicId,
      iconSvg: subCategory.iconSvg,
      sortOrder: subCategory.sortOrder,
      isPublished: subCategory.isPublished,
      seoTitle: subCategory.seoTitle,
      seoDescription: subCategory.seoDescription,
      seoKeywords: subCategory.seoKeywords || [],
      productCount: subCategory._count?.products || 0,
      createdAt: subCategory.createdAt,
      updatedAt: subCategory.updatedAt,
    })),
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

function sendError(res: any, error: unknown, fallbackMessage: string) {
  console.error(error);

  if (error instanceof Error) {
    return res.status(400).json({ success: false, message: error.message });
  }

  return res.status(500).json({ success: false, message: fallbackMessage });
}

async function getCategoryList(adminMode = false) {
  return prisma.productCategory.findMany({
    where: adminMode ? undefined : { isPublished: true },
    include: {
      _count: {
        select: {
          products: true,
        },
      },
      subCategories: {
        where: adminMode ? undefined : { isPublished: true },
        include: {
          _count: {
            select: {
              products: true,
            },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

router.get("/", async (_req, res) => {
  try {
    const categories = await getCategoryList(false);

    return res.json({
      success: true,
      categories: categories.map(serializeCategory),
    });
  } catch (error) {
    return sendError(res, error, "Failed to load categories");
  }
});

router.get(
  "/admin",
  authenticate,
  requireAdminOrModerator,
  async (_req: AuthRequest, res) => {
    try {
      const categories = await getCategoryList(true);

      return res.json({
        success: true,
        categories: categories.map(serializeCategory),
      });
    } catch (error) {
      return sendError(res, error, "Failed to load admin categories");
    }
  },
);

router.post(
  "/",
  authenticate,
  requireAdminOrModerator,
  categoryUpload,
  async (req: AuthRequest, res) => {
    let uploadedImagePublicId: string | null = null;

    try {
      const files = getFilesFromRequest(req);
      const name = requiredString(req.body.name, "Category name");
      const slug = await createUniqueCategorySlug(
        optionalString(req.body.slug) || name,
      );

      const categoryImage = files.categoryImage?.[0];

      let imageUrl: string | null = null;
      let imageCloudinaryPublicId: string | null = null;

      if (categoryImage) {
        const uploaded = await uploadImageToCloudinary(
          categoryImage.buffer,
          "digital-xpress/categories",
        );

        imageUrl = uploaded.secure_url;
        imageCloudinaryPublicId = uploaded.public_id;
        uploadedImagePublicId = uploaded.public_id;
      }

      const category = await prisma.productCategory.create({
        data: {
          name,
          slug,
          description: optionalString(req.body.description),
          imageUrl,
          imageCloudinaryPublicId,
          iconSvg: optionalSvg(req.body.iconSvg),
          sortOrder: intFromBody(req.body.sortOrder, 0),
          isPublished: booleanFromBody(req.body.isPublished, true),
          seoTitle: optionalString(req.body.seoTitle),
          seoDescription: optionalString(req.body.seoDescription),
          seoKeywords: parseStringArray(req.body.seoKeywords),
        } as Prisma.ProductCategoryUncheckedCreateInput,
        include: {
          _count: { select: { products: true } },
          subCategories: {
            include: {
              _count: { select: { products: true } },
            },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          },
        },
      });

      return res.status(201).json({
        success: true,
        message: "Category created successfully",
        category: serializeCategory(category),
      });
    } catch (error: any) {
      if (uploadedImagePublicId) {
        await deleteFromCloudinary(uploadedImagePublicId, "image");
      }

      if (error?.code === "P2002") {
        return res.status(409).json({
          success: false,
          message: "Category slug already exists",
        });
      }

      return sendError(res, error, "Failed to create category");
    }
  },
);

router.patch(
  "/:id",
  authenticate,
  requireAdminOrModerator,
  categoryUpload,
  async (req: AuthRequest, res) => {
    let newUploadedImagePublicId: string | null = null;

    try {
      const categoryId = getStringParam(req.params.id);

      if (!categoryId) {
        return res
          .status(400)
          .json({ success: false, message: "Category ID is required" });
      }

      const existingCategory = await prisma.productCategory.findUnique({
        where: { id: categoryId },
      });

      if (!existingCategory) {
        return res
          .status(404)
          .json({ success: false, message: "Category not found" });
      }

      const files = getFilesFromRequest(req);
      const name = requiredString(req.body.name, "Category name");
      const slug = await createUniqueCategorySlug(
        optionalString(req.body.slug) || name,
        existingCategory.id,
      );

      let imageUrl = existingCategory.imageUrl;
      let imageCloudinaryPublicId = existingCategory.imageCloudinaryPublicId;

      if (
        booleanFromBody(req.body.removeImage, false) &&
        imageCloudinaryPublicId
      ) {
        await deleteFromCloudinary(imageCloudinaryPublicId, "image");
        imageUrl = null;
        imageCloudinaryPublicId = null;
      }

      const categoryImage = files.categoryImage?.[0];

      if (categoryImage) {
        const uploaded = await uploadImageToCloudinary(
          categoryImage.buffer,
          "digital-xpress/categories",
        );

        newUploadedImagePublicId = uploaded.public_id;

        if (imageCloudinaryPublicId) {
          await deleteFromCloudinary(imageCloudinaryPublicId, "image");
        }

        imageUrl = uploaded.secure_url;
        imageCloudinaryPublicId = uploaded.public_id;
      }

      const category = await prisma.productCategory.update({
        where: { id: existingCategory.id },
        data: {
          name,
          slug,
          description: optionalString(req.body.description),
          imageUrl,
          imageCloudinaryPublicId,
          iconSvg: optionalSvg(req.body.iconSvg),
          sortOrder: intFromBody(req.body.sortOrder, 0),
          isPublished: booleanFromBody(req.body.isPublished, true),
          seoTitle: optionalString(req.body.seoTitle),
          seoDescription: optionalString(req.body.seoDescription),
          seoKeywords: parseStringArray(req.body.seoKeywords),
        } as Prisma.ProductCategoryUncheckedUpdateInput,
        include: {
          _count: { select: { products: true } },
          subCategories: {
            include: {
              _count: { select: { products: true } },
            },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          },
        },
      });

      return res.json({
        success: true,
        message: "Category updated successfully",
        category: serializeCategory(category),
      });
    } catch (error: any) {
      if (newUploadedImagePublicId) {
        await deleteFromCloudinary(newUploadedImagePublicId, "image");
      }

      if (error?.code === "P2002") {
        return res.status(409).json({
          success: false,
          message: "Category slug already exists",
        });
      }

      return sendError(res, error, "Failed to update category");
    }
  },
);

router.delete(
  "/:id",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const categoryId = getStringParam(req.params.id);

      if (!categoryId) {
        return res
          .status(400)
          .json({ success: false, message: "Category ID is required" });
      }

      const category = await prisma.productCategory.findUnique({
        where: { id: categoryId },
        include: {
          _count: {
            select: {
              products: true,
            },
          },
          subCategories: true,
        },
      });

      if (!category) {
        return res
          .status(404)
          .json({ success: false, message: "Category not found" });
      }

      if (category._count.products > 0) {
        return res.status(409).json({
          success: false,
          message:
            "This category has products. Move or delete those products before deleting the category.",
        });
      }

      const cloudinaryIds = [
        category.imageCloudinaryPublicId,
        ...category.subCategories.map(
          (subCategory) => subCategory.imageCloudinaryPublicId,
        ),
      ].filter(Boolean) as string[];

      await prisma.productCategory.delete({
        where: { id: category.id },
      });

      await Promise.allSettled(
        cloudinaryIds.map((publicId) => deleteFromCloudinary(publicId, "image")),
      );

      return res.json({
        success: true,
        message: "Category deleted successfully",
      });
    } catch (error) {
      return sendError(res, error, "Failed to delete category");
    }
  },
);

router.post(
  "/:categoryId/sub-categories",
  authenticate,
  requireAdminOrModerator,
  categoryUpload,
  async (req: AuthRequest, res) => {
    let uploadedImagePublicId: string | null = null;

    try {
      const categoryId = getStringParam(req.params.categoryId);

      if (!categoryId) {
        return res
          .status(400)
          .json({ success: false, message: "Category ID is required" });
      }

      const category = await prisma.productCategory.findUnique({
        where: { id: categoryId },
      });

      if (!category) {
        return res
          .status(404)
          .json({ success: false, message: "Category not found" });
      }

      const files = getFilesFromRequest(req);
      const name = requiredString(req.body.name, "Sub-category name");
      const slug = await createUniqueSubCategorySlug(
        category.id,
        optionalString(req.body.slug) || name,
      );

      const subCategoryImage = files.subCategoryImage?.[0];

      let imageUrl: string | null = null;
      let imageCloudinaryPublicId: string | null = null;

      if (subCategoryImage) {
        const uploaded = await uploadImageToCloudinary(
          subCategoryImage.buffer,
          "digital-xpress/sub-categories",
        );

        imageUrl = uploaded.secure_url;
        imageCloudinaryPublicId = uploaded.public_id;
        uploadedImagePublicId = uploaded.public_id;
      }

      const subCategory = await prisma.productSubCategory.create({
        data: {
          name,
          slug,
          categoryId: category.id,
          description: optionalString(req.body.description),
          imageUrl,
          imageCloudinaryPublicId,
          iconSvg: optionalSvg(req.body.iconSvg),
          sortOrder: intFromBody(req.body.sortOrder, 0),
          isPublished: booleanFromBody(req.body.isPublished, true),
          seoTitle: optionalString(req.body.seoTitle),
          seoDescription: optionalString(req.body.seoDescription),
          seoKeywords: parseStringArray(req.body.seoKeywords),
        } as Prisma.ProductSubCategoryUncheckedCreateInput,
        include: {
          _count: {
            select: {
              products: true,
            },
          },
        },
      });

      return res.status(201).json({
        success: true,
        message: "Sub-category created successfully",
        subCategory: {
          ...subCategory,
          productCount: subCategory._count.products,
        },
      });
    } catch (error: any) {
      if (uploadedImagePublicId) {
        await deleteFromCloudinary(uploadedImagePublicId, "image");
      }

      if (error?.code === "P2002") {
        return res.status(409).json({
          success: false,
          message: "Sub-category slug already exists under this category",
        });
      }

      return sendError(res, error, "Failed to create sub-category");
    }
  },
);

router.patch(
  "/sub-categories/:id",
  authenticate,
  requireAdminOrModerator,
  categoryUpload,
  async (req: AuthRequest, res) => {
    let newUploadedImagePublicId: string | null = null;

    try {
      const subCategoryId = getStringParam(req.params.id);

      if (!subCategoryId) {
        return res
          .status(400)
          .json({ success: false, message: "Sub-category ID is required" });
      }

      const existingSubCategory = await prisma.productSubCategory.findUnique({
        where: { id: subCategoryId },
      });

      if (!existingSubCategory) {
        return res
          .status(404)
          .json({ success: false, message: "Sub-category not found" });
      }

      const files = getFilesFromRequest(req);
      const name = requiredString(req.body.name, "Sub-category name");
      const slug = await createUniqueSubCategorySlug(
        existingSubCategory.categoryId,
        optionalString(req.body.slug) || name,
        existingSubCategory.id,
      );

      let imageUrl = existingSubCategory.imageUrl;
      let imageCloudinaryPublicId =
        existingSubCategory.imageCloudinaryPublicId;

      if (
        booleanFromBody(req.body.removeImage, false) &&
        imageCloudinaryPublicId
      ) {
        await deleteFromCloudinary(imageCloudinaryPublicId, "image");
        imageUrl = null;
        imageCloudinaryPublicId = null;
      }

      const subCategoryImage = files.subCategoryImage?.[0];

      if (subCategoryImage) {
        const uploaded = await uploadImageToCloudinary(
          subCategoryImage.buffer,
          "digital-xpress/sub-categories",
        );

        newUploadedImagePublicId = uploaded.public_id;

        if (imageCloudinaryPublicId) {
          await deleteFromCloudinary(imageCloudinaryPublicId, "image");
        }

        imageUrl = uploaded.secure_url;
        imageCloudinaryPublicId = uploaded.public_id;
      }

      const subCategory = await prisma.productSubCategory.update({
        where: { id: existingSubCategory.id },
        data: {
          name,
          slug,
          description: optionalString(req.body.description),
          imageUrl,
          imageCloudinaryPublicId,
          iconSvg: optionalSvg(req.body.iconSvg),
          sortOrder: intFromBody(req.body.sortOrder, 0),
          isPublished: booleanFromBody(req.body.isPublished, true),
          seoTitle: optionalString(req.body.seoTitle),
          seoDescription: optionalString(req.body.seoDescription),
          seoKeywords: parseStringArray(req.body.seoKeywords),
        } as Prisma.ProductSubCategoryUncheckedUpdateInput,
        include: {
          _count: {
            select: {
              products: true,
            },
          },
        },
      });

      return res.json({
        success: true,
        message: "Sub-category updated successfully",
        subCategory: {
          ...subCategory,
          productCount: subCategory._count.products,
        },
      });
    } catch (error: any) {
      if (newUploadedImagePublicId) {
        await deleteFromCloudinary(newUploadedImagePublicId, "image");
      }

      if (error?.code === "P2002") {
        return res.status(409).json({
          success: false,
          message: "Sub-category slug already exists under this category",
        });
      }

      return sendError(res, error, "Failed to update sub-category");
    }
  },
);

router.delete(
  "/sub-categories/:id",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const subCategoryId = getStringParam(req.params.id);

      if (!subCategoryId) {
        return res
          .status(400)
          .json({ success: false, message: "Sub-category ID is required" });
      }

      const subCategory = await prisma.productSubCategory.findUnique({
        where: { id: subCategoryId },
        include: {
          _count: {
            select: {
              products: true,
            },
          },
        },
      });

      if (!subCategory) {
        return res
          .status(404)
          .json({ success: false, message: "Sub-category not found" });
      }

      await prisma.$transaction(async (tx) => {
        if (subCategory._count.products > 0) {
          await tx.product.updateMany({
            where: { subCategoryId: subCategory.id },
            data: { subCategoryId: null },
          });
        }

        await tx.productSubCategory.delete({
          where: { id: subCategory.id },
        });
      });

      if (subCategory.imageCloudinaryPublicId) {
        await deleteFromCloudinary(subCategory.imageCloudinaryPublicId, "image");
      }

      return res.json({
        success: true,
        message: "Sub-category deleted successfully",
      });
    } catch (error) {
      return sendError(res, error, "Failed to delete sub-category");
    }
  },
);

export default router;