import { CouponScope, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type CouponCheckoutItemInput = {
  productId: string;
  quantity: number;
};

type Tx = Prisma.TransactionClient | typeof prisma;

type ProductForCoupon = Prisma.ProductGetPayload<{
  select: {
    id: true;
    name: true;
    slug: true;
    sku: true;
    sellingPrice: true;
    categoryId: true;
    isPublished: true;
    inStock: true;
    stockStatus: true;
  };
}>;

const couponInclude = {
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

export type CouponWithRelations = Prisma.CouponGetPayload<{
  include: typeof couponInclude;
}>;

export type CouponValidationResult = {
  coupon: CouponWithRelations;
  code: string;
  scope: CouponScope;
  discountPercentage: number;
  subtotal: number;
  eligibleSubtotal: number;
  discountAmount: number;
  finalSubtotal: number;
  itemDiscounts: Array<{
    productId: string;
    quantity: number;
    originalLineTotal: number;
    lineDiscountAmount: number;
    finalLineTotal: number;
  }>;
  itemDiscountsByProductId: Record<string, number>;
};

export function money(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(2));
}

export function decimalToNumber(value: unknown): number {
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

export function normalizeCouponCode(value: unknown) {
  if (typeof value !== "string") return "";

  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9_-]/g, "");
}

export function normalizeCouponScope(value: unknown): CouponScope {
  if (typeof value !== "string") return CouponScope.ALL_PRODUCTS;

  const clean = value.trim().toUpperCase();

  if (clean === "ALL" || clean === "ALL_PRODUCTS") return CouponScope.ALL_PRODUCTS;
  if (clean === "CATEGORY" || clean === "SINGLE_CATEGORY") return CouponScope.CATEGORY;
  if (clean === "PRODUCT" || clean === "SINGLE_PRODUCT") return CouponScope.PRODUCT;

  return CouponScope.ALL_PRODUCTS;
}

export function serializeCoupon(coupon: CouponWithRelations) {
  const usageLimit = coupon.usageLimit ?? null;
  const usedCount = coupon.usedCount || 0;
  const remainingUses = usageLimit === null ? null : Math.max(usageLimit - usedCount, 0);
  const now = Date.now();
  const startsAtMs = coupon.startsAt ? coupon.startsAt.getTime() : null;
  const endsAtMs = coupon.endsAt ? coupon.endsAt.getTime() : null;
  const isExpired = endsAtMs !== null && endsAtMs < now;
  const isUpcoming = startsAtMs !== null && startsAtMs > now;
  const isUsageFinished = usageLimit !== null && usedCount >= usageLimit;

  return {
    id: coupon.id,
    code: coupon.code,
    title: coupon.title,
    description: coupon.description,
    scope: coupon.scope,
    discountPercentage: decimalToNumber(coupon.discountPercentage),
    maxDiscountAmount:
      coupon.maxDiscountAmount === null ? null : decimalToNumber(coupon.maxDiscountAmount),
    minOrderAmount: decimalToNumber(coupon.minOrderAmount),
    usageLimit,
    usedCount,
    remainingUses,
    categoryId: coupon.categoryId,
    category: coupon.category,
    productId: coupon.productId,
    product: coupon.product,
    startsAt: coupon.startsAt,
    endsAt: coupon.endsAt,
    isActive: coupon.isActive,
    isExpired,
    isUpcoming,
    isUsageFinished,
    canUseNow: coupon.isActive && !isExpired && !isUpcoming && !isUsageFinished,
    createdById: coupon.createdById,
    createdByName: coupon.createdByName || coupon.createdBy?.name || null,
    createdByEmail: coupon.createdByEmail || coupon.createdBy?.email || null,
    orderCount: coupon._count?.orders || 0,
    redemptionCount: coupon._count?.redemptions || 0,
    createdAt: coupon.createdAt,
    updatedAt: coupon.updatedAt,
  };
}

function normalizeItems(items: CouponCheckoutItemInput[]) {
  const map = new Map<string, number>();

  items.forEach((item) => {
    const productId = typeof item.productId === "string" ? item.productId.trim() : "";
    const quantity = Math.max(Math.trunc(Number(item.quantity || 1)), 1);

    if (!productId) return;

    map.set(productId, (map.get(productId) || 0) + quantity);
  });

  return Array.from(map.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

function isProductEligibleForCoupon(coupon: CouponWithRelations, product: ProductForCoupon) {
  if (coupon.scope === CouponScope.ALL_PRODUCTS) return true;
  if (coupon.scope === CouponScope.CATEGORY) return product.categoryId === coupon.categoryId;
  if (coupon.scope === CouponScope.PRODUCT) return product.id === coupon.productId;

  return false;
}

function distributeDiscount(input: {
  eligibleLines: Array<{
    productId: string;
    quantity: number;
    originalLineTotal: number;
  }>;
  discountAmount: number;
}) {
  const totalEligible = money(
    input.eligibleLines.reduce((sum, line) => sum + line.originalLineTotal, 0),
  );

  if (totalEligible <= 0 || input.discountAmount <= 0) {
    return input.eligibleLines.map((line) => ({
      ...line,
      lineDiscountAmount: 0,
      finalLineTotal: line.originalLineTotal,
    }));
  }

  let allocated = 0;

  return input.eligibleLines.map((line, index) => {
    const isLast = index === input.eligibleLines.length - 1;
    const lineDiscountAmount = isLast
      ? money(input.discountAmount - allocated)
      : money((line.originalLineTotal / totalEligible) * input.discountAmount);

    allocated = money(allocated + lineDiscountAmount);

    return {
      ...line,
      lineDiscountAmount,
      finalLineTotal: money(line.originalLineTotal - lineDiscountAmount),
    };
  });
}

export async function getCouponByCode(
  tx: Tx,
  code: string,
): Promise<CouponWithRelations | null> {
  return tx.coupon.findUnique({
    where: { code },
    include: couponInclude,
  });
}

export async function validateCouponForCheckout(
  tx: Tx,
  input: {
    code: string;
    userId: string;
    items: CouponCheckoutItemInput[];
  },
): Promise<CouponValidationResult> {
  const code = normalizeCouponCode(input.code);

  if (!code) {
    throw new Error("Coupon code is required");
  }

  const items = normalizeItems(input.items);

  if (items.length === 0) {
    throw new Error("Cart is empty");
  }

  const coupon = await getCouponByCode(tx, code);

  if (!coupon) {
    throw new Error("Invalid coupon code");
  }

  const now = new Date();

  if (!coupon.isActive) {
    throw new Error("This coupon is inactive");
  }

  if (coupon.startsAt && coupon.startsAt > now) {
    throw new Error("This coupon is not active yet");
  }

  if (coupon.endsAt && coupon.endsAt < now) {
    throw new Error("This coupon has expired");
  }

  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    throw new Error("This coupon usage limit is finished");
  }

  if (coupon.scope === CouponScope.CATEGORY && !coupon.categoryId) {
    throw new Error("Coupon category is missing");
  }

  if (coupon.scope === CouponScope.PRODUCT && !coupon.productId) {
    throw new Error("Coupon product is missing");
  }

  const alreadyUsed = await tx.couponRedemption.findUnique({
    where: {
      couponId_userId: {
        couponId: coupon.id,
        userId: input.userId,
      },
    },
    select: { id: true },
  });

  if (alreadyUsed) {
    throw new Error("You already used this coupon once");
  }

  const products = await tx.product.findMany({
    where: {
      id: {
        in: items.map((item) => item.productId),
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      sku: true,
      sellingPrice: true,
      categoryId: true,
      isPublished: true,
      inStock: true,
      stockStatus: true,
    },
  });

  if (products.length !== items.length) {
    throw new Error("Some products were not found");
  }

  const productMap = new Map(products.map((product) => [product.id, product]));

  const allLines = items.map((item) => {
    const product = productMap.get(item.productId);

    if (!product) {
      throw new Error("Product not found");
    }

    const unitPrice = decimalToNumber(product.sellingPrice);
    const originalLineTotal = money(unitPrice * item.quantity);

    return {
      product,
      productId: product.id,
      quantity: item.quantity,
      originalLineTotal,
    };
  });

  const subtotal = money(allLines.reduce((sum, line) => sum + line.originalLineTotal, 0));
  const minOrderAmount = decimalToNumber(coupon.minOrderAmount);

  if (minOrderAmount > 0 && subtotal < minOrderAmount) {
    throw new Error(`Minimum order amount for this coupon is ৳${minOrderAmount}`);
  }

  const eligibleLines = allLines
    .filter((line) => isProductEligibleForCoupon(coupon, line.product))
    .map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      originalLineTotal: line.originalLineTotal,
    }));

  const eligibleSubtotal = money(
    eligibleLines.reduce((sum, line) => sum + line.originalLineTotal, 0),
  );

  if (eligibleSubtotal <= 0) {
    if (coupon.scope === CouponScope.CATEGORY) {
      throw new Error("This coupon is not valid for cart category products");
    }

    if (coupon.scope === CouponScope.PRODUCT) {
      throw new Error("This coupon is not valid for selected products");
    }

    throw new Error("This coupon is not valid for this cart");
  }

  const discountPercentage = decimalToNumber(coupon.discountPercentage);

  if (discountPercentage <= 0 || discountPercentage > 100) {
    throw new Error("Coupon discount percentage is invalid");
  }

  const rawDiscount = money((eligibleSubtotal * discountPercentage) / 100);
  const maxDiscountAmount =
    coupon.maxDiscountAmount === null ? null : decimalToNumber(coupon.maxDiscountAmount);
  const discountAmount = money(
    maxDiscountAmount !== null && maxDiscountAmount > 0
      ? Math.min(rawDiscount, maxDiscountAmount)
      : rawDiscount,
  );

  if (discountAmount <= 0) {
    throw new Error("Coupon discount amount is zero");
  }

  const itemDiscounts = distributeDiscount({
    eligibleLines,
    discountAmount,
  });

  const itemDiscountsByProductId = itemDiscounts.reduce<Record<string, number>>(
    (acc, item) => {
      acc[item.productId] = item.lineDiscountAmount;
      return acc;
    },
    {},
  );

  return {
    coupon,
    code,
    scope: coupon.scope,
    discountPercentage,
    subtotal,
    eligibleSubtotal,
    discountAmount,
    finalSubtotal: money(subtotal - discountAmount),
    itemDiscounts,
    itemDiscountsByProductId,
  };
}

export async function consumeCouponForOrder(
  tx: Prisma.TransactionClient,
  input: {
    coupon: CouponWithRelations;
    userId: string;
    orderId: string;
    discountPercentage: number;
    discountAmount: number;
  },
) {
  if (input.coupon.usageLimit !== null) {
    const updated = await tx.coupon.updateMany({
      where: {
        id: input.coupon.id,
        usedCount: {
          lt: input.coupon.usageLimit,
        },
      },
      data: {
        usedCount: {
          increment: 1,
        },
      },
    });

    if (updated.count !== 1) {
      throw new Error("This coupon usage limit is finished");
    }
  } else {
    await tx.coupon.update({
      where: { id: input.coupon.id },
      data: {
        usedCount: {
          increment: 1,
        },
      },
    });
  }

  await tx.couponRedemption.create({
    data: {
      couponId: input.coupon.id,
      userId: input.userId,
      orderId: input.orderId,
      couponCode: input.coupon.code,
      discountPercentage: input.discountPercentage,
      discountAmount: input.discountAmount,
    },
  });
}
