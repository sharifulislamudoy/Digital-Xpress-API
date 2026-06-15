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

const productUpload = upload.fields([
  { name: "mainImage", maxCount: 1 },
  { name: "hoverImage", maxCount: 1 },
  { name: "video", maxCount: 1 },
  { name: "extraImages", maxCount: 20 },
]);

const productInclude = {
  category: true,
  subCategory: true,
  brand: true,
  extraImages: {
    orderBy: { sortOrder: "asc" as const },
  },
};

const stockStatusLabelMap: Record<StockStatus, string> = {
  IN_STOCK: "In stock",
  LIMITED_STOCK: "Limited stock",
  LOW_STOCK: "Low stock",
  OUT_OF_STOCK: "Out of stock",
  PRE_ORDER: "Pre-order",
  COMING_SOON: "Coming soon",
};

const purchasableStatuses = new Set<StockStatus>([
  StockStatus.IN_STOCK,
  StockStatus.LIMITED_STOCK,
  StockStatus.LOW_STOCK,
  StockStatus.PRE_ORDER,
]);

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

function getFiles(req: AuthRequest) {
  return req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
}

function normalizeStockStatus(value: unknown): StockStatus {
  if (
    value === StockStatus.IN_STOCK ||
    value === StockStatus.LIMITED_STOCK ||
    value === StockStatus.LOW_STOCK ||
    value === StockStatus.OUT_OF_STOCK ||
    value === StockStatus.PRE_ORDER ||
    value === StockStatus.COMING_SOON
  ) {
    return value;
  }

  return StockStatus.IN_STOCK;
}

function canAddToCartByStatus(stockStatus: StockStatus) {
  return purchasableStatuses.has(stockStatus);
}

function canSeeStockQuantity(req: AuthRequest) {
  return (req.user as any)?.role === "admin";
}

function serializeProduct(
  product: any,
  options: { internal?: boolean; showStockQuantity?: boolean } = {}
) {
  const sellingPrice = Number(product.sellingPrice);
  const mrp = product.mrp ? Number(product.mrp) : sellingPrice;
  const stockStatus = product.stockStatus || StockStatus.IN_STOCK;
  const canAddToCart = canAddToCartByStatus(stockStatus);

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,

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
    hoverImageUrl: product.hoverImageUrl,
    videoUrl: product.videoUrl,
    extraImages: product.extraImages || [],

    image: product.mainImageUrl,
    hoverImage: product.hoverImageUrl,

    stockStatus,
    stockStatusLabel: stockStatusLabelMap[stockStatus],
    canAddToCart,
    inStock: canAddToCart,

    isPublished: product.isPublished,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,

    ...(options.showStockQuantity && {
      stock: product.stock,
    }),

    ...(options.internal && {
      costPrice: Number(product.costPrice),
      profitType: product.profitType,
      profitValue: Number(product.profitValue),
      mainImagePublicId: product.mainImagePublicId,
      hoverImagePublicId: product.hoverImagePublicId,
      videoPublicId: product.videoPublicId,
    }),
  };
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

// Public products
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

router.post("/categories", authenticate, requireAdminOrModerator, async (req: AuthRequest, res) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    const baseSlug = slugify(name);
    const existing = await prisma.productCategory.findUnique({
      where: { slug: baseSlug },
    });

    if (existing) {
      return res.status(200).json({
        success: true,
        message: "Category already exists",
        category: existing,
      });
    }

    const slug = await createUniqueSlug(name, "category");

    const category = await prisma.productCategory.create({
      data: { name, slug },
    });

    return res.status(201).json({
      success: true,
      message: "Category created",
      category,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed to create category",
    });
  }
});

router.post("/sub-categories", authenticate, requireAdminOrModerator, async (req: AuthRequest, res) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const categoryId =
      typeof req.body.categoryId === "string" ? req.body.categoryId.trim() : "";

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Sub-category name is required",
      });
    }

    if (!categoryId) {
      return res.status(400).json({
        success: false,
        message: "Category is required",
      });
    }

    const baseSlug = slugify(name);

    const existing = await prisma.productSubCategory.findUnique({
      where: {
        categoryId_slug: {
          categoryId,
          slug: baseSlug,
        },
      },
    });

    if (existing) {
      return res.status(200).json({
        success: true,
        message: "Sub-category already exists",
        subCategory: existing,
      });
    }

    const slug = await createUniqueSlug(name, "subCategory", categoryId);

    const subCategory = await prisma.productSubCategory.create({
      data: { name, slug, categoryId },
    });

    return res.status(201).json({
      success: true,
      message: "Sub-category created",
      subCategory,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed to create sub-category",
    });
  }
});

router.post("/brands", authenticate, requireAdminOrModerator, async (req: AuthRequest, res) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Brand name is required",
      });
    }

    const baseSlug = slugify(name);

    const existing = await prisma.brand.findUnique({
      where: { slug: baseSlug },
    });

    if (existing) {
      return res.status(200).json({
        success: true,
        message: "Brand already exists",
        brand: existing,
      });
    }

    const slug = await createUniqueSlug(name, "brand");

    const brand = await prisma.brand.create({
      data: { name, slug },
    });

    return res.status(201).json({
      success: true,
      message: "Brand created",
      brand,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed to create brand",
    });
  }
});

router.get("/:identifier", async (req, res) => {
  const identifier = getStringParam(req.params.identifier);

  if (!identifier) {
    return res.status(400).json({
      success: false,
      message: "Invalid product identifier",
    });
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
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
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
    return res.status(500).json({
      success: false,
      message: "Failed to load product",
    });
  }
});

router.post("/", authenticate, requireAdminOrModerator, productUpload, async (req: AuthRequest, res) => {
  try {
    const files = getFiles(req);
    const mainImage = files?.mainImage?.[0];
    const hoverImage = files?.hoverImage?.[0];
    const video = files?.video?.[0];
    const extraImages = files?.extraImages || [];

    if (!mainImage) {
      return res.status(400).json({
        success: false,
        message: "Main product image is required",
      });
    }

    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const modelName =
      typeof req.body.modelName === "string" && req.body.modelName.trim()
        ? req.body.modelName.trim()
        : null;

    const description =
      typeof req.body.description === "string" ? req.body.description.trim() : "";

    const shortDescription =
      typeof req.body.shortDescription === "string" && req.body.shortDescription.trim()
        ? req.body.shortDescription.trim()
        : null;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Product name is required",
      });
    }

    if (!description) {
      return res.status(400).json({
        success: false,
        message: "Description is required",
      });
    }

    const categoryId = await resolveCategoryId(req.body);
    const subCategoryId = await resolveSubCategoryId(req.body, categoryId);
    const brandId = await resolveBrandId(req.body);

    const mrp = numberFromBody(req.body.mrp);
    const costPrice = numberFromBody(req.body.costPrice);
    const profitType =
      req.body.profitType === "FIXED" ? ProfitType.FIXED : ProfitType.PERCENTAGE;
    const profitValue = numberFromBody(req.body.profitValue);
    const sellingPrice = calculateSellingPrice(costPrice, profitType, profitValue);

    const stock = Math.max(numberFromBody(req.body.stock), 0);
    const stockStatus = normalizeStockStatus(req.body.stockStatus);
    const isPublished = booleanFromBody(req.body.isPublished, true);
    const slug = await createUniqueSlug(name, "product");

    const [mainUploaded, hoverUploaded, videoUploaded] = await Promise.all([
      uploadImageToCloudinary(mainImage.buffer),
      hoverImage ? uploadImageToCloudinary(hoverImage.buffer) : Promise.resolve(null),
      video ? uploadVideoToCloudinary(video.buffer) : Promise.resolve(null),
    ]);

    const extraUploaded = await Promise.all(
      extraImages.map((file) => uploadImageToCloudinary(file.buffer))
    );

    const product = await prisma.product.create({
      data: {
        name,
        slug,
        modelName,
        shortDescription,
        description,

        mrp,
        costPrice,
        profitType,
        profitValue,
        sellingPrice,

        stock,
        stockStatus,
        inStock: canAddToCartByStatus(stockStatus),
        isPublished,

        categoryId,
        subCategoryId,
        brandId,

        mainImageUrl: mainUploaded.secure_url,
        mainImagePublicId: mainUploaded.public_id,

        hoverImageUrl: hoverUploaded?.secure_url || null,
        hoverImagePublicId: hoverUploaded?.public_id || null,

        videoUrl: videoUploaded?.secure_url || null,
        videoPublicId: videoUploaded?.public_id || null,

        extraImages: {
          create: extraUploaded.map((img, index) => ({
            imageUrl: img.secure_url,
            cloudinaryPublicId: img.public_id,
            sortOrder: index,
          })),
        },
      },
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

router.patch("/:id", authenticate, requireAdminOrModerator, productUpload, async (req: AuthRequest, res) => {
  const id = getStringParam(req.params.id);

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "Invalid product ID",
    });
  }

  try {
    const existing = await prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const files = getFiles(req);
    const mainImage = files?.mainImage?.[0];
    const hoverImage = files?.hoverImage?.[0];
    const video = files?.video?.[0];
    const extraImages = files?.extraImages || [];

    const data: Prisma.ProductUpdateInput = {};

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

    if (typeof req.body.mrp !== "undefined") {
      data.mrp = numberFromBody(req.body.mrp);
    }

    const hasCost = typeof req.body.costPrice !== "undefined";
    const hasProfitType = typeof req.body.profitType !== "undefined";
    const hasProfitValue = typeof req.body.profitValue !== "undefined";

    const nextCostPrice = hasCost
      ? numberFromBody(req.body.costPrice)
      : Number(existing.costPrice);

    const nextProfitType = hasProfitType
      ? req.body.profitType === "FIXED"
        ? ProfitType.FIXED
        : ProfitType.PERCENTAGE
      : existing.profitType;

    const nextProfitValue = hasProfitValue
      ? numberFromBody(req.body.profitValue)
      : Number(existing.profitValue);

    if (hasCost || hasProfitType || hasProfitValue) {
      data.costPrice = nextCostPrice;
      data.profitType = nextProfitType;
      data.profitValue = nextProfitValue;
      data.sellingPrice = calculateSellingPrice(
        nextCostPrice,
        nextProfitType,
        nextProfitValue
      );
    }

    if (typeof req.body.stock !== "undefined") {
      data.stock = Math.max(numberFromBody(req.body.stock), 0);
    }

    if (typeof req.body.stockStatus !== "undefined") {
      const stockStatus = normalizeStockStatus(req.body.stockStatus);
      data.stockStatus = stockStatus;
      data.inStock = canAddToCartByStatus(stockStatus);
    }

    if (typeof req.body.isPublished !== "undefined") {
      data.isPublished = booleanFromBody(req.body.isPublished, existing.isPublished);
    }

    if (mainImage) {
      const uploaded = await uploadImageToCloudinary(mainImage.buffer);
      await deleteFromCloudinary(existing.mainImagePublicId);

      data.mainImageUrl = uploaded.secure_url;
      data.mainImagePublicId = uploaded.public_id;
    }

    if (hoverImage) {
      const uploaded = await uploadImageToCloudinary(hoverImage.buffer);

      if (existing.hoverImagePublicId) {
        await deleteFromCloudinary(existing.hoverImagePublicId);
      }

      data.hoverImageUrl = uploaded.secure_url;
      data.hoverImagePublicId = uploaded.public_id;
    }

    if (video) {
      const uploaded = await uploadVideoToCloudinary(video.buffer);

      if (existing.videoPublicId) {
        await deleteFromCloudinary(existing.videoPublicId, "video");
      }

      data.videoUrl = uploaded.secure_url;
      data.videoPublicId = uploaded.public_id;
    }

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

    await prisma.product.update({
      where: { id },
      data,
    });

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

router.delete("/:id", authenticate, requireAdminOrModerator, async (req: AuthRequest, res) => {
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
      include: { extraImages: true },
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    await prisma.product.delete({
      where: { id },
    });

    await Promise.all([
      deleteFromCloudinary(product.mainImagePublicId),
      product.hoverImagePublicId
        ? deleteFromCloudinary(product.hoverImagePublicId)
        : Promise.resolve(),
      product.videoPublicId
        ? deleteFromCloudinary(product.videoPublicId, "video")
        : Promise.resolve(),
      ...product.extraImages.map((img) =>
        deleteFromCloudinary(img.cloudinaryPublicId)
      ),
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