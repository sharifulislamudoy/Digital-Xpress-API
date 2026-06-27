import { Router, type Response } from "express";
import multer from "multer";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  authenticate,
  requireAdminOrModerator,
  type AuthRequest,
} from "../middleware/auth";
import { deleteFromCloudinary, uploadImageToCloudinary } from "../lib/cloudinary";

const router = Router();

const MAX_REVIEW_IMAGES = 10;
const REVIEW_IMAGE_MAX_SIZE = 5 * 1024 * 1024;

const reviewUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: REVIEW_IMAGE_MAX_SIZE,
    files: MAX_REVIEW_IMAGES,
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }

    cb(null, true);
  },
});

type ReviewWithRelations = Prisma.ProductReviewGetPayload<{
  include: {
    images: true;
    product: {
      select: {
        id: true;
        name: true;
        slug: true;
        mainImageUrl: true;
        sellingPrice: true;
      };
    };
  };
}>;

type ProductReviewOnly = Prisma.ProductReviewGetPayload<{
  include: {
    images: true;
  };
}>;

function sendError(res: Response, error: unknown, fallback = "Server error") {
  console.error(error);
  const message = error instanceof Error ? error.message : fallback;
  return res.status(500).json({ success: false, message });
}

function getStringParam(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function optionalString(value: unknown, maxLength?: number): string | null {
  if (typeof value !== "string") return null;

  const clean = value.trim();

  if (!clean) return null;
  if (maxLength && clean.length > maxLength) return clean.slice(0, maxLength);

  return clean;
}

function requiredUserEmail(req: AuthRequest) {
  const email = req.user?.email?.trim().toLowerCase();

  if (!email) {
    throw new Error("Your account email is required to submit a review");
  }

  return email;
}

function getUserName(req: AuthRequest, fallback = "Customer") {
  const name = (req.user as any)?.name || req.user?.email?.split("@")[0];
  return typeof name === "string" && name.trim() ? name.trim() : fallback;
}

function normalizeRating(value: unknown) {
  const rating = Math.trunc(Number(value));

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }

  return rating;
}

function normalizeComment(value: unknown) {
  if (typeof value !== "string" || value.trim().length < 3) {
    throw new Error("Review comment must be at least 3 characters");
  }

  return value.trim().slice(0, 1000);
}

function decimalToNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (value && typeof value === "object" && "toNumber" in value) {
    const parsed = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const fallback = Number(value || 0);
  return Number.isFinite(fallback) ? fallback : 0;
}

function getUploadedFiles(req: AuthRequest) {
  return Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : [];
}

function parseRemoveImageIds(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

async function uploadReviewImages(files: Express.Multer.File[]) {
  const uploadedImages: Array<{
    imageUrl: string;
    cloudinaryPublicId: string;
    altText: string | null;
    sortOrder: number;
  }> = [];

  for (const [index, file] of files.entries()) {
    const uploaded = await (uploadImageToCloudinary as any)(
      file.buffer,
      "digital-xpress/reviews",
    );

    const imageUrl =
      uploaded?.secure_url || uploaded?.url || uploaded?.imageUrl || "";
    const cloudinaryPublicId =
      uploaded?.public_id ||
      uploaded?.publicId ||
      uploaded?.cloudinaryPublicId ||
      uploaded?.id ||
      "";

    if (!imageUrl || !cloudinaryPublicId) {
      throw new Error("Review image upload failed");
    }

    uploadedImages.push({
      imageUrl,
      cloudinaryPublicId,
      altText: file.originalname || null,
      sortOrder: index,
    });
  }

  return uploadedImages;
}

async function safeDeleteCloudinary(publicId?: string | null) {
  if (!publicId) return;

  try {
    await (deleteFromCloudinary as any)(publicId);
  } catch (error) {
    console.error("Review image delete failed:", error);
  }
}

async function refreshProductReviewStats(productId: string) {
  const stats = await prisma.productReview.aggregate({
    where: {
      productId,
      isPublished: true,
    },
    _avg: {
      rating: true,
    },
    _count: {
      _all: true,
    },
  });

  const averageRating = Number((stats._avg.rating || 0).toFixed(2));
  const totalReviews = stats._count._all || 0;

  await prisma.product.update({
    where: { id: productId },
    data: {
      averageRating,
      totalReviews,
    },
  });

  return { averageRating, totalReviews };
}

function serializeReview(review: ReviewWithRelations | ProductReviewOnly) {
  const withProduct = review as ReviewWithRelations;

  return {
    ...review,
    product: withProduct.product
      ? {
          ...withProduct.product,
          sellingPrice: decimalToNumber(withProduct.product.sellingPrice),
        }
      : undefined,
    images: [...(review.images || [])].sort(
      (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0),
    ),
  };
}

async function getPublicProductReviews(productId: string) {
  return prisma.productReview.findMany({
    where: {
      productId,
      isPublished: true,
    },
    include: {
      images: {
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

async function verifyDeliveredPurchase(req: AuthRequest, productId: string) {
  if (!req.user?.id) {
    throw new Error("Unauthorized");
  }

  const orderItem = await prisma.orderItem.findFirst({
    where: {
      productId,
      order: {
        userId: req.user.id,
        status: "delivered",
      },
    },
    select: {
      id: true,
      orderId: true,
    },
  });

  if (!orderItem) {
    throw new Error("You can review this product after it is delivered");
  }

  return orderItem;
}

router.get(
  "/delivered-review-prompt",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const userEmail = requiredUserEmail(req);

      if (!req.user?.id) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const latestDeliveredOrder = await prisma.order.findFirst({
        where: {
          userId: req.user.id,
          status: "delivered",
          items: {
            some: {
              productId: {
                not: null,
              },
            },
          },
        },
        include: {
          items: {
            where: {
              productId: {
                not: null,
              },
            },
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  mainImageUrl: true,
                  sellingPrice: true,
                },
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          },
        },
        orderBy: [{ deliveredAt: "desc" }, { updatedAt: "desc" }],
      });

      if (!latestDeliveredOrder) {
        return res.json({ success: true, prompt: null });
      }

      const productIds = latestDeliveredOrder.items
        .map((item) => item.productId)
        .filter((id): id is string => Boolean(id));

      const existingReviews = await prisma.productReview.findMany({
        where: {
          userEmail,
          productId: {
            in: productIds,
          },
        },
        select: {
          productId: true,
        },
      });

      const reviewedProductIds = new Set(
        existingReviews.map((review) => review.productId),
      );

      const reviewableItems = latestDeliveredOrder.items
        .filter((item) => item.product && item.productId)
        .filter((item) => !reviewedProductIds.has(item.productId as string))
        .map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          productSlug: item.productSlug,
          productImage: item.productImage || item.product?.mainImageUrl || null,
          sku: item.sku,
          quantity: item.quantity,
          unitPrice: decimalToNumber(item.unitPrice),
          totalPrice: decimalToNumber(item.totalPrice),
          product: item.product
            ? {
                ...item.product,
                sellingPrice: decimalToNumber(item.product.sellingPrice),
              }
            : null,
        }));

      if (reviewableItems.length === 0) {
        return res.json({ success: true, prompt: null });
      }

      return res.json({
        success: true,
        prompt: {
          order: {
            id: latestDeliveredOrder.id,
            invoiceNo: latestDeliveredOrder.invoiceNo,
            deliveredAt: latestDeliveredOrder.deliveredAt,
            updatedAt: latestDeliveredOrder.updatedAt,
          },
          items: reviewableItems,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load review prompt";
      return res.status(400).json({ success: false, message });
    }
  },
);

router.get("/product/:productId", async (req, res) => {
  try {
    const productId = getStringParam(req.params.productId);

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product id is required",
      });
    }

    const reviews = await getPublicProductReviews(productId);
    const stats = await refreshProductReviewStats(productId);

    return res.json({
      success: true,
      reviews: reviews.map(serializeReview),
      ...stats,
    });
  } catch (error) {
    return sendError(res, error, "Failed to load product reviews");
  }
});

router.post(
  "/customer/:productId",
  authenticate,
  reviewUpload.array("images", MAX_REVIEW_IMAGES),
  async (req: AuthRequest, res) => {
    try {
      const productId = getStringParam(req.params.productId);

      if (!productId) {
        return res.status(400).json({
          success: false,
          message: "Product id is required",
        });
      }

      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, name: true },
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      await verifyDeliveredPurchase(req, productId);

      const userEmail = requiredUserEmail(req);
      const rating = normalizeRating(req.body.rating);
      const comment = normalizeComment(req.body.comment);
      const userName = optionalString(req.body.userName, 100) || getUserName(req);
      const files = getUploadedFiles(req);
      const uploadedImages = await uploadReviewImages(files);

      const existingReview = await prisma.productReview.findUnique({
        where: {
          productId_userEmail: {
            productId,
            userEmail,
          },
        },
        include: {
          images: true,
        },
      });

      const review = await prisma.$transaction(async (tx) => {
        const saved = existingReview
          ? await tx.productReview.update({
              where: { id: existingReview.id },
              data: {
                rating,
                comment,
                userId: req.user?.id || null,
                userName,
                isPublished: true,
                ...(uploadedImages.length > 0
                  ? {
                      images: {
                        create: uploadedImages,
                      },
                    }
                  : {}),
              },
              include: {
                images: {
                  orderBy: { sortOrder: "asc" },
                },
              },
            })
          : await tx.productReview.create({
              data: {
                productId,
                userId: req.user?.id || null,
                userName,
                userEmail,
                rating,
                comment,
                isPublished: true,
                ...(uploadedImages.length > 0
                  ? {
                      images: {
                        create: uploadedImages,
                      },
                    }
                  : {}),
              },
              include: {
                images: {
                  orderBy: { sortOrder: "asc" },
                },
              },
            });

        return saved;
      });

      const stats = await refreshProductReviewStats(productId);
      const reviews = await getPublicProductReviews(productId);

      return res.status(existingReview ? 200 : 201).json({
        success: true,
        message: existingReview
          ? "Review updated successfully"
          : "Review submitted successfully",
        review: serializeReview(review),
        reviews: reviews.map(serializeReview),
        ...stats,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save review";
      return res.status(400).json({ success: false, message });
    }
  },
);

router.get("/my", authenticate, async (req: AuthRequest, res) => {
  try {
    const userEmail = requiredUserEmail(req);

    const reviews = await prisma.productReview.findMany({
      where: { userEmail },
      include: {
        images: {
          orderBy: { sortOrder: "asc" },
        },
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            mainImageUrl: true,
            sellingPrice: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      success: true,
      reviews: reviews.map(serializeReview),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load reviews";
    return res.status(400).json({ success: false, message });
  }
});

router.patch(
  "/my/:reviewId",
  authenticate,
  reviewUpload.array("images", MAX_REVIEW_IMAGES),
  async (req: AuthRequest, res) => {
    try {
      const reviewId = getStringParam(req.params.reviewId);

      if (!reviewId) {
        return res.status(400).json({
          success: false,
          message: "Review id is required",
        });
      }

      const userEmail = requiredUserEmail(req);
      const existingReview = await prisma.productReview.findFirst({
        where: {
          id: reviewId,
          userEmail,
        },
        include: {
          images: true,
        },
      });

      if (!existingReview) {
        return res.status(404).json({
          success: false,
          message: "Review not found",
        });
      }

      const rating =
        req.body.rating !== undefined
          ? normalizeRating(req.body.rating)
          : existingReview.rating;
      const comment =
        req.body.comment !== undefined
          ? normalizeComment(req.body.comment)
          : existingReview.comment;
      const userName = optionalString(req.body.userName, 100) || getUserName(req);
      const removeImageIds = parseRemoveImageIds(req.body.removeImageIds);
      const files = getUploadedFiles(req);
      const uploadedImages = await uploadReviewImages(files);

      const imagesToRemove = existingReview.images.filter((image) =>
        removeImageIds.includes(image.id),
      );

      const updatedReview = await prisma.$transaction(async (tx) => {
        if (imagesToRemove.length > 0) {
          await tx.productReviewImage.deleteMany({
            where: {
              id: {
                in: imagesToRemove.map((image) => image.id),
              },
              reviewId: existingReview.id,
            },
          });
        }

        return tx.productReview.update({
          where: { id: existingReview.id },
          data: {
            rating,
            comment,
            userName,
            isPublished: true,
            ...(uploadedImages.length > 0
              ? {
                  images: {
                    create: uploadedImages,
                  },
                }
              : {}),
          },
          include: {
            images: {
              orderBy: { sortOrder: "asc" },
            },
          },
        });
      });

      await Promise.all(
        imagesToRemove.map((image) => safeDeleteCloudinary(image.cloudinaryPublicId)),
      );

      const stats = await refreshProductReviewStats(existingReview.productId);
      const reviews = await getPublicProductReviews(existingReview.productId);

      return res.json({
        success: true,
        message: "Review updated successfully",
        review: serializeReview(updatedReview),
        reviews: reviews.map(serializeReview),
        ...stats,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update review";
      return res.status(400).json({ success: false, message });
    }
  },
);

router.delete(
  "/my/:reviewId",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const reviewId = getStringParam(req.params.reviewId);

      if (!reviewId) {
        return res.status(400).json({
          success: false,
          message: "Review id is required",
        });
      }

      const userEmail = requiredUserEmail(req);
      const review = await prisma.productReview.findFirst({
        where: {
          id: reviewId,
          userEmail,
        },
        include: {
          images: true,
        },
      });

      if (!review) {
        return res.status(404).json({
          success: false,
          message: "Review not found",
        });
      }

      await prisma.productReview.delete({
        where: { id: review.id },
      });

      await Promise.all(
        review.images.map((image) => safeDeleteCloudinary(image.cloudinaryPublicId)),
      );

      const stats = await refreshProductReviewStats(review.productId);
      const reviews = await getPublicProductReviews(review.productId);

      return res.json({
        success: true,
        message: "Review deleted successfully",
        reviews: reviews.map(serializeReview),
        ...stats,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete review";
      return res.status(400).json({ success: false, message });
    }
  },
);

router.get(
  "/admin/recent",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit || 6), 1), 20);

      const reviews = await prisma.productReview.findMany({
        where: { isPublished: true },
        include: {
          images: {
            orderBy: { sortOrder: "asc" },
          },
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              mainImageUrl: true,
              sellingPrice: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      return res.json({
        success: true,
        reviews: reviews.map(serializeReview),
      });
    } catch (error) {
      return sendError(res, error, "Failed to load recent reviews");
    }
  },
);

router.get(
  "/admin",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const search =
        typeof req.query.search === "string" ? req.query.search.trim() : "";
      const productId =
        typeof req.query.productId === "string" ? req.query.productId.trim() : "";
      const page = Math.max(Number(req.query.page || 1), 1);
      const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 200);
      const skip = (page - 1) * limit;

      const where: Prisma.ProductReviewWhereInput = {
        ...(productId ? { productId } : {}),
        ...(search
          ? {
              OR: [
                { userName: { contains: search, mode: "insensitive" } },
                { userEmail: { contains: search, mode: "insensitive" } },
                { comment: { contains: search, mode: "insensitive" } },
                {
                  product: {
                    name: { contains: search, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      };

      const [reviews, total] = await Promise.all([
        prisma.productReview.findMany({
          where,
          include: {
            images: {
              orderBy: { sortOrder: "asc" },
            },
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                mainImageUrl: true,
                sellingPrice: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.productReview.count({ where }),
      ]);

      return res.json({
        success: true,
        reviews: reviews.map(serializeReview),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(Math.ceil(total / limit), 1),
        },
      });
    } catch (error) {
      return sendError(res, error, "Failed to load reviews");
    }
  },
);

router.delete(
  "/admin/:reviewId",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const reviewId = getStringParam(req.params.reviewId);

      if (!reviewId) {
        return res.status(400).json({
          success: false,
          message: "Review id is required",
        });
      }

      const review = await prisma.productReview.findUnique({
        where: { id: reviewId },
        include: { images: true },
      });

      if (!review) {
        return res.status(404).json({
          success: false,
          message: "Review not found",
        });
      }

      await prisma.productReview.delete({
        where: { id: review.id },
      });

      await Promise.all(
        review.images.map((image) => safeDeleteCloudinary(image.cloudinaryPublicId)),
      );

      const stats = await refreshProductReviewStats(review.productId);

      return res.json({
        success: true,
        message: "Review deleted successfully",
        ...stats,
      });
    } catch (error) {
      return sendError(res, error, "Failed to delete review");
    }
  },
);

export default router;
