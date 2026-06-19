import { Router } from "express";
import multer from "multer";
import { Prisma, ProfitType, StockStatus } from "@prisma/client";
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
    files: 25,
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

const productInclude = {
  category: true,
  subCategory: true,
  brand: true,
  extraImages: {
    orderBy: { sortOrder: "asc" as const },
  },
};

// ---- Local type to include name/email in user ----
type UserWithName = {
  id: string;
  email: string;
  role: string;
  name?: string | null;
};

// ---- Helper functions ----

function getStringParam(param: string | string[] | undefined) {
  if (typeof param === "string") return param;
  if (Array.isArray(param) && param.length > 0) return param[0];
  return undefined;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function createUniqueSlug(
  baseText: string,
  model: "product" | "category" | "subCategory" | "brand",
  categoryId?: string
) {
  const baseSlug = slugify(baseText) || Date.now().toString();
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    let existing: unknown = null;

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
        where: { categoryId_slug: { categoryId, slug } },
      });
    }

    if (!existing) return slug;
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }
}

function numberFromBody(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function booleanFromBody(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return fallback;
}

function calculateSellingPrice(
  costPrice: number,
  profitType: ProfitType,
  profitValue: number
) {
  if (profitType === "FIXED") return costPrice + profitValue;
  return costPrice + (costPrice * profitValue) / 100;
}

function getFilesFromRequest(req: AuthRequest) {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files) return {};
  const result: { [fieldname: string]: Express.Multer.File[] } = {};
  for (const file of files) {
    if (!result[file.fieldname]) result[file.fieldname] = [];
    result[file.fieldname].push(file);
  }
  return result;
}

function normalizeStockStatus(value: unknown): StockStatus {
  const validStatuses = Object.values(StockStatus);
  if (typeof value === "string" && validStatuses.includes(value as StockStatus)) {
    return value as StockStatus;
  }
  return StockStatus.IN_STOCK;
}

function canAddToCartByStatus(stockStatus: StockStatus) {
  const purchasable = new Set<StockStatus>([
    StockStatus.IN_STOCK,
    StockStatus.LIMITED_STOCK,
    StockStatus.LOW_STOCK,
    StockStatus.PRE_ORDER,
  ]);
  return purchasable.has(stockStatus);
}

function parseStringArray(raw: unknown): string[] {
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === "string");
    } catch {
      return raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function parseJSON(raw: unknown): any {
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

function getOptionalString(raw: unknown): string | undefined {
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  return undefined;
}

function getOptionalNumber(raw: unknown): number | undefined {
  const num = numberFromBody(raw);
  return num !== 0 ? num : undefined;
}

// ---- Stock visibility function ----
function canSeeStockQuantity(req: AuthRequest) {
  return req.user?.role === "admin";
}

// ---- Auto‑generate SKU ----
async function generateNextSku() {
  const products = await prisma.product.findMany({
    select: { sku: true },
    orderBy: { sku: "asc" },
  });
  let maxNumber = 0;
  for (const p of products) {
    if (p.sku) {
      const num = parseInt(p.sku, 10);
      if (!isNaN(num) && num > maxNumber) maxNumber = num;
    }
  }
  const next = maxNumber + 1;
  return next.toString().padStart(4, "0");
}

const stockStatusLabelMap: Record<StockStatus, string> = {
  IN_STOCK: "In stock",
  LIMITED_STOCK: "Limited stock",
  LOW_STOCK: "Low stock",
  OUT_OF_STOCK: "Out of stock",
  PRE_ORDER: "Pre-order",
  COMING_SOON: "Coming soon",
};

// ---- Serialize product for API response ----
function serializeProduct(
  product: any,
  options: { internal?: boolean; showStockQuantity?: boolean } = {}
) {
  const stockStatus = normalizeStockStatus(product.stockStatus);
  const sellingPrice = Number(product.sellingPrice);
  const mrp = product.mrp ? Number(product.mrp) : sellingPrice;
  const canAddToCart = canAddToCartByStatus(stockStatus);

  const serialized: any = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku || null,
    modelName: product.modelName,
    shortDescription: product.shortDescription,
    description: product.description,
    mrp,
    price: sellingPrice,
    sellingPrice,
    category: product.category,
    subCategory: product.subCategory,
    brand: product.brand,
    mainImageUrl: product.mainImageUrl,
    mainImageAlt: product.mainImageAlt,
    hoverImageUrl: product.hoverImageUrl,
    hoverImageAlt: product.hoverImageAlt,
    videoUrl: product.videoUrl,
    extraImages: product.extraImages || [],
    image: product.mainImageUrl,
    hoverImage: product.hoverImage,
    stockStatus,
    stockStatusLabel: stockStatusLabelMap[stockStatus],
    canAddToCart,
    inStock: canAddToCart,
    isPublished: product.isPublished,
    isFeatured: product.isFeatured,
    isNewArrival: product.isNewArrival,
    isBestSeller: product.isBestSeller,
    isTrending: product.isTrending,
    isRecommended: product.isRecommended,
    isFlashSale: product.isFlashSale,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    // Additional public fields
    keyFeatures: product.keyFeatures || [],
    highlights: product.highlights || [],
    specifications: product.specifications,
    tags: product.tags || [],
    warrantyDuration: product.warrantyDuration,
    warrantyDetails: product.warrantyDetails,
    returnPolicy: product.returnPolicy,
    replacementPolicy: product.replacementPolicy,
    refundPolicy: product.refundPolicy,
    deliveryInfo: product.deliveryInfo,
    deliveryCharge: product.deliveryCharge ? Number(product.deliveryCharge) : null,
    insideDhakaDeliveryCharge: product.insideDhakaDeliveryCharge ? Number(product.insideDhakaDeliveryCharge) : null,
    outsideDhakaDeliveryCharge: product.outsideDhakaDeliveryCharge ? Number(product.outsideDhakaDeliveryCharge) : null,
    deliveryTime: product.deliveryTime,
    cashOnDelivery: product.cashOnDelivery,
    freeDelivery: product.freeDelivery,
    freeDeliveryMinAmount: product.freeDeliveryMinAmount ? Number(product.freeDeliveryMinAmount) : null,
    packageIncludes: product.packageIncludes || [],
    packageWeight: product.packageWeight,
    packageDimensions: product.packageDimensions,
    productCode: product.productCode,
    barcode: product.barcode,
    averageRating: product.averageRating ? Number(product.averageRating) : 0,
    totalReviews: product.totalReviews || 0,
    // SEO fields
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
  };

  if (options.showStockQuantity) {
    serialized.stock = product.stock;
  }

  if (options.internal) {
    serialized.costPrice = Number(product.costPrice);
    serialized.profitType = product.profitType;
    serialized.profitValue = Number(product.profitValue);
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
    serialized.publishedAt = product.publishedAt;
    serialized.lowStockAlertQuantity = product.lowStockAlertQuantity;
    serialized.soldQuantity = product.soldQuantity;
    serialized.reservedQuantity = product.reservedQuantity;
    serialized.viewCount = product.viewCount;
    serialized.wishlistCount = product.wishlistCount;
    serialized.cartCount = product.cartCount;
    serialized.orderCount = product.orderCount;
  }

  return serialized;
}

// ---- Resolve category, sub‑category, brand ----
async function resolveCategoryId(body: any) {
  const categoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
  const categoryName = typeof body.categoryName === "string" ? body.categoryName.trim() : "";

  if (categoryId) {
    const category = await prisma.productCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new Error("Category not found");
    return category.id;
  }

  if (!categoryName) throw new Error("Category is required");

  const baseSlug = slugify(categoryName);
  const existing = await prisma.productCategory.findUnique({ where: { slug: baseSlug } });

  if (existing) return existing.id;

  const slug = await createUniqueSlug(categoryName, "category");
  const created = await prisma.productCategory.create({
    data: { name: categoryName, slug },
  });

  return created.id;
}

async function resolveSubCategoryId(body: any, categoryId: string) {
  const subCategoryId = typeof body.subCategoryId === "string" ? body.subCategoryId.trim() : "";
  const subCategoryName = typeof body.subCategoryName === "string" ? body.subCategoryName.trim() : "";

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
    where: { categoryId_slug: { categoryId, slug: baseSlug } },
  });

  if (existing) return existing.id;

  const slug = await createUniqueSlug(subCategoryName, "subCategory", categoryId);

  const created = await prisma.productSubCategory.create({
    data: {
      name: subCategoryName,
      slug,
      categoryId,
    },
  });

  return created.id;
}

async function resolveBrandId(body: any) {
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  const brandName = typeof body.brandName === "string" ? body.brandName.trim() : "";

  if (brandId) {
    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) throw new Error("Brand not found");
    return brand.id;
  }

  if (!brandName) throw new Error("Brand is required");

  const baseSlug = slugify(brandName);
  const existing = await prisma.brand.findUnique({ where: { slug: baseSlug } });

  if (existing) return existing.id;

  const slug = await createUniqueSlug(brandName, "brand");
  const created = await prisma.brand.create({
    data: { name: brandName, slug },
  });

  return created.id;
}

function parseRemovedExtraImageIds(raw: unknown) {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === "string");
  } catch {
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

// ---- Routes ----

// Public products (customer view)
router.get("/", async (req, res) => {
  try {
    const page = Math.max(numberFromBody(req.query.page, 1), 1);
    const limit = Math.min(Math.max(numberFromBody(req.query.limit, 24), 1), 100);
    const skip = (page - 1) * limit;

    const search = getStringParam(req.query.search as any);
    const category = getStringParam(req.query.category as any);
    const subCategory = getStringParam(req.query.subCategory as any);
    const brand = getStringParam(req.query.brand as any);
    const sort = getStringParam(req.query.sort as any) || "newest";

    const minPrice = req.query.minPrice ? numberFromBody(req.query.minPrice) : undefined;
    const maxPrice = req.query.maxPrice ? numberFromBody(req.query.maxPrice) : undefined;

    const where: Prisma.ProductWhereInput = { isPublished: true };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { modelName: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { shortDescription: { contains: search, mode: "insensitive" } },
      ];
    }

    if (category) where.category = { slug: category };
    if (subCategory) where.subCategory = { slug: subCategory };
    if (brand) where.brand = { slug: brand };

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
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed to load products",
    });
  }
});

// Meta data
router.get("/meta", async (_req, res) => {
  try {
    const [categories, brands] = await Promise.all([
      prisma.productCategory.findMany({
        orderBy: { name: "asc" },
        include: {
          subCategories: {
            orderBy: { name: "asc" },
          },
        },
      }),
      prisma.brand.findMany({
        orderBy: { name: "asc" },
      }),
    ]);

    return res.json({
      success: true,
      categories,
      brands,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed to load product meta",
    });
  }
});

// Admin product list (with all fields)
router.get("/admin", authenticate, requireAdminOrModerator, async (req: AuthRequest, res) => {
  try {
    const products = await prisma.product.findMany({
      include: productInclude,
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      success: true,
      products: products.map((product) =>
        serializeProduct(product, {
          internal: true,
          showStockQuantity: canSeeStockQuantity(req),
        })
      ),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed to load products",
    });
  }
});

// Admin get single product
router.get("/admin/:id", authenticate, requireAdminOrModerator, async (req: AuthRequest, res) => {
  const id = getStringParam(req.params.id);
  if (!id) {
    return res.status(400).json({
      success: false,
      message: "Invalid product ID",
    });
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.json({
      success: true,
      product: serializeProduct(product, {
        internal: true,
        showStockQuantity: canSeeStockQuantity(req),
      }),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed to load product",
    });
  }
});

// ---- Category, SubCategory, Brand creation endpoints ----
router.post("/categories", authenticate, requireAdminOrModerator, async (req: AuthRequest, res) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      return res.status(400).json({ success: false, message: "Category name is required" });
    }
    const baseSlug = slugify(name);
    const existing = await prisma.productCategory.findUnique({ where: { slug: baseSlug } });
    if (existing) {
      return res.status(200).json({ success: true, message: "Category already exists", category: existing });
    }
    const slug = await createUniqueSlug(name, "category");
    const category = await prisma.productCategory.create({ data: { name, slug } });
    return res.status(201).json({ success: true, message: "Category created", category });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to create category" });
  }
});

router.post("/sub-categories", authenticate, requireAdminOrModerator, async (req: AuthRequest, res) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const categoryId = typeof req.body.categoryId === "string" ? req.body.categoryId.trim() : "";
    if (!name) {
      return res.status(400).json({ success: false, message: "Sub-category name is required" });
    }
    if (!categoryId) {
      return res.status(400).json({ success: false, message: "Category is required" });
    }
    const baseSlug = slugify(name);
    const existing = await prisma.productSubCategory.findUnique({
      where: { categoryId_slug: { categoryId, slug: baseSlug } },
    });
    if (existing) {
      return res.status(200).json({ success: true, message: "Sub-category already exists", subCategory: existing });
    }
    const slug = await createUniqueSlug(name, "subCategory", categoryId);
    const subCategory = await prisma.productSubCategory.create({ data: { name, slug, categoryId } });
    return res.status(201).json({ success: true, message: "Sub-category created", subCategory });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to create sub-category" });
  }
});

router.post("/brands", authenticate, requireAdminOrModerator, async (req: AuthRequest, res) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      return res.status(400).json({ success: false, message: "Brand name is required" });
    }
    const baseSlug = slugify(name);
    const existing = await prisma.brand.findUnique({ where: { slug: baseSlug } });
    if (existing) {
      return res.status(200).json({ success: true, message: "Brand already exists", brand: existing });
    }
    const slug = await createUniqueSlug(name, "brand");
    const brand = await prisma.brand.create({ data: { name, slug } });
    return res.status(201).json({ success: true, message: "Brand created", brand });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to create brand" });
  }
});

// Public product detail
router.get("/:identifier", async (req, res) => {
  const identifier = getStringParam(req.params.identifier);
  if (!identifier) {
    return res.status(400).json({ success: false, message: "Invalid product identifier" });
  }

  try {
    const product = await prisma.product.findFirst({
      where: {
        isPublished: true,
        OR: [{ slug: identifier }, { id: identifier }],
      },
      include: productInclude,
    });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const relatedProducts = await prisma.product.findMany({
      where: {
        isPublished: true,
        categoryId: product.categoryId,
        id: { not: product.id },
      },
      include: productInclude,
      orderBy: { createdAt: "desc" },
      take: 4,
    });

    return res.json({
      success: true,
      product: serializeProduct(product),
      relatedProducts: relatedProducts.map((item) => serializeProduct(item)),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to load product" });
  }
});

// ---- CREATE PRODUCT ----
router.post("/", authenticate, requireAdminOrModerator, productUpload, async (req: AuthRequest, res) => {
  try {
    const files = getFilesFromRequest(req);
    const mainImage = files.mainImage?.[0];
    const hoverImage = files.hoverImage?.[0];
    const video = files.video?.[0];
    const extraImages = files.extraImages || [];

    if (!mainImage) {
      return res.status(400).json({ success: false, message: "Main product image is required" });
    }

    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const modelName = getOptionalString(req.body.modelName);
    const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
    const shortDescription = getOptionalString(req.body.shortDescription);
    const productCode = getOptionalString(req.body.productCode);
    const barcode = getOptionalString(req.body.barcode);

    if (!name) return res.status(400).json({ success: false, message: "Product name is required" });
    if (!description) return res.status(400).json({ success: false, message: "Description is required" });

    const categoryId = await resolveCategoryId(req.body);
    const subCategoryId = await resolveSubCategoryId(req.body, categoryId);
    const brandId = await resolveBrandId(req.body);

    const mrp = numberFromBody(req.body.mrp);
    const costPrice = numberFromBody(req.body.costPrice);
    const profitType = req.body.profitType === "FIXED" ? ProfitType.FIXED : ProfitType.PERCENTAGE;
    const profitValue = numberFromBody(req.body.profitValue);
    const sellingPrice = calculateSellingPrice(costPrice, profitType, profitValue);
    const stock = Math.max(numberFromBody(req.body.stock), 0);
    const stockStatus = normalizeStockStatus(req.body.stockStatus);
    const isPublished = booleanFromBody(req.body.isPublished, true);
    const lowStockAlertQuantity = Math.max(numberFromBody(req.body.lowStockAlertQuantity, 5), 0);

    // Arrays and JSON
    const keyFeatures = parseStringArray(req.body.keyFeatures);
    const highlights = parseStringArray(req.body.highlights);
    const tags = parseStringArray(req.body.tags);
    const searchKeywords = parseStringArray(req.body.searchKeywords);
    const packageIncludes = parseStringArray(req.body.packageIncludes);
    const seoKeywords = parseStringArray(req.body.seoKeywords);
    const specifications = parseJSON(req.body.specifications);
    const schemaJson = parseJSON(req.body.schemaJson);

    // Generate SKU
    const sku = await generateNextSku();
    const slug = await createUniqueSlug(name, "product");

    // Upload images/video
    const [mainUploaded, hoverUploaded, videoUploaded] = await Promise.all([
      uploadImageToCloudinary(mainImage.buffer),
      hoverImage ? uploadImageToCloudinary(hoverImage.buffer) : Promise.resolve(null),
      video ? uploadVideoToCloudinary(video.buffer) : Promise.resolve(null),
    ]);

    const extraUploaded = await Promise.all(
      extraImages.map((file) => uploadImageToCloudinary(file.buffer))
    );

    // Cast user to include name/email
    const user = req.user as UserWithName | undefined;

    // Build data object
    const data: Prisma.ProductCreateInput = {
      name,
      slug,
      sku,
      modelName,
      shortDescription,
      description,
      productCode,
      barcode,
      mrp,
      costPrice,
      profitType,
      profitValue,
      sellingPrice,
      stock,
      stockStatus,
      inStock: canAddToCartByStatus(stockStatus),
      isPublished,
      lowStockAlertQuantity,
      keyFeatures,
      highlights,
      specifications,
      tags,
      searchKeywords,
      isFeatured: booleanFromBody(req.body.isFeatured, false),
      isNewArrival: booleanFromBody(req.body.isNewArrival, false),
      isBestSeller: booleanFromBody(req.body.isBestSeller, false),
      isTrending: booleanFromBody(req.body.isTrending, false),
      isRecommended: booleanFromBody(req.body.isRecommended, false),
      isFlashSale: booleanFromBody(req.body.isFlashSale, false),
      mainImageUrl: mainUploaded.secure_url,
      mainImagePublicId: mainUploaded.public_id,
      mainImageAlt: getOptionalString(req.body.mainImageAlt),
      hoverImageUrl: hoverUploaded?.secure_url || null,
      hoverImagePublicId: hoverUploaded?.public_id || null,
      hoverImageAlt: getOptionalString(req.body.hoverImageAlt),
      videoUrl: videoUploaded?.secure_url || null,
      videoPublicId: videoUploaded?.public_id || null,
      category: { connect: { id: categoryId } },
      brand: { connect: { id: brandId } },
      subCategory: subCategoryId ? { connect: { id: subCategoryId } } : undefined,
      extraImages: {
        create: extraUploaded.map((img, index) => ({
          imageUrl: img.secure_url,
          cloudinaryPublicId: img.public_id,
          sortOrder: index,
        })),
      },
      // Additional fields
      warrantyDuration: getOptionalString(req.body.warrantyDuration),
      warrantyDetails: getOptionalString(req.body.warrantyDetails),
      returnPolicy: getOptionalString(req.body.returnPolicy),
      replacementPolicy: getOptionalString(req.body.replacementPolicy),
      refundPolicy: getOptionalString(req.body.refundPolicy),
      deliveryInfo: getOptionalString(req.body.deliveryInfo),
      deliveryCharge: getOptionalNumber(req.body.deliveryCharge),
      insideDhakaDeliveryCharge: getOptionalNumber(req.body.insideDhakaDeliveryCharge),
      outsideDhakaDeliveryCharge: getOptionalNumber(req.body.outsideDhakaDeliveryCharge),
      deliveryTime: getOptionalString(req.body.deliveryTime),
      cashOnDelivery: booleanFromBody(req.body.cashOnDelivery, true),
      freeDelivery: booleanFromBody(req.body.freeDelivery, false),
      freeDeliveryMinAmount: getOptionalNumber(req.body.freeDeliveryMinAmount),
      packageIncludes,
      packageWeight: getOptionalString(req.body.packageWeight),
      packageDimensions: getOptionalString(req.body.packageDimensions),
      supplierName: getOptionalString(req.body.supplierName),
      supplierPhone: getOptionalString(req.body.supplierPhone),
      supplierEmail: getOptionalString(req.body.supplierEmail),
      supplierAddress: getOptionalString(req.body.supplierAddress),
      supplierInvoiceNumber: getOptionalString(req.body.supplierInvoiceNumber),
      internalNote: getOptionalString(req.body.internalNote),
      seoTitle: getOptionalString(req.body.seoTitle),
      seoDescription: getOptionalString(req.body.seoDescription),
      seoKeywords,
      focusKeyword: getOptionalString(req.body.focusKeyword),
      canonicalUrl: getOptionalString(req.body.canonicalUrl),
      ogTitle: getOptionalString(req.body.ogTitle),
      ogDescription: getOptionalString(req.body.ogDescription),
      ogImage: getOptionalString(req.body.ogImage),
      metaRobots: getOptionalString(req.body.metaRobots) || "index,follow",
      schemaJson,
      // Audit fields
      createdById: user?.id,
      createdByName: user?.name || null,
      createdByEmail: user?.email || null,
      publishedAt: isPublished ? new Date() : undefined,
    };

    const product = await prisma.product.create({
      data,
      include: productInclude,
    });

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      product: serializeProduct(product, {
        internal: true,
        showStockQuantity: canSeeStockQuantity(req),
      }),
    });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to create product",
    });
  }
});

// ---- UPDATE PRODUCT ----
router.patch("/:id", authenticate, requireAdminOrModerator, productUpload, async (req: AuthRequest, res) => {
  const id = getStringParam(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: "Invalid product ID" });
  }

  try {
    const existing = await prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const files = getFilesFromRequest(req);
    const mainImage = files.mainImage?.[0];
    const hoverImage = files.hoverImage?.[0];
    const video = files.video?.[0];
    const extraImages = files.extraImages || [];

    const data: Prisma.ProductUpdateInput = {};

    // Basic text fields
    if (typeof req.body.name === "string" && req.body.name.trim()) {
      const nextName = req.body.name.trim();
      data.name = nextName;
      if (nextName !== existing.name) {
        data.slug = await createUniqueSlug(nextName, "product");
      }
    }

    if (typeof req.body.modelName === "string") {
      data.modelName = req.body.modelName.trim() || null;
    }
    if (typeof req.body.description === "string") {
      data.description = req.body.description.trim();
    }
    if (typeof req.body.shortDescription === "string") {
      data.shortDescription = req.body.shortDescription.trim() || null;
    }
    if (typeof req.body.productCode === "string") {
      data.productCode = req.body.productCode.trim() || null;
    }
    if (typeof req.body.barcode === "string") {
      data.barcode = req.body.barcode.trim() || null;
    }

    // Resolve relations
    const categoryId = await resolveCategoryId(req.body);
    const subCategoryId = await resolveSubCategoryId(req.body, categoryId);
    const brandId = await resolveBrandId(req.body);

    data.category = { connect: { id: categoryId } };
    data.brand = { connect: { id: brandId } };
    if (subCategoryId) {
      data.subCategory = { connect: { id: subCategoryId } };
    } else {
      data.subCategory = { disconnect: true };
    }

    // Pricing
    if (typeof req.body.mrp !== "undefined") {
      data.mrp = numberFromBody(req.body.mrp);
    }

    const hasCost = typeof req.body.costPrice !== "undefined";
    const hasProfitType = typeof req.body.profitType !== "undefined";
    const hasProfitValue = typeof req.body.profitValue !== "undefined";

    const nextCostPrice = hasCost ? numberFromBody(req.body.costPrice) : Number(existing.costPrice);
    const nextProfitType = hasProfitType
      ? req.body.profitType === "FIXED" ? ProfitType.FIXED : ProfitType.PERCENTAGE
      : existing.profitType;
    const nextProfitValue = hasProfitValue ? numberFromBody(req.body.profitValue) : Number(existing.profitValue);

    if (hasCost || hasProfitType || hasProfitValue) {
      data.costPrice = nextCostPrice;
      data.profitType = nextProfitType;
      data.profitValue = nextProfitValue;
      data.sellingPrice = calculateSellingPrice(nextCostPrice, nextProfitType, nextProfitValue);
    }

    // Stock
    if (typeof req.body.stock !== "undefined") {
      data.stock = Math.max(numberFromBody(req.body.stock), 0);
    }
    if (typeof req.body.lowStockAlertQuantity !== "undefined") {
      data.lowStockAlertQuantity = Math.max(numberFromBody(req.body.lowStockAlertQuantity, 5), 0);
    }

    if (typeof req.body.stockStatus !== "undefined") {
      const stockStatus = normalizeStockStatus(req.body.stockStatus);
      data.stockStatus = stockStatus;
      data.inStock = canAddToCartByStatus(stockStatus);
    }

    // Boolean flags
    if (typeof req.body.isPublished !== "undefined") {
      const isPublished = booleanFromBody(req.body.isPublished, existing.isPublished);
      data.isPublished = isPublished;
      if (isPublished && !existing.publishedAt) {
        data.publishedAt = new Date();
      }
    }

    const booleanFields = [
      "isFeatured",
      "isNewArrival",
      "isBestSeller",
      "isTrending",
      "isRecommended",
      "isFlashSale",
      "cashOnDelivery",
      "freeDelivery",
    ] as const;

    for (const field of booleanFields) {
      if (typeof req.body[field] !== "undefined") {
        data[field] = booleanFromBody(req.body[field], existing[field] as boolean);
      }
    }

    // Arrays and JSON
    const arrayFields = [
      "keyFeatures",
      "highlights",
      "tags",
      "searchKeywords",
      "packageIncludes",
      "seoKeywords",
    ] as const;

    for (const field of arrayFields) {
      if (typeof req.body[field] !== "undefined") {
        data[field] = parseStringArray(req.body[field]);
      }
    }

    if (typeof req.body.specifications !== "undefined") {
      data.specifications = parseJSON(req.body.specifications);
    }
    if (typeof req.body.schemaJson !== "undefined") {
      data.schemaJson = parseJSON(req.body.schemaJson);
    }

    // Optional string fields
    const optionalStringFields = [
      "warrantyDuration",
      "warrantyDetails",
      "returnPolicy",
      "replacementPolicy",
      "refundPolicy",
      "deliveryInfo",
      "deliveryTime",
      "packageWeight",
      "packageDimensions",
      "supplierName",
      "supplierPhone",
      "supplierEmail",
      "supplierAddress",
      "supplierInvoiceNumber",
      "internalNote",
      "seoTitle",
      "seoDescription",
      "focusKeyword",
      "canonicalUrl",
      "ogTitle",
      "ogDescription",
      "ogImage",
      "metaRobots",
    ] as const;

    for (const field of optionalStringFields) {
      if (typeof req.body[field] !== "undefined") {
        data[field] = getOptionalString(req.body[field]);
      }
    }

    // Optional number fields
    const optionalNumberFields = [
      "deliveryCharge",
      "insideDhakaDeliveryCharge",
      "outsideDhakaDeliveryCharge",
      "freeDeliveryMinAmount",
    ] as const;

    for (const field of optionalNumberFields) {
      if (typeof req.body[field] !== "undefined") {
        data[field] = getOptionalNumber(req.body[field]);
      }
    }

    // Images / video
    if (mainImage) {
      const uploaded = await uploadImageToCloudinary(mainImage.buffer);
      await deleteFromCloudinary(existing.mainImagePublicId);
      data.mainImageUrl = uploaded.secure_url;
      data.mainImagePublicId = uploaded.public_id;
      data.mainImageAlt = getOptionalString(req.body.mainImageAlt);
    }

    if (hoverImage) {
      const uploaded = await uploadImageToCloudinary(hoverImage.buffer);
      if (existing.hoverImagePublicId) {
        await deleteFromCloudinary(existing.hoverImagePublicId);
      }
      data.hoverImageUrl = uploaded.secure_url;
      data.hoverImagePublicId = uploaded.public_id;
      data.hoverImageAlt = getOptionalString(req.body.hoverImageAlt);
    }

    if (video) {
      const uploaded = await uploadVideoToCloudinary(video.buffer);
      if (existing.videoPublicId) {
        await deleteFromCloudinary(existing.videoPublicId, "video");
      }
      data.videoUrl = uploaded.secure_url;
      data.videoPublicId = uploaded.public_id;
    }

    // Remove extra images
    const removedExtraImageIds = parseRemovedExtraImageIds(req.body.removeExtraImageIds);
    if (removedExtraImageIds.length > 0) {
      const imagesToRemove = await prisma.productImage.findMany({
        where: {
          productId: id,
          id: { in: removedExtraImageIds },
        },
      });

      await Promise.all(
        imagesToRemove.map((img) => deleteFromCloudinary(img.cloudinaryPublicId))
      );

      await prisma.productImage.deleteMany({
        where: {
          productId: id,
          id: { in: removedExtraImageIds },
        },
      });
    }

    // Update product - cast user
    const user = req.user as UserWithName | undefined;
    data.updatedById = user?.id;
    data.updatedByName = user?.name || null;
    data.updatedByEmail = user?.email || null;

    await prisma.product.update({
      where: { id },
      data,
    });

    // Add new extra images
    if (extraImages.length > 0) {
      const currentCount = await prisma.productImage.count({
        where: { productId: id },
      });

      const extraUploaded = await Promise.all(
        extraImages.map((file) => uploadImageToCloudinary(file.buffer))
      );

      await prisma.productImage.createMany({
        data: extraUploaded.map((img, index) => ({
          productId: id,
          imageUrl: img.secure_url,
          cloudinaryPublicId: img.public_id,
          sortOrder: currentCount + index,
        })),
      });
    }

    const finalProduct = await prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });

    if (!finalProduct) {
      return res.status(404).json({ success: false, message: "Product not found after update" });
    }

    return res.json({
      success: true,
      message: "Product updated successfully",
      product: serializeProduct(finalProduct, {
        internal: true,
        showStockQuantity: canSeeStockQuantity(req),
      }),
    });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to update product",
    });
  }
});

// ---- DELETE PRODUCT ----
router.delete("/:id", authenticate, requireAdminOrModerator, async (req: AuthRequest, res) => {
  const id = getStringParam(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: "Invalid product ID" });
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: { extraImages: true },
    });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    await prisma.product.delete({ where: { id } });

    await Promise.all([
      deleteFromCloudinary(product.mainImagePublicId),
      product.hoverImagePublicId ? deleteFromCloudinary(product.hoverImagePublicId) : Promise.resolve(),
      product.videoPublicId ? deleteFromCloudinary(product.videoPublicId, "video") : Promise.resolve(),
      ...product.extraImages.map((img) => deleteFromCloudinary(img.cloudinaryPublicId)),
    ]);

    return res.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete product",
    });
  }
});

export default router;