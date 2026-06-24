// src/routes/product.routes.ts

import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { Prisma, ProductType, StockStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  authenticate,
  requireAdminOrModerator,
  AuthRequest,
} from "../middleware/auth";
import {
  uploadImageToCloudinary,
  uploadVideoToCloudinary,
  deleteFromCloudinary,
} from "../lib/cloudinary";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 40,
  },
  fileFilter: (_req, file, cb) => {
    const isImage = file.mimetype.startsWith("image/");
    const isVideo = file.mimetype.startsWith("video/");

    if (!isImage && !isVideo) {
      return cb(new Error("Only image and video files are allowed"));
    }

    cb(null, true);
  },
});

const productUpload = upload.any();

const reviewImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 10,
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed for review photos"));
    }

    cb(null, true);
  },
}).array("images", 10);

function handleReviewImageUpload(
  req: Request,
  res: Response,
  next: NextFunction
) {
  reviewImageUpload(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Each review photo must be 5MB or smaller"
          : error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE"
            ? "You can upload maximum 10 review photos"
            : error.message;

      return res.status(400).json({ success: false, message });
    }

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to upload review photos",
      });
    }

    next();
  });
}

type UploadedFilesMap = Record<string, Express.Multer.File[]>;

type SerializeOptions = {
  internal?: boolean;
  showStockQuantity?: boolean;
};

const productInclude = Prisma.validator<Prisma.ProductInclude>()({
  category: true,
  subCategory: true,
  brand: true,
  extraImages: {
    orderBy: { sortOrder: "asc" },
  },
  sizeChart: true,
  reviews: {
    where: { isPublished: true },
    orderBy: { createdAt: "desc" },
    include: {
      images: {
        orderBy: { sortOrder: "asc" },
      },
    },
  },
});

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

const stockStatusLabelMap: Record<StockStatus, string> = {
  IN_STOCK: "In stock",
  LIMITED_STOCK: "Limited stock",
  LOW_STOCK: "Low stock",
  OUT_OF_STOCK: "Out of stock",
  PRE_ORDER: "Pre-order",
  COMING_SOON: "Coming soon",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function optionalNumberFromBody(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;

  const parsed = numberFromBody(value, NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function requiredNumberFromBody(value: unknown, fieldName: string) {
  const parsed = optionalNumberFromBody(value);

  if (parsed === null) {
    throw new Error(`${fieldName} is required`);
  }

  if (parsed < 0) {
    throw new Error(`${fieldName} cannot be negative`);
  }

  return parsed;
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

function parseJson(value: unknown): any {
  if (value === undefined || value === null) return null;

  if (typeof value === "string") {
    if (!value.trim() || value.trim() === "null") return null;

    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  return value;
}

function parseIdArray(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);

    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item === "string");
    }
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeProductType(value: unknown): ProductType {
  const valid = Object.values(ProductType);

  if (typeof value === "string" && valid.includes(value as ProductType)) {
    return value as ProductType;
  }

  return ProductType.single;
}


function normalizeStockStatus(value: unknown): StockStatus {
  const valid = Object.values(StockStatus);

  if (typeof value === "string" && valid.includes(value as StockStatus)) {
    return value as StockStatus;
  }

  return StockStatus.IN_STOCK;
}

function clampRating(value: unknown) {
  const rating = numberFromBody(value, 0);
  return Math.min(Math.max(rating, 0), 5);
}

const purchasableStockStatuses: readonly StockStatus[] = [
  StockStatus.IN_STOCK,
  StockStatus.LIMITED_STOCK,
  StockStatus.LOW_STOCK,
  StockStatus.PRE_ORDER,
];

function canAddToCartByStatus(stockStatus: StockStatus) {
  return purchasableStockStatuses.includes(stockStatus);
}

function getFilesFromRequest(req: AuthRequest): UploadedFilesMap {
  const files = req.files as Express.Multer.File[] | undefined;

  if (!files) return {};

  return files.reduce<UploadedFilesMap>((acc, file) => {
    if (!acc[file.fieldname]) acc[file.fieldname] = [];
    acc[file.fieldname].push(file);
    return acc;
  }, {});
}

function getExtraImageFiles(files: UploadedFilesMap) {
  return Object.entries(files)
    .filter(([fieldName]) => {
      return (
        fieldName === "extraImages" ||
        fieldName === "extraImages[]" ||
        fieldName === "extraImage" ||
        fieldName === "extraImage[]" ||
        fieldName.startsWith("extraImages[") ||
        fieldName.startsWith("extraImage[")
      );
    })
    .flatMap(([, fileList]) => fileList)
    .filter((file) => file.mimetype.startsWith("image/"));
}

async function generateNextSku() {
  const products = await prisma.product.findMany({
    select: { sku: true },
  });

  let maxNumber = 0;

  for (const product of products) {
    if (!product.sku) continue;

    const numericSku = parseInt(product.sku, 10);

    if (!Number.isNaN(numericSku) && numericSku > maxNumber) {
      maxNumber = numericSku;
    }
  }

  return String(maxNumber + 1).padStart(4, "0");
}

async function createUniqueSlug(
  baseText: string,
  model: "product" | "category" | "subCategory" | "brand",
  categoryId?: string,
  ignoreId?: string
) {
  const baseSlug = slugify(baseText) || Date.now().toString();
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    let existing: any = null;

    if (model === "product") {
      existing = await prisma.product.findUnique({ where: { slug } });
    }

    if (model === "category") {
      existing = await prisma.productCategory.findUnique({ where: { slug } });
    }

    if (model === "brand") {
      existing = await prisma.brand.findUnique({ where: { slug } });
    }

    if (model === "subCategory") {
      if (!categoryId) throw new Error("categoryId required for sub-category slug");

      existing = await prisma.productSubCategory.findUnique({
        where: {
          categoryId_slug: {
            categoryId,
            slug,
          },
        },
      });
    }

    if (!existing || existing.id === ignoreId) return slug;

    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }
}

async function resolveCategoryId(body: any) {
  const categoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
  const categoryName = typeof body.categoryName === "string" ? body.categoryName.trim() : "";

  if (categoryId) {
    const category = await prisma.productCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) throw new Error("Category not found");

    return category.id;
  }

  if (!categoryName) throw new Error("Category is required");

  const baseSlug = slugify(categoryName);

  const existing = await prisma.productCategory.findUnique({
    where: { slug: baseSlug },
  });

  if (existing) return existing.id;

  const slug = await createUniqueSlug(categoryName, "category");

  const category = await prisma.productCategory.create({
    data: {
      name: categoryName,
      slug,
    },
  });

  return category.id;
}

async function resolveSubCategoryId(body: any, categoryId: string) {
  const subCategoryId =
    typeof body.subCategoryId === "string" ? body.subCategoryId.trim() : "";
  const subCategoryName =
    typeof body.subCategoryName === "string" ? body.subCategoryName.trim() : "";

  if (subCategoryId) {
    const subCategory = await prisma.productSubCategory.findUnique({
      where: { id: subCategoryId },
    });

    if (!subCategory) throw new Error("Sub-category not found");

    return subCategory.id;
  }

  if (!subCategoryName) return null;

  const baseSlug = slugify(subCategoryName);

  const existing = await prisma.productSubCategory.findUnique({
    where: {
      categoryId_slug: {
        categoryId,
        slug: baseSlug,
      },
    },
  });

  if (existing) return existing.id;

  const slug = await createUniqueSlug(subCategoryName, "subCategory", categoryId);

  const subCategory = await prisma.productSubCategory.create({
    data: {
      name: subCategoryName,
      slug,
      categoryId,
    },
  });

  return subCategory.id;
}

async function resolveBrandId(body: any) {
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  const brandName = typeof body.brandName === "string" ? body.brandName.trim() : "";

  if (brandId) {
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
    });

    if (!brand) throw new Error("Brand not found");

    return brand.id;
  }

  if (!brandName) throw new Error("Brand is required");

  const baseSlug = slugify(brandName);

  const existing = await prisma.brand.findUnique({
    where: { slug: baseSlug },
  });

  if (existing) return existing.id;

  const slug = await createUniqueSlug(brandName, "brand");

  const brand = await prisma.brand.create({
    data: {
      name: brandName,
      slug,
    },
  });

  return brand.id;
}

function serializeReview(review: {
  id: string;
  productId: string;
  userId: string | null;
  userName: string | null;
  userEmail: string;
  rating: number;
  comment: string;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  images?: {
    id: string;
    reviewId: string;
    imageUrl: string;
    cloudinaryPublicId: string;
    altText: string | null;
    sortOrder: number;
    createdAt: Date;
  }[];
}) {
  return {
    id: review.id,
    productId: review.productId,
    userId: review.userId,
    userName: review.userName,
    userEmail: review.userEmail,
    rating: review.rating,
    comment: review.comment,
    isPublished: review.isPublished,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    images: (review.images || []).map((image) => ({
      id: image.id,
      reviewId: image.reviewId,
      imageUrl: image.imageUrl,
      cloudinaryPublicId: image.cloudinaryPublicId,
      altText: image.altText,
      sortOrder: image.sortOrder,
      createdAt: image.createdAt,
    })),
  };
}

function requiredReviewRating(value: unknown) {
  const rating = Math.trunc(numberFromBody(value, 0));

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }

  return rating;
}

function sanitizeReviewComment(value: unknown) {
  const comment = requiredString(value, "Review comment");

  if (comment.length < 3) {
    throw new Error("Review comment must be at least 3 characters");
  }

  if (comment.length > 1000) {
    throw new Error("Review comment cannot be longer than 1000 characters");
  }

  return comment;
}

async function findPublishedProductBySlugOrId(slugOrId: string) {
  return prisma.product.findFirst({
    where: {
      isPublished: true,
      OR: [{ slug: slugOrId }, { id: slugOrId }],
    },
    include: productInclude,
  });
}

function serializeSizeChart(sizeChart: ProductWithRelations["sizeChart"] | null) {
  if (!sizeChart) return null;

  return {
    id: sizeChart.id,
    productId: sizeChart.productId,
    name: sizeChart.name,
    title: sizeChart.title,
    description: sizeChart.description,
    unit: sizeChart.unit,
    chartData: sizeChart.chartData,
    imageUrl: sizeChart.imageUrl,
    cloudinaryPublicId: sizeChart.cloudinaryPublicId,
    note: sizeChart.note,
    isActive: sizeChart.isActive,
    sortOrder: sizeChart.sortOrder,
    createdAt: sizeChart.createdAt,
    updatedAt: sizeChart.updatedAt,
  };
}

function serializeProduct(product: ProductWithRelations, options: SerializeOptions = {}) {
  const stockStatus = normalizeStockStatus(product.stockStatus);
  const sellingPrice = Number(product.sellingPrice || 0);
  const mrp = Number(product.mrp || 0);

  const serialized: any = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    productType: product.productType,

    sku: product.sku,
    productCode: product.productCode,
    barcode: product.barcode,
    modelName: product.modelName,

    shortDescription: product.shortDescription,
    description: product.description,

    keyFeatures: product.keyFeatures || [],
    highlights: product.highlights || [],
    specifications: product.specifications,
    tags: product.tags || [],
    searchKeywords: product.searchKeywords || [],

    mrp,
    sellingPrice,
    price: sellingPrice,

    stockStatus,
    stockStatusLabel: stockStatusLabelMap[stockStatus],
    inStock: product.inStock,
    canAddToCart: canAddToCartByStatus(stockStatus),

    isPublished: product.isPublished,
    isFeatured: product.isFeatured,
    isNewArrival: product.isNewArrival,
    isBestSeller: product.isBestSeller,
    isTrending: product.isTrending,
    isRecommended: product.isRecommended,
    isFlashSale: product.isFlashSale,

    mainImageUrl: product.mainImageUrl,
    mainImageAlt: product.mainImageAlt,
    hoverImageUrl: product.hoverImageUrl,
    hoverImageAlt: product.hoverImageAlt,
    videoUrl: product.videoUrl,

    image: product.mainImageUrl,
    hoverImage: product.hoverImageUrl,

    categoryId: product.categoryId,
    category: product.category,
    subCategoryId: product.subCategoryId,
    subCategory: product.subCategory,
    brandId: product.brandId,
    brand: product.brand,

    extraImages: product.extraImages || [],
    sizeChart: serializeSizeChart(product.sizeChart),

    warrantyDuration: product.warrantyDuration,
    warrantyDetails: product.warrantyDetails,
    returnPolicy: product.returnPolicy,
    replacementPolicy: product.replacementPolicy,
    refundPolicy: product.refundPolicy,

    deliveryInfo: product.deliveryInfo,
    deliveryCharge: product.deliveryCharge === null ? null : Number(product.deliveryCharge),
    insideDhakaDeliveryCharge:
      product.insideDhakaDeliveryCharge === null
        ? null
        : Number(product.insideDhakaDeliveryCharge),
    outsideDhakaDeliveryCharge:
      product.outsideDhakaDeliveryCharge === null
        ? null
        : Number(product.outsideDhakaDeliveryCharge),
    deliveryTime: product.deliveryTime,
    cashOnDelivery: product.cashOnDelivery,
    freeDelivery: product.freeDelivery,
    freeDeliveryMinAmount:
      product.freeDeliveryMinAmount === null ? null : Number(product.freeDeliveryMinAmount),

    packageIncludes: product.packageIncludes || [],
    packageWeight: product.packageWeight,
    packageDimensions: product.packageDimensions,

    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    seoKeywords: product.seoKeywords || [],
    focusKeyword: product.focusKeyword,
    canonicalUrl: product.canonicalUrl,
    ogTitle: product.ogTitle,
    ogDescription: product.ogDescription,
    ogImage: product.ogImage,
    metaRobots: product.metaRobots,
    schemaJson: product.schemaJson,

    viewCount: product.viewCount,
    wishlistCount: product.wishlistCount,
    cartCount: product.cartCount,
    orderCount: product.orderCount,
    averageRating: Number(product.averageRating || 0),
    totalReviews: product.totalReviews,
    reviews: (product.reviews || []).map((review) => serializeReview(review)),

    publishedAt: product.publishedAt,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };

  if (options.showStockQuantity) {
    serialized.stock = product.stock;
    serialized.lowStockAlertQuantity = product.lowStockAlertQuantity;
    serialized.soldQuantity = product.soldQuantity;
    serialized.reservedQuantity = product.reservedQuantity;
  }

  if (options.internal) {
    serialized.costPrice = product.costPrice === null ? null : Number(product.costPrice);

    serialized.mainImagePublicId = product.mainImagePublicId;
    serialized.hoverImagePublicId = product.hoverImagePublicId;
    serialized.videoPublicId = product.videoPublicId;

    serialized.supplierName = product.supplierName;
    serialized.supplierPhone = product.supplierPhone;
    serialized.supplierEmail = product.supplierEmail;
    serialized.supplierAddress = product.supplierAddress;
    serialized.supplierInvoiceNumber = product.supplierInvoiceNumber;
    serialized.internalNote = product.internalNote;

    serialized.createdById = product.createdById;
    serialized.createdByName = product.createdByName;
    serialized.createdByEmail = product.createdByEmail;
    serialized.updatedById = product.updatedById;
    serialized.updatedByName = product.updatedByName;
    serialized.updatedByEmail = product.updatedByEmail;
  }

  return serialized;
}

function buildProductData(body: any, args: { categoryId: string; subCategoryId: string | null; brandId: string }) {
  const costPrice = optionalNumberFromBody(body.costPrice);
  const stockStatus = normalizeStockStatus(body.stockStatus);
  const isPublished = booleanFromBody(body.isPublished, true);

  return {
    productType: normalizeProductType(body.productType),

    sku: optionalString(body.sku),
    productCode: optionalString(body.productCode),
    barcode: optionalString(body.barcode),
    modelName: optionalString(body.modelName),

    shortDescription: optionalString(body.shortDescription),
    description: requiredString(body.description, "Description"),

    keyFeatures: parseStringArray(body.keyFeatures),
    highlights: parseStringArray(body.highlights),
    specifications: parseJson(body.specifications),
    tags: parseStringArray(body.tags),
    searchKeywords: parseStringArray(body.searchKeywords),

    mrp: requiredNumberFromBody(body.mrp, "MRP"),
    costPrice,
    sellingPrice: requiredNumberFromBody(body.sellingPrice, "Selling price"),

    stock: intFromBody(body.stock, 0),
    stockStatus,
    lowStockAlertQuantity: intFromBody(body.lowStockAlertQuantity, 5),
    soldQuantity: intFromBody(body.soldQuantity, 0),
    reservedQuantity: intFromBody(body.reservedQuantity, 0),

    inStock: booleanFromBody(body.inStock, canAddToCartByStatus(stockStatus)),
    isPublished,

    isFeatured: booleanFromBody(body.isFeatured, false),
    isNewArrival: booleanFromBody(body.isNewArrival, false),
    isBestSeller: booleanFromBody(body.isBestSeller, false),
    isTrending: booleanFromBody(body.isTrending, false),
    isRecommended: booleanFromBody(body.isRecommended, false),
    isFlashSale: booleanFromBody(body.isFlashSale, false),

    mainImageAlt: optionalString(body.mainImageAlt),
    hoverImageAlt: optionalString(body.hoverImageAlt),

    categoryId: args.categoryId,
    subCategoryId: args.subCategoryId,
    brandId: args.brandId,

    warrantyDuration: optionalString(body.warrantyDuration),
    warrantyDetails: optionalString(body.warrantyDetails),
    returnPolicy: optionalString(body.returnPolicy),
    replacementPolicy: optionalString(body.replacementPolicy),
    refundPolicy: optionalString(body.refundPolicy),

    deliveryInfo: optionalString(body.deliveryInfo),
    deliveryCharge: optionalNumberFromBody(body.deliveryCharge),
    insideDhakaDeliveryCharge: optionalNumberFromBody(body.insideDhakaDeliveryCharge),
    outsideDhakaDeliveryCharge: optionalNumberFromBody(body.outsideDhakaDeliveryCharge),
    deliveryTime: optionalString(body.deliveryTime),
    cashOnDelivery: booleanFromBody(body.cashOnDelivery, true),
    freeDelivery: booleanFromBody(body.freeDelivery, false),
    freeDeliveryMinAmount: optionalNumberFromBody(body.freeDeliveryMinAmount),

    packageIncludes: parseStringArray(body.packageIncludes),
    packageWeight: optionalString(body.packageWeight),
    packageDimensions: optionalString(body.packageDimensions),

    supplierName: optionalString(body.supplierName),
    supplierPhone: optionalString(body.supplierPhone),
    supplierEmail: optionalString(body.supplierEmail),
    supplierAddress: optionalString(body.supplierAddress),
    supplierInvoiceNumber: optionalString(body.supplierInvoiceNumber),
    internalNote: optionalString(body.internalNote),

    seoTitle: optionalString(body.seoTitle),
    seoDescription: optionalString(body.seoDescription),
    seoKeywords: parseStringArray(body.seoKeywords),
    focusKeyword: optionalString(body.focusKeyword),
    canonicalUrl: optionalString(body.canonicalUrl),
    ogTitle: optionalString(body.ogTitle),
    ogDescription: optionalString(body.ogDescription),
    ogImage: optionalString(body.ogImage),
    metaRobots: optionalString(body.metaRobots) || "index,follow",
    schemaJson: parseJson(body.schemaJson),

    viewCount: intFromBody(body.viewCount, 0),
    wishlistCount: intFromBody(body.wishlistCount, 0),
    cartCount: intFromBody(body.cartCount, 0),
    orderCount: intFromBody(body.orderCount, 0),
    averageRating: clampRating(body.averageRating),
    totalReviews: intFromBody(body.totalReviews, 0),

    publishedAt: isPublished
      ? optionalString(body.publishedAt)
        ? new Date(String(body.publishedAt))
        : new Date()
      : null,
  };
}

async function handleSizeChart(
  productId: string,
  body: any,
  files: UploadedFilesMap,
  existingSizeChart?: ProductWithRelations["sizeChart"] | null
) {
  const removeSizeChart = booleanFromBody(body.removeSizeChart, false);

  if (removeSizeChart) {
    if (existingSizeChart?.cloudinaryPublicId) {
      await deleteFromCloudinary(existingSizeChart.cloudinaryPublicId, "image");
    }

    await prisma.sizeChart.deleteMany({ where: { productId } });
    return;
  }

  const chartData = parseJson(body.sizeChartData);
  const hasSizeChartData =
    optionalString(body.sizeChartName) ||
    optionalString(body.sizeChartTitle) ||
    optionalString(body.sizeChartDescription) ||
    optionalString(body.sizeChartUnit) ||
    optionalString(body.sizeChartNote) ||
    chartData ||
    files.sizeChartImage?.[0];

  if (!hasSizeChartData) return;

  let imageUrl = existingSizeChart?.imageUrl || null;
  let cloudinaryPublicId = existingSizeChart?.cloudinaryPublicId || null;

  if (booleanFromBody(body.removeSizeChartImage, false) && cloudinaryPublicId) {
    await deleteFromCloudinary(cloudinaryPublicId, "image");
    imageUrl = null;
    cloudinaryPublicId = null;
  }

  const sizeChartImage = files.sizeChartImage?.[0];

  if (sizeChartImage) {
    const uploaded = await uploadImageToCloudinary(
      sizeChartImage.buffer,
      "digital-xpress/products/size-charts"
    );

    if (cloudinaryPublicId) {
      await deleteFromCloudinary(cloudinaryPublicId, "image");
    }

    imageUrl = uploaded.secure_url;
    cloudinaryPublicId = uploaded.public_id;
  }

  await prisma.sizeChart.upsert({
    where: { productId },
    update: {
      name: optionalString(body.sizeChartName) || existingSizeChart?.name || "Size Chart",
      title: optionalString(body.sizeChartTitle),
      description: optionalString(body.sizeChartDescription),
      unit: optionalString(body.sizeChartUnit) || "inch",
      chartData: chartData || existingSizeChart?.chartData || {},
      imageUrl,
      cloudinaryPublicId,
      note: optionalString(body.sizeChartNote),
      isActive: booleanFromBody(body.sizeChartIsActive, true),
      sortOrder: intFromBody(body.sizeChartSortOrder, 0),
    },
    create: {
      productId,
      name: optionalString(body.sizeChartName) || "Size Chart",
      title: optionalString(body.sizeChartTitle),
      description: optionalString(body.sizeChartDescription),
      unit: optionalString(body.sizeChartUnit) || "inch",
      chartData: chartData || {},
      imageUrl,
      cloudinaryPublicId,
      note: optionalString(body.sizeChartNote),
      isActive: booleanFromBody(body.sizeChartIsActive, true),
      sortOrder: intFromBody(body.sizeChartSortOrder, 0),
    },
  });
}

function sendError(res: any, error: unknown, fallbackMessage: string) {
  console.error(error);

  if (error instanceof Error) {
    return res.status(400).json({ success: false, message: error.message });
  }

  return res.status(500).json({ success: false, message: fallbackMessage });
}

router.get("/meta", async (_req, res) => {
  try {
    const [categories, brands] = await Promise.all([
      prisma.productCategory.findMany({
        include: {
          subCategories: {
            orderBy: { name: "asc" },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.brand.findMany({
        orderBy: { name: "asc" },
      }),
    ]);

    return res.json({
      success: true,
      categories,
      brands,
      productTypes: Object.values(ProductType),
      stockStatuses: Object.values(StockStatus),
    });
  } catch (error) {
    return sendError(res, error, "Failed to load product meta data");
  }
});

router.get("/admin", authenticate, requireAdminOrModerator, async (req: AuthRequest, res) => {
  try {
    const page = Math.max(numberFromBody(req.query.page, 1), 1);
    const limit = Math.min(Math.max(numberFromBody(req.query.limit, 20), 1), 100);
    const skip = (page - 1) * limit;

    const search = getStringParam(req.query.search);
    const stockStatus = getStringParam(req.query.stockStatus);
    const productType = getStringParam(req.query.productType);
    const categoryId = getStringParam(req.query.categoryId);
    const brandId = getStringParam(req.query.brandId);

    const where: Prisma.ProductWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
        { productCode: { contains: search, mode: "insensitive" } },
        { barcode: { contains: search, mode: "insensitive" } },
        { modelName: { contains: search, mode: "insensitive" } },
      ];
    }

    if (stockStatus && Object.values(StockStatus).includes(stockStatus as StockStatus)) {
      where.stockStatus = stockStatus as StockStatus;
    }

    if (productType && Object.values(ProductType).includes(productType as ProductType)) {
      where.productType = productType as ProductType;
    }

    if (categoryId) where.categoryId = categoryId;
    if (brandId) where.brandId = brandId;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    return res.json({
      success: true,
      products: products.map((product) =>
        serializeProduct(product, {
          internal: true,
          showStockQuantity: true,
        })
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return sendError(res, error, "Failed to fetch admin products");
  }
});

router.get("/admin/:id", authenticate, requireAdminOrModerator, async (req, res) => {
  try {
    const productId = getStringParam(req.params.id);

    if (!productId) {
      return res.status(400).json({ success: false, message: "Product ID is required" });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: productInclude,
    });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    return res.json({
      success: true,
      product: serializeProduct(product, {
        internal: true,
        showStockQuantity: true,
      }),
    });
  } catch (error) {
    return sendError(res, error, "Failed to fetch product");
  }
});

router.get("/", async (req, res) => {
  try {
    const page = Math.max(numberFromBody(req.query.page, 1), 1);
    const limit = Math.min(Math.max(numberFromBody(req.query.limit, 24), 1), 100);
    const skip = (page - 1) * limit;

    const search = getStringParam(req.query.search);
    const category = getStringParam(req.query.category);
    const subCategory = getStringParam(req.query.subCategory);
    const brand = getStringParam(req.query.brand);
    const productType = getStringParam(req.query.productType);
    const sort = getStringParam(req.query.sort) || "newest";

    const minPrice =
      req.query.minPrice !== undefined ? numberFromBody(req.query.minPrice) : undefined;
    const maxPrice =
      req.query.maxPrice !== undefined ? numberFromBody(req.query.maxPrice) : undefined;

    const where: Prisma.ProductWhereInput = {
      isPublished: true,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { modelName: { contains: search, mode: "insensitive" } },
        { productCode: { contains: search, mode: "insensitive" } },
        { barcode: { contains: search, mode: "insensitive" } },
        { shortDescription: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    if (category) where.category = { slug: category };
    if (subCategory) where.subCategory = { slug: subCategory };
    if (brand) where.brand = { slug: brand };

    if (productType && Object.values(ProductType).includes(productType as ProductType)) {
      where.productType = productType as ProductType;
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.sellingPrice = {
        ...(minPrice !== undefined ? { gte: minPrice } : {}),
        ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
      };
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      sort === "price-low"
        ? { sellingPrice: "asc" }
        : sort === "price-high"
        ? { sellingPrice: "desc" }
        : sort === "popular"
        ? { orderCount: "desc" }
        : sort === "rating"
        ? { averageRating: "desc" }
        : { createdAt: "desc" };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    return res.json({
      success: true,
      products: products.map((product) => serializeProduct(product)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return sendError(res, error, "Failed to fetch products");
  }
});

router.post(
  "/",
  authenticate,
  requireAdminOrModerator,
  productUpload,
  async (req: AuthRequest, res) => {
    try {
      const files = getFilesFromRequest(req);
      const mainImage = files.mainImage?.[0];

      if (!mainImage) {
        return res.status(400).json({ success: false, message: "Main image is required" });
      }

      const name = requiredString(req.body.name, "Product name");
      const categoryId = await resolveCategoryId(req.body);
      const subCategoryId = await resolveSubCategoryId(req.body, categoryId);
      const brandId = await resolveBrandId(req.body);

      const customSlug = optionalString(req.body.slug);
      const slug = await createUniqueSlug(customSlug || name, "product");
      const sku = optionalString(req.body.sku) || (await generateNextSku());

      const [mainUploaded, hoverUploaded, videoUploaded] = await Promise.all([
        uploadImageToCloudinary(mainImage.buffer, "digital-xpress/products/main"),
        files.hoverImage?.[0]
          ? uploadImageToCloudinary(files.hoverImage[0].buffer, "digital-xpress/products/hover")
          : Promise.resolve(null),
        files.video?.[0]
          ? uploadVideoToCloudinary(files.video[0].buffer, "digital-xpress/products/videos")
          : Promise.resolve(null),
      ]);

      const baseData = buildProductData(req.body, {
        categoryId,
        subCategoryId,
        brandId,
      });

      const product = await prisma.product.create({
        data: {
          ...(baseData as Prisma.ProductUncheckedCreateInput),
          name,
          slug,
          sku,
          mainImageUrl: mainUploaded.secure_url,
          mainImagePublicId: mainUploaded.public_id,
          hoverImageUrl: hoverUploaded?.secure_url || null,
          hoverImagePublicId: hoverUploaded?.public_id || null,
          videoUrl: videoUploaded?.secure_url || null,
          videoPublicId: videoUploaded?.public_id || null,
          createdById: req.user?.id || null,
          createdByEmail: req.user?.email || null,
          createdByName: null,
          updatedById: req.user?.id || null,
          updatedByEmail: req.user?.email || null,
          updatedByName: null,
        },
        include: productInclude,
      });

      const extraImages = getExtraImageFiles(files);

      if (extraImages.length > 0) {
        const uploadedImages = await Promise.all(
          extraImages.map((file) =>
            uploadImageToCloudinary(file.buffer, "digital-xpress/products/extra")
          )
        );

        await prisma.productImage.createMany({
          data: uploadedImages.map((image, index) => ({
            productId: product.id,
            imageUrl: image.secure_url,
            cloudinaryPublicId: image.public_id,
            altText: optionalString(req.body.extraImagesAlt) || name,
            sortOrder: index,
          })),
        });
      }

      await handleSizeChart(product.id, req.body, files);

      const createdProduct = await prisma.product.findUnique({
        where: { id: product.id },
        include: productInclude,
      });

      if (!createdProduct) {
        return res.status(500).json({ success: false, message: "Product created but failed to reload" });
      }

      return res.status(201).json({
        success: true,
        message: "Product created successfully",
        product: serializeProduct(createdProduct, {
          internal: true,
          showStockQuantity: true,
        }),
      });
    } catch (error: any) {
      if (error?.code === "P2002") {
        return res.status(409).json({
          success: false,
          message: `Duplicate value found for ${error.meta?.target || "unique field"}`,
        });
      }

      return sendError(res, error, "Failed to create product");
    }
  }
);

router.patch(
  "/:id",
  authenticate,
  requireAdminOrModerator,
  productUpload,
  async (req: AuthRequest, res) => {
    try {
      const productId = getStringParam(req.params.id);

      if (!productId) {
        return res.status(400).json({ success: false, message: "Product ID is required" });
      }

      const existingProduct = await prisma.product.findUnique({
        where: { id: productId },
        include: productInclude,
      });

      if (!existingProduct) {
        return res.status(404).json({ success: false, message: "Product not found" });
      }

      const files = getFilesFromRequest(req);
      const name = requiredString(req.body.name, "Product name");
      const categoryId = await resolveCategoryId(req.body);
      const subCategoryId = await resolveSubCategoryId(req.body, categoryId);
      const brandId = await resolveBrandId(req.body);

      const customSlug = optionalString(req.body.slug);
      const slug = await createUniqueSlug(
        customSlug || name,
        "product",
        undefined,
        existingProduct.id
      );

      let mainImageUrl = existingProduct.mainImageUrl;
      let mainImagePublicId = existingProduct.mainImagePublicId;
      let hoverImageUrl = existingProduct.hoverImageUrl;
      let hoverImagePublicId = existingProduct.hoverImagePublicId;
      let videoUrl = existingProduct.videoUrl;
      let videoPublicId = existingProduct.videoPublicId;

      const mainImage = files.mainImage?.[0];
      const hoverImage = files.hoverImage?.[0];
      const video = files.video?.[0];

      if (mainImage) {
        const uploaded = await uploadImageToCloudinary(
          mainImage.buffer,
          "digital-xpress/products/main"
        );

        if (mainImagePublicId) {
          await deleteFromCloudinary(mainImagePublicId, "image");
        }

        mainImageUrl = uploaded.secure_url;
        mainImagePublicId = uploaded.public_id;
      }

      if (booleanFromBody(req.body.removeHoverImage, false) && hoverImagePublicId) {
        await deleteFromCloudinary(hoverImagePublicId, "image");
        hoverImageUrl = null;
        hoverImagePublicId = null;
      }

      if (hoverImage) {
        const uploaded = await uploadImageToCloudinary(
          hoverImage.buffer,
          "digital-xpress/products/hover"
        );

        if (hoverImagePublicId) {
          await deleteFromCloudinary(hoverImagePublicId, "image");
        }

        hoverImageUrl = uploaded.secure_url;
        hoverImagePublicId = uploaded.public_id;
      }

      if (booleanFromBody(req.body.removeVideo, false) && videoPublicId) {
        await deleteFromCloudinary(videoPublicId, "video");
        videoUrl = null;
        videoPublicId = null;
      }

      if (video) {
        const uploaded = await uploadVideoToCloudinary(
          video.buffer,
          "digital-xpress/products/videos"
        );

        if (videoPublicId) {
          await deleteFromCloudinary(videoPublicId, "video");
        }

        videoUrl = uploaded.secure_url;
        videoPublicId = uploaded.public_id;
      }

      const removeExtraImageIds = parseIdArray(req.body.removeExtraImageIds);

      if (removeExtraImageIds.length > 0) {
        const imagesToRemove = await prisma.productImage.findMany({
          where: {
            productId: existingProduct.id,
            id: { in: removeExtraImageIds },
          },
        });

        await Promise.all(
          imagesToRemove.map((image) =>
            deleteFromCloudinary(image.cloudinaryPublicId, "image")
          )
        );

        await prisma.productImage.deleteMany({
          where: {
            productId: existingProduct.id,
            id: { in: removeExtraImageIds },
          },
        });
      }

      const extraImages = getExtraImageFiles(files);

      if (extraImages.length > 0) {
        const existingExtraCount = await prisma.productImage.count({
          where: { productId: existingProduct.id },
        });

        const uploadedImages = await Promise.all(
          extraImages.map((file) =>
            uploadImageToCloudinary(file.buffer, "digital-xpress/products/extra")
          )
        );

        await prisma.productImage.createMany({
          data: uploadedImages.map((image, index) => ({
            productId: existingProduct.id,
            imageUrl: image.secure_url,
            cloudinaryPublicId: image.public_id,
            altText: optionalString(req.body.extraImagesAlt) || name,
            sortOrder: existingExtraCount + index,
          })),
        });
      }

      const baseData = buildProductData(req.body, {
        categoryId,
        subCategoryId,
        brandId,
      });

      await prisma.product.update({
        where: { id: existingProduct.id },
        data: {
          ...(baseData as Prisma.ProductUncheckedUpdateInput),
          name,
          slug,
          sku: optionalString(req.body.sku) || existingProduct.sku,
          mainImageUrl,
          mainImagePublicId,
          hoverImageUrl,
          hoverImagePublicId,
          videoUrl,
          videoPublicId,
          updatedById: req.user?.id || null,
          updatedByEmail: req.user?.email || null,
          updatedByName: null,
        },
      });

      await handleSizeChart(existingProduct.id, req.body, files, existingProduct.sizeChart);

      const updatedProduct = await prisma.product.findUnique({
        where: { id: existingProduct.id },
        include: productInclude,
      });

      if (!updatedProduct) {
        return res.status(500).json({ success: false, message: "Product updated but failed to reload" });
      }

      return res.json({
        success: true,
        message: "Product updated successfully",
        product: serializeProduct(updatedProduct, {
          internal: true,
          showStockQuantity: true,
        }),
      });
    } catch (error: any) {
      if (error?.code === "P2002") {
        return res.status(409).json({
          success: false,
          message: `Duplicate value found for ${error.meta?.target || "unique field"}`,
        });
      }

      return sendError(res, error, "Failed to update product");
    }
  }
);

router.patch(
  "/:id/stock-status",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const stockStatus = normalizeStockStatus(req.body.stockStatus);

      const productId = getStringParam(req.params.id);

      if (!productId) {
        return res.status(400).json({ success: false, message: "Product ID is required" });
      }

      const product = await prisma.product.update({
        where: { id: productId },
        data: {
          stockStatus,
          inStock: canAddToCartByStatus(stockStatus),
          updatedById: req.user?.id || null,
          updatedByEmail: req.user?.email || null,
        },
        include: productInclude,
      });

      return res.json({
        success: true,
        message: "Stock status updated",
        product: serializeProduct(product, {
          internal: true,
          showStockQuantity: true,
        }),
      });
    } catch (error) {
      return sendError(res, error, "Failed to update stock status");
    }
  }
);

router.patch(
  "/:id/flags",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const productId = getStringParam(req.params.id);

      if (!productId) {
        return res.status(400).json({ success: false, message: "Product ID is required" });
      }

      const product = await prisma.product.update({
        where: { id: productId },
        data: {
          isPublished: booleanFromBody(req.body.isPublished, true),
          inStock: booleanFromBody(req.body.inStock, true),
          isFeatured: booleanFromBody(req.body.isFeatured, false),
          isNewArrival: booleanFromBody(req.body.isNewArrival, false),
          isBestSeller: booleanFromBody(req.body.isBestSeller, false),
          isTrending: booleanFromBody(req.body.isTrending, false),
          isRecommended: booleanFromBody(req.body.isRecommended, false),
          isFlashSale: booleanFromBody(req.body.isFlashSale, false),
          updatedById: req.user?.id || null,
          updatedByEmail: req.user?.email || null,
        },
        include: productInclude,
      });

      return res.json({
        success: true,
        message: "Product flags updated",
        product: serializeProduct(product, {
          internal: true,
          showStockQuantity: true,
        }),
      });
    } catch (error) {
      return sendError(res, error, "Failed to update product flags");
    }
  }
);

function getReviewImageFiles(req: AuthRequest) {
  const files = req.files as Express.Multer.File[] | undefined;
  return Array.isArray(files) ? files : [];
}

async function uploadReviewImages(files: Express.Multer.File[]) {
  return Promise.all(
    files.map((file) =>
      uploadImageToCloudinary(file.buffer, "digital-xpress/products/reviews")
    )
  );
}

async function cleanupUploadedReviewImages(
  images: { public_id: string }[]
) {
  await Promise.allSettled(
    images.map((image) => deleteFromCloudinary(image.public_id, "image"))
  );
}

router.get("/:slugOrId/reviews", async (req, res) => {
  try {
    const slugOrId = getStringParam(req.params.slugOrId);

    if (!slugOrId) {
      return res.status(400).json({ success: false, message: "Product slug or ID is required" });
    }

    const product = await findPublishedProductBySlugOrId(slugOrId);

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const reviews = await prisma.productReview.findMany({
      where: {
        productId: product.id,
        isPublished: true,
      },
      orderBy: { createdAt: "desc" },
      include: {
        images: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    return res.json({
      success: true,
      productId: product.id,
      averageRating: Number(product.averageRating || 0),
      totalReviews: product.totalReviews,
      reviews: reviews.map((review) => serializeReview(review)),
    });
  } catch (error) {
    return sendError(res, error, "Failed to fetch reviews");
  }
});

router.post(
  "/:slugOrId/reviews",
  authenticate,
  handleReviewImageUpload,
  async (req: AuthRequest, res) => {
    const uploadedReviewImages: { secure_url: string; public_id: string }[] = [];

    try {
      const slugOrId = getStringParam(req.params.slugOrId);

      if (!slugOrId) {
        return res.status(400).json({
          success: false,
          message: "Product slug or ID is required",
        });
      }

      const authEmail = req.user?.email;

      if (!authEmail) {
        return res.status(401).json({
          success: false,
          message: "Login required to submit a review",
        });
      }

      const product = await findPublishedProductBySlugOrId(slugOrId);

      if (!product) {
        return res.status(404).json({ success: false, message: "Product not found" });
      }

      const rating = requiredReviewRating(req.body.rating);
      const comment = sanitizeReviewComment(req.body.comment);
      const reviewImageFiles = getReviewImageFiles(req);

      if (reviewImageFiles.length > 10) {
        return res.status(400).json({
          success: false,
          message: "You can upload maximum 10 review photos",
        });
      }

      const authUserId = req.user?.id || null;

      const dbUser = await prisma.user.findFirst({
        where: {
          OR: [
            ...(authUserId ? [{ id: authUserId }] : []),
            { email: authEmail },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });

      const userId = dbUser?.id || authUserId;
      const userName = dbUser?.name || optionalString(req.body.userName) || "Customer";
      const userEmail = dbUser?.email || authEmail;

      uploadedReviewImages.push(...(await uploadReviewImages(reviewImageFiles)));

      const result = await prisma.$transaction(async (tx) => {
        const existingReview = await tx.productReview.findUnique({
          where: {
            productId_userEmail: {
              productId: product.id,
              userEmail,
            },
          },
          include: {
            images: true,
          },
        });

        const review = await tx.productReview.upsert({
          where: {
            productId_userEmail: {
              productId: product.id,
              userEmail,
            },
          },
          update: {
            rating,
            comment,
            userId,
            userName,
            isPublished: true,
          },
          create: {
            productId: product.id,
            userId,
            userName,
            userEmail,
            rating,
            comment,
            isPublished: true,
          },
        });

        if (uploadedReviewImages.length > 0) {
          await tx.productReviewImage.deleteMany({
            where: { reviewId: review.id },
          });

          await tx.productReviewImage.createMany({
            data: uploadedReviewImages.map((image, index) => ({
              reviewId: review.id,
              imageUrl: image.secure_url,
              cloudinaryPublicId: image.public_id,
              altText: `${product.name} review photo ${index + 1}`,
              sortOrder: index,
            })),
          });
        }

        const aggregate = await tx.productReview.aggregate({
          where: {
            productId: product.id,
            isPublished: true,
          },
          _avg: { rating: true },
          _count: { _all: true },
        });

        const averageRating = Number((aggregate._avg.rating || 0).toFixed(2));
        const totalReviews = aggregate._count._all;

        await tx.product.update({
          where: { id: product.id },
          data: {
            averageRating: new Prisma.Decimal(averageRating),
            totalReviews,
          },
        });

        const savedReview = await tx.productReview.findUniqueOrThrow({
          where: { id: review.id },
          include: {
            images: {
              orderBy: { sortOrder: "asc" },
            },
          },
        });

        const reviews = await tx.productReview.findMany({
          where: {
            productId: product.id,
            isPublished: true,
          },
          orderBy: { createdAt: "desc" },
          include: {
            images: {
              orderBy: { sortOrder: "asc" },
            },
          },
        });

        return {
          review: savedReview,
          reviews,
          averageRating,
          totalReviews,
          oldImagesToDelete:
            uploadedReviewImages.length > 0 ? existingReview?.images || [] : [],
        };
      });

      if (result.oldImagesToDelete.length > 0) {
        await Promise.allSettled(
          result.oldImagesToDelete.map((image) =>
            deleteFromCloudinary(image.cloudinaryPublicId, "image")
          )
        );
      }

      return res.status(201).json({
        success: true,
        message: "Review saved successfully",
        review: serializeReview(result.review),
        reviews: result.reviews.map((review) => serializeReview(review)),
        averageRating: result.averageRating,
        totalReviews: result.totalReviews,
      });
    } catch (error) {
      if (uploadedReviewImages.length > 0) {
        await cleanupUploadedReviewImages(uploadedReviewImages);
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return res.status(409).json({
          success: false,
          message: "You have already reviewed this product",
        });
      }

      return sendError(res, error, "Failed to save review");
    }
  }
);

router.get("/:slugOrId", async (req, res) => {
  try {
    const slugOrId = getStringParam(req.params.slugOrId);

    if (!slugOrId) {
      return res.status(400).json({ success: false, message: "Product slug or ID is required" });
    }

    const product = await findPublishedProductBySlugOrId(slugOrId);

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    await prisma.product.update({
      where: { id: product.id },
      data: {
        viewCount: { increment: 1 },
      },
    });

    return res.json({
      success: true,
      product: serializeProduct({ ...product, viewCount: product.viewCount + 1 }, { showStockQuantity: true }),
    });
  } catch (error) {
    return sendError(res, error, "Failed to fetch product details");
  }
});

export default router;
