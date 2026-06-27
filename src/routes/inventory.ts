import { Router, type Response } from "express";
import { Prisma, InventoryMovementType } from "@prisma/client";
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
  const averageCost = stock > 0 ? stockValue / stock : decimalToNumber(product.averageCost);
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

async function consumeStockForAdjustment(
  tx: Prisma.TransactionClient,
  input: {
    productId: string;
    quantity: number;
    type: Extract<InventoryMovementType, "ADJUSTMENT_OUT" | "DAMAGE" | "LOSS">;
    reason: string;
    actor: ReturnType<typeof actorFromReq>;
  }
) {
  let requiredQty = input.quantity;

  const batches = await tx.inventoryBatch.findMany({
    where: {
      productId: input.productId,
      remainingQuantity: { gt: 0 },
    },
    orderBy: [{ purchaseDate: "asc" }, { createdAt: "asc" }],
  });

  for (const batch of batches) {
    if (requiredQty <= 0) break;

    const usedQty = Math.min(requiredQty, batch.remainingQuantity);
    const unitCostPrice = decimalToNumber(batch.unitCostPrice);
    const totalCost = Number((unitCostPrice * usedQty).toFixed(2));

    await tx.inventoryBatch.update({
      where: { id: batch.id },
      data: {
        remainingQuantity: { decrement: usedQty },
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
        createdById: input.actor.id,
        createdByName: input.actor.name,
        createdByEmail: input.actor.email,
      },
    });

    requiredQty -= usedQty;
  }

  if (requiredQty > 0) {
    throw new Error("Not enough batch stock for this adjustment");
  }
}

router.get(
  "/products",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const status = typeof req.query.status === "string" ? req.query.status : "all";
      const page = Math.max(Number(req.query.page || 1), 1);
      const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 100);
      const skip = (page - 1) * limit;

      const where: Prisma.ProductWhereInput = {
        ...(status !== "all" ? { stockStatus: status as any } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } },
                { productCode: { contains: search, mode: "insensitive" } },
                { modelName: { contains: search, mode: "insensitive" } },
                { brand: { name: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      };

      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          include: {
            brand: true,
            category: true,
            inventoryBatches: {
              where: { remainingQuantity: { gt: 0 } },
              orderBy: [{ purchaseDate: "asc" }, { createdAt: "asc" }],
              take: 5,
            },
          },
          orderBy: { updatedAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.product.count({ where }),
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
        where: { id: productId },
        include: {
          brand: true,
          category: true,
          subCategory: true,
          inventoryBatches: {
            orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
          },
          inventoryMovements: {
            orderBy: { createdAt: "desc" },
            take: 100,
          },
        },
      });

      if (!product) {
        return res.status(404).json({ success: false, message: "Product not found" });
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
        return createPurchaseBatch(tx, {
          productId,
          quantity,
          unitCostPrice,
          mrp: req.body.mrp === undefined ? null : toMoney(req.body.mrp),
          sellingPrice:
            req.body.sellingPrice === undefined ? null : toMoney(req.body.sellingPrice),
          supplierName: optionalString(req.body.supplierName, 120),
          supplierPhone: optionalString(req.body.supplierPhone, 30),
          supplierInvoiceNumber: optionalString(req.body.supplierInvoiceNumber, 120),
          purchaseDate: parseDate(req.body.purchaseDate),
          note: optionalString(req.body.note, 400),
          actor: actorFromReq(req),
          updateProductPrice: Boolean(req.body.updateProductPrice),
        });
      });

      return res.status(201).json({
        success: true,
        message: "Stock purchase added successfully",
        batch: serializeBatch(batch),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add purchase stock";
      return res.status(400).json({ success: false, message });
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
      const reason = optionalString(req.body.reason, 400) || "Manual stock adjustment";
      const actor = actorFromReq(req);

      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          stock: true,
          stockStatus: true,
          lowStockAlertQuantity: true,
        },
      });

      if (!product) {
        return res.status(404).json({ success: false, message: "Product not found" });
      }

      await prisma.$transaction(async (tx) => {
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
          return;
        }

        const allowedOutTypes = ["ADJUSTMENT_OUT", "DAMAGE", "LOSS"];
        if (!allowedOutTypes.includes(rawType)) {
          throw new Error("Invalid adjustment type");
        }

        await consumeStockForAdjustment(tx, {
          productId,
          quantity,
          type: rawType as Extract<InventoryMovementType, "ADJUSTMENT_OUT" | "DAMAGE" | "LOSS">,
          reason,
          actor,
        });

        await tx.product.update({
          where: { id: productId },
          data: {
            stock: { decrement: quantity },
          },
        });

        const updatedProduct = await tx.product.findUnique({
          where: { id: productId },
          select: {
            stock: true,
            stockStatus: true,
            lowStockAlertQuantity: true,
          },
        });

        if (updatedProduct) {
          const nextStatus = getStockStatusFromQuantity(
            updatedProduct.stock,
            updatedProduct.stockStatus,
            updatedProduct.lowStockAlertQuantity
          );

          await tx.product.update({
            where: { id: productId },
            data: {
              stockStatus: nextStatus,
              inStock: nextStatus !== "OUT_OF_STOCK" && updatedProduct.stock > 0,
            },
          });
        }

        await refreshProductInventorySummary(tx, productId, { keepManualStatus: true });
      });

      return res.json({
        success: true,
        message: "Stock adjusted successfully",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to adjust stock";
      return res.status(400).json({ success: false, message });
    }
  }
);

router.get(
  "/movements",
  authenticate,
  requireAdminOrModerator,
  async (req, res) => {
    try {
      const productId = typeof req.query.productId === "string" ? req.query.productId : undefined;
      const type = typeof req.query.type === "string" ? req.query.type : undefined;
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
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.inventoryMovement.count({ where }),
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
            { stockStatus: "LOW_STOCK" },
            { stockStatus: "OUT_OF_STOCK" },
          ],
        },
        include: {
          brand: true,
          category: true,
          inventoryBatches: {
            where: { remainingQuantity: { gt: 0 } },
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
