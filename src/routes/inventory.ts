import { Router, type Response } from "express";
import {
  Prisma,
  InventoryMovementType,
  StockStatus,
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  authenticate,
  requireAdminOrModerator,
  type AuthRequest,
} from "../middleware/auth";
import {
  createPurchaseBatch,
  decimalToNumber,
  getStockStatusFromQuantity,
  refreshProductInventorySummary,
  seedOpeningStockForExistingProducts,
  toMoney,
} from "../lib/inventory";

const router = Router();

const INVENTORY_SETTINGS_KEY = "inventory_settings";
const RESET_CONFIRM_TEXT = "delete my store";

type InventorySettings = {
  autoStockOutEnabled: boolean;
};

const DEFAULT_INVENTORY_SETTINGS: InventorySettings = {
  autoStockOutEnabled: false,
};

function sendError(res: Response, error: unknown, fallback = "Server error") {
  console.error(error);
  const message = error instanceof Error ? error.message : fallback;
  return res.status(500).json({ success: false, message });
}

function requiredString(value: unknown, fieldName: string, maxLength = 200) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }

  return value.trim().slice(0, maxLength);
}

function optionalString(value: unknown, maxLength = 300) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean ? clean.slice(0, maxLength) : null;
}

function intFromBody(value: unknown, fieldName: string) {
  const parsed = Math.trunc(Number(value));

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be greater than 0`);
  }

  return parsed;
}

function parseDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function actorFromReq(req: AuthRequest) {
  return {
    id: req.user?.id || null,
    name: req.user?.name || null,
    email: req.user?.email || null,
  };
}

function getUserRole(req: AuthRequest) {
  return String((req.user as any)?.role || "").toLowerCase();
}

function isAdmin(req: AuthRequest) {
  return getUserRole(req) === "admin";
}

function denyIfNotAdmin(req: AuthRequest, res: Response) {
  if (isAdmin(req)) return false;

  res.status(403).json({
    success: false,
    message: "Only admin can manage this inventory feature",
  });

  return true;
}

function serializeBatch(batch: any) {
  return {
    ...batch,
    unitCostPrice: decimalToNumber(batch.unitCostPrice),
    mrp: decimalToNumber(batch.mrp),
    sellingPrice: decimalToNumber(batch.sellingPrice),
    totalCost: decimalToNumber(batch.totalCost),
  };
}

function serializeMovement(movement: any) {
  return {
    ...movement,
    unitCostPrice: decimalToNumber(movement.unitCostPrice),
    totalCost: decimalToNumber(movement.totalCost),
  };
}

function serializeInventoryProduct(product: any) {
  const batches = Array.isArray(product.inventoryBatches)
    ? product.inventoryBatches.map(serializeBatch)
    : [];

  const stockValue = decimalToNumber(product.stockValue);
  const stock = Number(product.stock || 0);
  const averageCost =
    stock > 0 ? stockValue / stock : decimalToNumber(product.averageCost);
  const sellingPrice = decimalToNumber(product.sellingPrice);
  const estimatedProfitPerUnit = sellingPrice - averageCost;

  return {
    ...product,
    mrp: decimalToNumber(product.mrp),
    costPrice: decimalToNumber(product.costPrice),
    sellingPrice,
    averageCost: decimalToNumber(product.averageCost),
    lastPurchaseCost: decimalToNumber(product.lastPurchaseCost),
    stockValue,
    estimatedProfitPerUnit: Number(estimatedProfitPerUnit.toFixed(2)),
    inventoryBatches: batches,
  };
}

function parseInventorySettings(value: unknown): InventorySettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_INVENTORY_SETTINGS;
  }

  const data = value as Record<string, unknown>;

  return {
    autoStockOutEnabled: Boolean(data.autoStockOutEnabled),
  };
}

function serializeSettings(row: {
  id: string;
  key: string;
  value: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}) {
  const settings = parseInventorySettings(row.value);

  return {
    id: row.id,
    key: row.key,
    autoStockOutEnabled: settings.autoStockOutEnabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getInventorySettingsRow(
  client: typeof prisma | Prisma.TransactionClient = prisma
) {
  return client.storeSetting.upsert({
    where: {
      key: INVENTORY_SETTINGS_KEY,
    },
    update: {},
    create: {
      key: INVENTORY_SETTINGS_KEY,
      value: DEFAULT_INVENTORY_SETTINGS,
    },
  });
}

async function isAutoStockOutEnabled(
  client: typeof prisma | Prisma.TransactionClient = prisma
) {
  const row = await getInventorySettingsRow(client);
  const settings = parseInventorySettings(row.value);
  return settings.autoStockOutEnabled;
}

async function updateInventorySettings(
  client: Prisma.TransactionClient,
  nextSettings: InventorySettings
) {
  return client.storeSetting.upsert({
    where: {
      key: INVENTORY_SETTINGS_KEY,
    },
    update: {
      value: nextSettings,
    },
    create: {
      key: INVENTORY_SETTINGS_KEY,
      value: nextSettings,
    },
  });
}

async function applyAutoStockOutToZeroStockProducts(
  client: Prisma.TransactionClient
) {
  const result = await client.product.updateMany({
    where: {
      stock: {
        lte: 0,
      },
    },
    data: {
      stockStatus: StockStatus.OUT_OF_STOCK,
      inStock: false,
    },
  });

  return result.count;
}

async function syncProductStatusWhenAutoStockOutEnabled(
  client: Prisma.TransactionClient,
  productId: string
) {
  const product = await client.product.findUnique({
    where: {
      id: productId,
    },
    select: {
      stock: true,
      stockStatus: true,
      lowStockAlertQuantity: true,
    },
  });

  if (!product) return;

  const nextStatus =
    product.stock <= 0
      ? StockStatus.OUT_OF_STOCK
      : getStockStatusFromQuantity(
          product.stock,
          product.stockStatus,
          product.lowStockAlertQuantity
        );

  await client.product.update({
    where: {
      id: productId,
    },
    data: {
      stockStatus: nextStatus,
      inStock: nextStatus !== StockStatus.OUT_OF_STOCK && product.stock > 0,
    },
  });
}

async function restoreManualProductStatus(
  client: Prisma.TransactionClient,
  productId: string,
  previousStatus: StockStatus,
  previousInStock: boolean
) {
  await client.product.update({
    where: {
      id: productId,
    },
    data: {
      stockStatus: previousStatus,
      inStock: previousInStock,
    },
  });
}

async function consumeStockForAdjustment(
  tx: Prisma.TransactionClient,
  input: {
    productId: string;
    quantity: number;
    type: Extract<
      InventoryMovementType,
      "ADJUSTMENT_OUT" | "DAMAGE" | "LOSS"
    >;
    reason: string;
    actor: ReturnType<typeof actorFromReq>;
  }
) {
  let requiredQty = input.quantity;

  const batches = await tx.inventoryBatch.findMany({
    where: {
      productId: input.productId,
      remainingQuantity: {
        gt: 0,
      },
    },
    orderBy: [{ purchaseDate: "asc" }, { createdAt: "asc" }],
  });

  for (const batch of batches) {
    if (requiredQty <= 0) break;

    const usedQty = Math.min(requiredQty, batch.remainingQuantity);
    const unitCostPrice = decimalToNumber(batch.unitCostPrice);
    const totalCost = Number((unitCostPrice * usedQty).toFixed(2));

    await tx.inventoryBatch.update({
      where: {
        id: batch.id,
      },
      data: {
        remainingQuantity: {
          decrement: usedQty,
        },
      },
    });

    await tx.inventoryMovement.create({
      data: {
        productId: input.productId,
        batchId: batch.id,
        type: input.type,
        quantity: -usedQty,
        unitCostPrice,
        totalCost,
        reason: input.reason,
        referenceType: "MANUAL_ADJUSTMENT",
      },
    });

    requiredQty -= usedQty;
  }

  if (requiredQty > 0) {
    throw new Error("Not enough batch stock for this adjustment");
  }
}

router.get(
  "/settings",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      if (denyIfNotAdmin(req, res)) return;

      const row = await getInventorySettingsRow();

      return res.json({
        success: true,
        settings: serializeSettings(row),
      });
    } catch (error) {
      return sendError(res, error, "Failed to load inventory settings");
    }
  }
);

router.patch(
  "/settings/auto-stock-out",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      if (denyIfNotAdmin(req, res)) return;

      if (typeof req.body.enabled !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "enabled must be true or false",
        });
      }

      const enabled = Boolean(req.body.enabled);

      const result = await prisma.$transaction(async (tx) => {
        const row = await updateInventorySettings(tx, {
          autoStockOutEnabled: enabled,
        });

        let syncedProducts = 0;

        if (enabled) {
          syncedProducts = await applyAutoStockOutToZeroStockProducts(tx);
        }

        return {
          row,
          syncedProducts,
        };
      });

      return res.json({
        success: true,
        message: enabled
          ? "Auto Stock Out enabled successfully"
          : "Auto Stock Out disabled successfully",
        settings: serializeSettings(result.row),
        syncedProducts: result.syncedProducts,
      });
    } catch (error) {
      return sendError(res, error, "Failed to update auto stock out setting");
    }
  }
);

router.patch(
  "/reset-stock",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      if (denyIfNotAdmin(req, res)) return;

      const confirmText =
        typeof req.body.confirmText === "string"
          ? req.body.confirmText.trim()
          : "";

      if (confirmText !== RESET_CONFIRM_TEXT) {
        return res.status(400).json({
          success: false,
          message: `Type ${RESET_CONFIRM_TEXT} exactly to reset stock`,
        });
      }

      const result = await prisma.$transaction(async (tx) => {
        const autoStockOutEnabled = await isAutoStockOutEnabled(tx);

        const batchResult = await tx.inventoryBatch.updateMany({
          data: {
            remainingQuantity: 0,
          },
        });

        const productResetData: Prisma.ProductUpdateManyMutationInput = {
          stock: 0,
          averageCost: 0,
          stockValue: 0,
          lastPurchaseCost: null,
        };

        if (autoStockOutEnabled) {
          productResetData.stockStatus = StockStatus.OUT_OF_STOCK;
          productResetData.inStock = false;
        }

        const productResult = await tx.product.updateMany({
          data: productResetData,
        });

        return {
          productsReset: productResult.count,
          batchesReset: batchResult.count,
          autoStockOutEnabled,
        };
      });

      return res.json({
        success: true,
        message: "All product stock reset successfully",
        ...result,
      });
    } catch (error) {
      return sendError(res, error, "Failed to reset stock");
    }
  }
);

router.get(
  "/products",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const search =
        typeof req.query.search === "string" ? req.query.search.trim() : "";
      const status =
        typeof req.query.status === "string" ? req.query.status : "all";
      const page = Math.max(Number(req.query.page || 1), 1);
      const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 100);
      const skip = (page - 1) * limit;

      const where: Prisma.ProductWhereInput = {};

      if (status !== "all") {
        where.stockStatus = status as StockStatus;
      }

      if (search) {
        where.OR = [
          {
            name: {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
            },
          },
          {
            sku: {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
            },
          },
          {
            modelName: {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
            },
          },
          {
            brand: {
              name: {
                contains: search,
                mode: Prisma.QueryMode.insensitive,
              },
            },
          },
        ];
      }

      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          include: {
            brand: true,
            category: true,
            inventoryBatches: {
              where: {
                remainingQuantity: {
                  gt: 0,
                },
              },
              orderBy: [{ purchaseDate: "asc" }, { createdAt: "asc" }],
              take: 5,
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
          skip,
          take: limit,
        }),
        prisma.product.count({
          where,
        }),
      ]);

      return res.json({
        success: true,
        products: products.map(serializeInventoryProduct),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(Math.ceil(total / limit), 1),
        },
      });
    } catch (error) {
      return sendError(res, error, "Failed to load inventory products");
    }
  }
);

router.get(
  "/products/:productId",
  authenticate,
  requireAdminOrModerator,
  async (req, res) => {
    try {
      const productId = requiredString(req.params.productId, "Product id");

      const product = await prisma.product.findUnique({
        where: {
          id: productId,
        },
        include: {
          brand: true,
          category: true,
          subCategory: true,
          inventoryBatches: {
            orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
          },
          inventoryMovements: {
            orderBy: {
              createdAt: "desc",
            },
            take: 100,
          },
        },
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      return res.json({
        success: true,
        product: serializeInventoryProduct(product),
        batches: product.inventoryBatches.map(serializeBatch),
        movements: product.inventoryMovements.map(serializeMovement),
      });
    } catch (error) {
      return sendError(res, error, "Failed to load inventory product details");
    }
  }
);

router.post(
  "/purchase",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const productId = requiredString(req.body.productId, "Product");
      const quantity = intFromBody(req.body.quantity, "Purchase quantity");
      const unitCostPrice = toMoney(req.body.unitCostPrice);

      if (unitCostPrice <= 0) {
        return res.status(400).json({
          success: false,
          message: "Unit cost price must be greater than 0",
        });
      }

      const batch = await prisma.$transaction(async (tx) => {
        const productBeforeUpdate = await tx.product.findUnique({
          where: {
            id: productId,
          },
          select: {
            stockStatus: true,
            inStock: true,
          },
        });

        if (!productBeforeUpdate) {
          throw new Error("Product not found");
        }

        const autoStockOutEnabled = await isAutoStockOutEnabled(tx);

        const createdBatch = await createPurchaseBatch(tx, {
          productId,
          quantity,
          unitCostPrice,
          mrp: req.body.mrp === undefined ? null : toMoney(req.body.mrp),
          sellingPrice:
            req.body.sellingPrice === undefined
              ? null
              : toMoney(req.body.sellingPrice),
          purchaseDate: parseDate(req.body.purchaseDate),
          note: optionalString(req.body.note, 400),
          actor: actorFromReq(req),
          updateProductPrice: Boolean(req.body.updateProductPrice),
        });

        if (autoStockOutEnabled) {
          await syncProductStatusWhenAutoStockOutEnabled(tx, productId);
        } else {
          await restoreManualProductStatus(
            tx,
            productId,
            productBeforeUpdate.stockStatus,
            productBeforeUpdate.inStock
          );
        }

        return createdBatch;
      });

      return res.status(201).json({
        success: true,
        message: "Stock purchase added successfully",
        batch: serializeBatch(batch),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to add purchase stock";

      return res.status(400).json({
        success: false,
        message,
      });
    }
  }
);

router.patch(
  "/products/:productId/adjust",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const productId = requiredString(req.params.productId, "Product id");
      const rawType = requiredString(req.body.type, "Adjustment type");
      const quantity = intFromBody(req.body.quantity, "Quantity");
      const reason =
        optionalString(req.body.reason, 400) || "Manual stock adjustment";
      const actor = actorFromReq(req);

      const product = await prisma.product.findUnique({
        where: {
          id: productId,
        },
        select: {
          id: true,
          stockStatus: true,
          inStock: true,
        },
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      await prisma.$transaction(async (tx) => {
        const autoStockOutEnabled = await isAutoStockOutEnabled(tx);

        if (rawType === "ADJUSTMENT_IN") {
          const unitCostPrice = toMoney(req.body.unitCostPrice);

          if (unitCostPrice <= 0) {
            throw new Error("Unit cost price is required for stock increase");
          }

          await createPurchaseBatch(tx, {
            productId,
            quantity,
            unitCostPrice,
            note: reason,
            actor,
            updateProductPrice: Boolean(req.body.updateProductPrice),
          });

          if (autoStockOutEnabled) {
            await syncProductStatusWhenAutoStockOutEnabled(tx, productId);
          } else {
            await restoreManualProductStatus(
              tx,
              productId,
              product.stockStatus,
              product.inStock
            );
          }

          return;
        }

        const allowedOutTypes = ["ADJUSTMENT_OUT", "DAMAGE", "LOSS"];

        if (!allowedOutTypes.includes(rawType)) {
          throw new Error("Invalid adjustment type");
        }

        await consumeStockForAdjustment(tx, {
          productId,
          quantity,
          type: rawType as Extract<
            InventoryMovementType,
            "ADJUSTMENT_OUT" | "DAMAGE" | "LOSS"
          >,
          reason,
          actor,
        });

        await tx.product.update({
          where: {
            id: productId,
          },
          data: {
            stock: {
              decrement: quantity,
            },
          },
        });

        await refreshProductInventorySummary(tx, productId, {
          keepManualStatus: true,
        });

        if (autoStockOutEnabled) {
          await syncProductStatusWhenAutoStockOutEnabled(tx, productId);
        } else {
          await restoreManualProductStatus(
            tx,
            productId,
            product.stockStatus,
            product.inStock
          );
        }
      });

      return res.json({
        success: true,
        message: "Stock adjusted successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to adjust stock";

      return res.status(400).json({
        success: false,
        message,
      });
    }
  }
);

router.get(
  "/movements",
  authenticate,
  requireAdminOrModerator,
  async (req, res) => {
    try {
      const productId =
        typeof req.query.productId === "string"
          ? req.query.productId
          : undefined;
      const type =
        typeof req.query.type === "string" ? req.query.type : undefined;
      const page = Math.max(Number(req.query.page || 1), 1);
      const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
      const skip = (page - 1) * limit;

      const where: Prisma.InventoryMovementWhereInput = {
        ...(productId ? { productId } : {}),
        ...(type && type !== "all" ? { type: type as any } : {}),
      };

      const [movements, total] = await Promise.all([
        prisma.inventoryMovement.findMany({
          where,
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                mainImageUrl: true,
              },
            },
            batch: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          skip,
          take: limit,
        }),
        prisma.inventoryMovement.count({
          where,
        }),
      ]);

      return res.json({
        success: true,
        movements: movements.map(serializeMovement),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(Math.ceil(total / limit), 1),
        },
      });
    } catch (error) {
      return sendError(res, error, "Failed to load stock movements");
    }
  }
);

router.get(
  "/low-stock",
  authenticate,
  requireAdminOrModerator,
  async (_req, res) => {
    try {
      const products = await prisma.product.findMany({
        where: {
          OR: [
            {
              stockStatus: StockStatus.LOW_STOCK,
            },
            {
              stockStatus: StockStatus.OUT_OF_STOCK,
            },
          ],
        },
        include: {
          brand: true,
          category: true,
          inventoryBatches: {
            where: {
              remainingQuantity: {
                gt: 0,
              },
            },
            orderBy: [{ purchaseDate: "asc" }, { createdAt: "asc" }],
            take: 5,
          },
        },
        orderBy: [{ stock: "asc" }, { updatedAt: "desc" }],
        take: 100,
      });

      return res.json({
        success: true,
        products: products.map(serializeInventoryProduct),
      });
    } catch (error) {
      return sendError(res, error, "Failed to load low stock products");
    }
  }
);

router.post(
  "/seed-opening-stock",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const result = await seedOpeningStockForExistingProducts(actorFromReq(req));

      return res.json({
        success: true,
        message: `${result.created} product opening stock batch created`,
        ...result,
      });
    } catch (error) {
      return sendError(res, error, "Failed to seed opening stock");
    }
  }
);

export default router;