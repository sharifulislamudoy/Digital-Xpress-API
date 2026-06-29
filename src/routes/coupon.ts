import { Router, type Response } from "express";
import { CouponScope, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  authenticate,
  requireAdminOrModerator,
  type AuthRequest,
} from "../middleware/auth";
import {
  decimalToNumber,
  money,
  normalizeCouponCode,
  normalizeCouponScope,
  serializeCoupon,
  validateCouponForCheckout,
} from "../lib/coupon";

const router = Router();

function sendError(res: Response, error: unknown, fallback = "Server error") {
  console.error(error);

  const message = error instanceof Error ? error.message : fallback;
  const status = message.toLowerCase().includes("not found") ? 404 : 400;

  return res.status(status).json({ success: false, message });
}

function getStringParam(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function requiredString(value: unknown, fieldName: string, maxLength?: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }

  const clean = value.trim();

  if (maxLength && clean.length > maxLength) {
    throw new Error(`${fieldName} must be within ${maxLength} characters`);
  }

  return clean;
}

function optionalString(value: unknown, maxLength?: number) {
  if (typeof value !== "string") return null;

  const clean = value.trim();
  if (!clean) return null;

  return maxLength ? clean.slice(0, maxLength) : clean;
}

function numberFromBody(value: unknown, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalPositiveNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(money(parsed), 0);
}

function optionalInt(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function booleanFromBody(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const clean = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(clean)) return true;
    if (["false", "0", "no", "off"].includes(clean)) return false;
  }
  return fallback;
}

function nullableDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function normalizeCheckoutItems(itemsInput: unknown) {
  if (!Array.isArray(itemsInput)) return [];

  const quantityMap = new Map<string, number>();

  itemsInput.forEach((rawItem: any) => {
    const productId =
      typeof rawItem?.productId === "string"
        ? rawItem.productId.trim()
        : typeof rawItem?.id === "string"
          ? rawItem.id.trim()
          : "";

    if (!productId) return;

    const quantity = Math.max(Math.trunc(Number(rawItem?.quantity || 1)), 1);
    quantityMap.set(productId, (quantityMap.get(productId) || 0) + quantity);
  });

  return Array.from(quantityMap.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

function couponInclude() {
  return {
    category: {
      select: {
        id: true,
        name: true,
        slug: true,
      },
    },
    product: {
      select: {
        id: true,
        name: true,
        slug: true,
        sku: true,
      },
    },
    createdBy: {
      select: {
        id: true,
        name: true,
        email: true,
      },
    },
    _count: {
      select: {
        redemptions: true,
        orders: true,
      },
    },
  } satisfies Prisma.CouponInclude;
}

function buildCouponData(body: any, actor?: AuthRequest["user"]) {
  const scope = normalizeCouponScope(body.scope);
  const code = normalizeCouponCode(body.code);

  if (!code) {
    throw new Error("Coupon code is required");
  }

  if (code.length < 3) {
    throw new Error("Coupon code must be at least 3 characters");
  }

  if (code.length > 40) {
    throw new Error("Coupon code must be within 40 characters");
  }

  const discountPercentage = money(numberFromBody(body.discountPercentage, 0));

  if (discountPercentage <= 0 || discountPercentage > 100) {
    throw new Error("Discount percentage must be between 1 and 100");
  }

  const categoryId = optionalString(body.categoryId, 100);
  const productId = optionalString(body.productId, 100);

  if (scope === CouponScope.CATEGORY && !categoryId) {
    throw new Error("Category is required for category coupon");
  }

  if (scope === CouponScope.PRODUCT && !productId) {
    throw new Error("Product is required for product coupon");
  }

  const startsAt = nullableDate(body.startsAt);
  const endsAt = nullableDate(body.endsAt);

  if (startsAt && endsAt && startsAt >= endsAt) {
    throw new Error("End date must be after start date");
  }

  return {
    code,
    title: optionalString(body.title, 120),
    description: optionalString(body.description, 500),
    scope,
    discountPercentage,
    maxDiscountAmount: optionalPositiveNumber(body.maxDiscountAmount),
    minOrderAmount: optionalPositiveNumber(body.minOrderAmount) || 0,
    usageLimit: optionalInt(body.usageLimit),
    categoryId: scope === CouponScope.CATEGORY ? categoryId : null,
    productId: scope === CouponScope.PRODUCT ? productId : null,
    startsAt,
    endsAt,
    isActive: booleanFromBody(body.isActive, true),
    createdById: actor?.id || null,
    createdByEmail: actor?.email || null,
    createdByName: actor?.name || null,
  } satisfies Prisma.CouponUncheckedCreateInput;
}

router.post("/validate", authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const code = normalizeCouponCode(req.body.code);
    const items = normalizeCheckoutItems(req.body.items);

    const result = await validateCouponForCheckout(prisma, {
      code,
      userId: req.user.id,
      items,
    });

    return res.json({
      success: true,
      message: "Coupon applied successfully",
      coupon: serializeCoupon(result.coupon),
      calculation: {
        subtotal: result.subtotal,
        eligibleSubtotal: result.eligibleSubtotal,
        discountAmount: result.discountAmount,
        finalSubtotal: result.finalSubtotal,
        itemDiscounts: result.itemDiscounts,
      },
    });
  } catch (error) {
    return sendError(res, error, "Coupon validation failed");
  }
});

router.get(
  "/admin/meta",
  authenticate,
  requireAdminOrModerator,
  async (_req: AuthRequest, res) => {
    try {
      const [categories, products] = await Promise.all([
        prisma.productCategory.findMany({
          where: { isPublished: true },
          select: {
            id: true,
            name: true,
            slug: true,
          },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        }),
        prisma.product.findMany({
          where: { isPublished: true },
          select: {
            id: true,
            name: true,
            slug: true,
            sku: true,
            sellingPrice: true,
            categoryId: true,
          },
          orderBy: { createdAt: "desc" },
          take: 500,
        }),
      ]);

      return res.json({
        success: true,
        scopes: Object.values(CouponScope),
        categories,
        products: products.map((product) => ({
          ...product,
          sellingPrice: decimalToNumber(product.sellingPrice),
        })),
      });
    } catch (error) {
      return sendError(res, error, "Failed to load coupon meta");
    }
  },
);

router.get(
  "/admin",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const page = Math.max(Number(req.query.page || 1), 1);
      const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
      const skip = (page - 1) * limit;
      const search = getStringParam(req.query.search)?.trim() || "";
      const rawScope = getStringParam(req.query.scope);
      const status = getStringParam(req.query.status) || "all";

      const where: Prisma.CouponWhereInput = {
        ...(search
          ? {
              OR: [
                { code: { contains: search, mode: "insensitive" } },
                { title: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(rawScope && Object.values(CouponScope).includes(rawScope as CouponScope)
          ? { scope: rawScope as CouponScope }
          : {}),
        ...(status === "active"
          ? { isActive: true }
          : status === "inactive"
            ? { isActive: false }
            : {}),
      };

      const [coupons, total] = await Promise.all([
        prisma.coupon.findMany({
          where,
          include: couponInclude(),
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.coupon.count({ where }),
      ]);

      return res.json({
        success: true,
        coupons: coupons.map(serializeCoupon),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(Math.ceil(total / limit), 1),
        },
      });
    } catch (error) {
      return sendError(res, error, "Failed to load coupons");
    }
  },
);

router.get(
  "/admin/:id",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const id = getStringParam(req.params.id);

      if (!id) {
        return res.status(400).json({ success: false, message: "Coupon ID is required" });
      }

      const coupon = await prisma.coupon.findUnique({
        where: { id },
        include: couponInclude(),
      });

      if (!coupon) {
        return res.status(404).json({ success: false, message: "Coupon not found" });
      }

      return res.json({ success: true, coupon: serializeCoupon(coupon) });
    } catch (error) {
      return sendError(res, error, "Failed to load coupon");
    }
  },
);

router.post(
  "/admin",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const data = buildCouponData(req.body, req.user);

      const coupon = await prisma.coupon.create({
        data,
        include: couponInclude(),
      });

      return res.status(201).json({
        success: true,
        message: "Coupon created successfully",
        coupon: serializeCoupon(coupon),
      });
    } catch (error: any) {
      if (error?.code === "P2002") {
        return res.status(409).json({
          success: false,
          message: "This coupon code already exists",
        });
      }

      return sendError(res, error, "Failed to create coupon");
    }
  },
);

router.patch(
  "/admin/:id",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const id = getStringParam(req.params.id);

      if (!id) {
        return res.status(400).json({ success: false, message: "Coupon ID is required" });
      }

      const existing = await prisma.coupon.findUnique({
        where: { id },
        select: { id: true, usedCount: true },
      });

      if (!existing) {
        return res.status(404).json({ success: false, message: "Coupon not found" });
      }

      const nextData = buildCouponData(req.body, req.user);
      const nextUsageLimit = nextData.usageLimit;

      if (nextUsageLimit !== null && nextUsageLimit < existing.usedCount) {
        throw new Error(`Usage limit cannot be smaller than already used count (${existing.usedCount})`);
      }

      const coupon = await prisma.coupon.update({
        where: { id },
        data: {
          code: nextData.code,
          title: nextData.title,
          description: nextData.description,
          scope: nextData.scope,
          discountPercentage: nextData.discountPercentage,
          maxDiscountAmount: nextData.maxDiscountAmount,
          minOrderAmount: nextData.minOrderAmount,
          usageLimit: nextData.usageLimit,
          categoryId: nextData.categoryId,
          productId: nextData.productId,
          startsAt: nextData.startsAt,
          endsAt: nextData.endsAt,
          isActive: nextData.isActive,
        },
        include: couponInclude(),
      });

      return res.json({
        success: true,
        message: "Coupon updated successfully",
        coupon: serializeCoupon(coupon),
      });
    } catch (error: any) {
      if (error?.code === "P2002") {
        return res.status(409).json({
          success: false,
          message: "This coupon code already exists",
        });
      }

      return sendError(res, error, "Failed to update coupon");
    }
  },
);

router.patch(
  "/admin/:id/status",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const id = getStringParam(req.params.id);

      if (!id) {
        return res.status(400).json({ success: false, message: "Coupon ID is required" });
      }

      const coupon = await prisma.coupon.update({
        where: { id },
        data: {
          isActive: booleanFromBody(req.body.isActive, true),
        },
        include: couponInclude(),
      });

      return res.json({
        success: true,
        message: coupon.isActive ? "Coupon activated" : "Coupon deactivated",
        coupon: serializeCoupon(coupon),
      });
    } catch (error) {
      return sendError(res, error, "Failed to update coupon status");
    }
  },
);

router.delete(
  "/admin/:id",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const id = getStringParam(req.params.id);

      if (!id) {
        return res.status(400).json({ success: false, message: "Coupon ID is required" });
      }

      const coupon = await prisma.coupon.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              redemptions: true,
              orders: true,
            },
          },
        },
      });

      if (!coupon) {
        return res.status(404).json({ success: false, message: "Coupon not found" });
      }

      if (coupon._count.redemptions > 0 || coupon._count.orders > 0) {
        await prisma.coupon.update({
          where: { id },
          data: { isActive: false },
        });

        return res.json({
          success: true,
          message: "Coupon has order history, so it was deactivated instead of deleted",
        });
      }

      await prisma.coupon.delete({ where: { id } });

      return res.json({
        success: true,
        message: "Coupon deleted successfully",
      });
    } catch (error) {
      return sendError(res, error, "Failed to delete coupon");
    }
  },
);

export default router;
