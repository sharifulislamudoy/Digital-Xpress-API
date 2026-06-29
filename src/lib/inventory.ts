import { Prisma, StockStatus, InventoryMovementType } from "@prisma/client";
import { prisma } from "./prisma";

type Tx = Prisma.TransactionClient;

type ProductStockShape = {
  id: string;
  name?: string | null;
  stock: number;
  stockStatus: StockStatus;
  lowStockAlertQuantity: number;
  costPrice?: Prisma.Decimal | number | string | null;
};

type ActorInput = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};

const orderWithUserAndItemsInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      mobile: true,
    },
  },
  items: true,
} satisfies Prisma.OrderInclude;

export type OrderWithUserAndItems = Prisma.OrderGetPayload<{
  include: typeof orderWithUserAndItemsInclude;
}>;

export type InventoryCostBreakdownItem = {
  batchId: string | null;
  batchNo: string | null;
  quantity: number;
  unitCostPrice: number;
  totalCost: number;
  source: "batch" | "legacy" | "backorder";
};

export type ConsumeInventoryResult = {
  unitCostPrice: number;
  totalCost: number;
  breakdown: InventoryCostBreakdownItem[];
};

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

  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toMoney(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;

  return Math.max(Number(parsed.toFixed(2)), 0);
}

function roundMoney(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

export function getStockStatusFromQuantity(
  stock: number,
  currentStatus: StockStatus = "IN_STOCK",
  lowStockAlertQuantity = 5,
): StockStatus {
  if (currentStatus === "PRE_ORDER" || currentStatus === "COMING_SOON") {
    return currentStatus;
  }

  if (stock <= 0) return "OUT_OF_STOCK";
  if (stock <= lowStockAlertQuantity) return "LOW_STOCK";

  return currentStatus === "OUT_OF_STOCK" ? "IN_STOCK" : currentStatus;
}

async function generateBatchNo(tx: Tx) {
  const latest = await tx.inventoryBatch.findFirst({
    where: { batchNo: { startsWith: "IB-" } },
    orderBy: { createdAt: "desc" },
    select: { batchNo: true },
  });

  const latestNumber = latest?.batchNo?.match(/IB-(\d+)/)?.[1];
  let nextNumber = latestNumber ? Number(latestNumber) + 1 : 1;

  while (true) {
    const batchNo = `IB-${String(nextNumber).padStart(6, "0")}`;
    const exists = await tx.inventoryBatch.findUnique({
      where: { batchNo },
      select: { id: true },
    });

    if (!exists) return batchNo;
    nextNumber += 1;
  }
}

export async function refreshProductInventorySummary(
  tx: Tx,
  productId: string,
  options?: {
    keepManualStatus?: boolean;
  },
) {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      stockStatus: true,
      lowStockAlertQuantity: true,
    },
  });

  if (!product) throw new Error("Product not found");

  const batches = await tx.inventoryBatch.findMany({
    where: { productId, remainingQuantity: { gt: 0 } },
    select: {
      remainingQuantity: true,
      unitCostPrice: true,
      purchaseDate: true,
      createdAt: true,
    },
    orderBy: [{ purchaseDate: "asc" }, { createdAt: "asc" }],
  });

  const stock = batches.reduce(
    (sum, batch) => sum + batch.remainingQuantity,
    0,
  );
  const stockValue = batches.reduce(
    (sum, batch) =>
      sum + batch.remainingQuantity * decimalToNumber(batch.unitCostPrice),
    0,
  );
  const averageCost = stock > 0 ? stockValue / stock : 0;

  const latestBatch = await tx.inventoryBatch.findFirst({
    where: { productId },
    orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
    select: { unitCostPrice: true },
  });

  const stockStatus = options?.keepManualStatus
    ? product.stockStatus
    : getStockStatusFromQuantity(
        stock,
        product.stockStatus,
        product.lowStockAlertQuantity,
      );

  return tx.product.update({
    where: { id: productId },
    data: {
      stock,
      stockValue: roundMoney(stockValue),
      averageCost: roundMoney(averageCost),
      lastPurchaseCost: latestBatch ? latestBatch.unitCostPrice : null,
      costPrice: latestBatch ? latestBatch.unitCostPrice : 0,
      stockStatus,
      inStock: stockStatus !== "OUT_OF_STOCK" && stock > 0,
    },
  });
}

export async function createPurchaseBatch(
  tx: Tx,
  input: {
    productId: string;
    quantity: number;
    unitCostPrice: number;
    mrp?: number | null;
    sellingPrice?: number | null;
    supplierName?: string | null;
    supplierPhone?: string | null;
    supplierInvoiceNumber?: string | null;
    purchaseDate?: Date | null;
    note?: string | null;
    actor?: ActorInput | null;
    updateProductPrice?: boolean;
  },
) {
  const quantity = Math.max(Math.trunc(Number(input.quantity || 0)), 0);
  const unitCostPrice = toMoney(input.unitCostPrice);

  if (!input.productId) throw new Error("Product is required");
  if (quantity <= 0)
    throw new Error("Purchase quantity must be greater than 0");
  if (unitCostPrice <= 0)
    throw new Error("Unit cost price must be greater than 0");

  const product = await tx.product.findUnique({
    where: { id: input.productId },
    select: { id: true },
  });

  if (!product) throw new Error("Product not found");

  const totalCost = roundMoney(quantity * unitCostPrice);
  const batchNo = await generateBatchNo(tx);

  const batch = await tx.inventoryBatch.create({
    data: {
      productId: input.productId,
      batchNo,
      purchaseQuantity: quantity,
      remainingQuantity: quantity,
      unitCostPrice,
      mrp:
        input.mrp === null || input.mrp === undefined
          ? undefined
          : toMoney(input.mrp),
      sellingPrice:
        input.sellingPrice === null || input.sellingPrice === undefined
          ? undefined
          : toMoney(input.sellingPrice),
      totalCost,
      supplierName: input.supplierName || null,
      supplierPhone: input.supplierPhone || null,
      supplierInvoiceNumber: input.supplierInvoiceNumber || null,
      purchaseDate: input.purchaseDate || new Date(),
      note: input.note || null,
      createdById: input.actor?.id || null,
      createdByName: input.actor?.name || null,
      createdByEmail: input.actor?.email || null,
    },
  });

  await tx.inventoryMovement.create({
    data: {
      productId: input.productId,
      batchId: batch.id,
      type: "PURCHASE",
      quantity,
      unitCostPrice,
      totalCost,
      reason: input.note || "Stock purchase",
      referenceType: "PURCHASE_BATCH",
      referenceNo: batch.batchNo,
      createdById: input.actor?.id || null,
      createdByName: input.actor?.name || null,
      createdByEmail: input.actor?.email || null,
    },
  });

  if (input.updateProductPrice) {
    await tx.product.update({
      where: { id: input.productId },
      data: {
        ...(input.mrp !== null && input.mrp !== undefined
          ? { mrp: toMoney(input.mrp) }
          : {}),
        ...(input.sellingPrice !== null && input.sellingPrice !== undefined
          ? { sellingPrice: toMoney(input.sellingPrice) }
          : {}),
        costPrice: unitCostPrice,
      },
    });
  }

  await refreshProductInventorySummary(tx, input.productId);

  return batch;
}

export async function consumeFifoInventory(
  tx: Tx,
  input: {
    product: ProductStockShape;
    quantity: number;
    referenceType?: string;
    referenceNo?: string;
    reason?: string;
    actor?: ActorInput | null;
    allowLegacyStockFallback?: boolean;
    allowOutOfStockOrder?: boolean;
  },
): Promise<ConsumeInventoryResult> {
  const product = input.product;
  const quantity = Math.max(Math.trunc(Number(input.quantity || 0)), 0);
  const allowOutOfStockOrder = input.allowOutOfStockOrder ?? true;

  if (quantity <= 0) throw new Error("Quantity must be greater than 0");

  if (product.stockStatus === "PRE_ORDER") {
    const unitCostPrice = decimalToNumber(product.costPrice);
    const totalCost = roundMoney(unitCostPrice * quantity);

    await tx.inventoryMovement.create({
      data: {
        productId: product.id,
        type: "SALE",
        quantity: -quantity,
        unitCostPrice,
        totalCost,
        reason: input.reason || "Pre-order accepted",
        referenceType: input.referenceType || "ORDER",
        referenceNo: input.referenceNo || null,
        createdById: input.actor?.id || null,
        createdByName: input.actor?.name || null,
        createdByEmail: input.actor?.email || null,
      },
    });

    await tx.product.update({
      where: { id: product.id },
      data: {
        soldQuantity: { increment: quantity },
      },
    });

    return {
      unitCostPrice,
      totalCost,
      breakdown: [
        {
          batchId: null,
          batchNo: null,
          quantity,
          unitCostPrice,
          totalCost,
          source: "backorder",
        },
      ],
    };
  }

  const latestProduct = await tx.product.findUnique({
    where: { id: product.id },
    select: {
      id: true,
      name: true,
      stock: true,
      stockStatus: true,
      inStock: true,
      lowStockAlertQuantity: true,
      costPrice: true,
      averageCost: true,
      lastPurchaseCost: true,
    },
  });

  if (!latestProduct) throw new Error("Product not found");

  if (!allowOutOfStockOrder) {
    if (!latestProduct.inStock || latestProduct.stockStatus === "OUT_OF_STOCK") {
      throw new Error(`${latestProduct.name} is out of stock`);
    }

    if (latestProduct.stock < quantity) {
      throw new Error(
        `Only ${latestProduct.stock} item(s) available for ${latestProduct.name}`,
      );
    }
  }

  let requiredQty = quantity;
  let stockDeductQuantity = 0;
  let totalCost = 0;
  const breakdown: InventoryCostBreakdownItem[] = [];

  const fallbackUnitCost =
    decimalToNumber(latestProduct.costPrice) ||
    decimalToNumber(latestProduct.lastPurchaseCost) ||
    decimalToNumber(latestProduct.averageCost);

  const batches = await tx.inventoryBatch.findMany({
    where: {
      productId: product.id,
      remainingQuantity: { gt: 0 },
    },
    orderBy: [{ purchaseDate: "asc" }, { createdAt: "asc" }],
  });

  for (const batch of batches) {
    if (requiredQty <= 0) break;

    const usedQty = Math.min(requiredQty, batch.remainingQuantity);
    const unitCostPrice = decimalToNumber(batch.unitCostPrice);
    const lineCost = roundMoney(usedQty * unitCostPrice);

    const updated = await tx.inventoryBatch.updateMany({
      where: {
        id: batch.id,
        remainingQuantity: { gte: usedQty },
      },
      data: {
        remainingQuantity: { decrement: usedQty },
      },
    });

    if (updated.count === 0) {
      throw new Error(
        "Stock changed while processing order. Please try again.",
      );
    }

    await tx.inventoryMovement.create({
      data: {
        productId: product.id,
        batchId: batch.id,
        type: "SALE",
        quantity: -usedQty,
        unitCostPrice,
        totalCost: lineCost,
        reason: input.reason || "Order checkout stock deduction",
        referenceType: input.referenceType || "ORDER",
        referenceNo: input.referenceNo || null,
        createdById: input.actor?.id || null,
        createdByName: input.actor?.name || null,
        createdByEmail: input.actor?.email || null,
      },
    });

    breakdown.push({
      batchId: batch.id,
      batchNo: batch.batchNo,
      quantity: usedQty,
      unitCostPrice,
      totalCost: lineCost,
      source: "batch",
    });

    totalCost += lineCost;
    stockDeductQuantity += usedQty;
    requiredQty -= usedQty;
  }

  if (requiredQty > 0 && input.allowLegacyStockFallback) {
    const legacyAvailableQty = allowOutOfStockOrder
      ? Math.min(requiredQty, Math.max(latestProduct.stock - stockDeductQuantity, 0))
      : requiredQty;

    if (legacyAvailableQty > 0) {
      const lineCost = roundMoney(legacyAvailableQty * fallbackUnitCost);

      await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          type: "SALE",
          quantity: -legacyAvailableQty,
          unitCostPrice: fallbackUnitCost,
          totalCost: lineCost,
          reason: "Legacy stock fallback deduction",
          referenceType: input.referenceType || "ORDER",
          referenceNo: input.referenceNo || null,
          createdById: input.actor?.id || null,
          createdByName: input.actor?.name || null,
          createdByEmail: input.actor?.email || null,
        },
      });

      breakdown.push({
        batchId: null,
        batchNo: null,
        quantity: legacyAvailableQty,
        unitCostPrice: fallbackUnitCost,
        totalCost: lineCost,
        source: "legacy",
      });

      totalCost += lineCost;
      stockDeductQuantity += legacyAvailableQty;
      requiredQty -= legacyAvailableQty;
    }
  }

  if (requiredQty > 0) {
    if (!allowOutOfStockOrder) {
      throw new Error(
        `Inventory stock is not enough for ${latestProduct.name}. Add opening stock first.`,
      );
    }

    const lineCost = roundMoney(requiredQty * fallbackUnitCost);

    await tx.inventoryMovement.create({
      data: {
        productId: product.id,
        type: "SALE",
        quantity: -requiredQty,
        unitCostPrice: fallbackUnitCost,
        totalCost: lineCost,
        reason: input.reason || "Out-of-stock order accepted",
        referenceType: input.referenceType || "ORDER",
        referenceNo: input.referenceNo || null,
        createdById: input.actor?.id || null,
        createdByName: input.actor?.name || null,
        createdByEmail: input.actor?.email || null,
      },
    });

    breakdown.push({
      batchId: null,
      batchNo: null,
      quantity: requiredQty,
      unitCostPrice: fallbackUnitCost,
      totalCost: lineCost,
      source: "backorder",
    });

    totalCost += lineCost;
    requiredQty = 0;
  }

  await tx.product.update({
    where: { id: product.id },
    data: {
      ...(stockDeductQuantity > 0
        ? {
            stock: { decrement: stockDeductQuantity },
          }
        : {}),
      soldQuantity: { increment: quantity },
    },
  });

  const afterProduct = await tx.product.findUnique({
    where: { id: product.id },
    select: {
      stock: true,
      stockStatus: true,
      lowStockAlertQuantity: true,
    },
  });

  if (afterProduct) {
    const nextStatus = getStockStatusFromQuantity(
      afterProduct.stock,
      afterProduct.stockStatus,
      afterProduct.lowStockAlertQuantity,
    );

    await tx.product.update({
      where: { id: product.id },
      data: {
        stockStatus: nextStatus,
        inStock: nextStatus !== "OUT_OF_STOCK" && afterProduct.stock > 0,
      },
    });
  }

  const unitCostPrice = quantity > 0 ? roundMoney(totalCost / quantity) : 0;

  return {
    unitCostPrice,
    totalCost: roundMoney(totalCost),
    breakdown,
  };
}

function parseBreakdown(value: unknown): InventoryCostBreakdownItem[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as InventoryCostBreakdownItem[];

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

export async function restoreInventoryForOrder(
  tx: Tx,
  input: {
    orderId: string;
    movementType: Extract<
      InventoryMovementType,
      "CANCEL_RESTORE" | "RETURN_RESTORE"
    >;
    reason?: string;
    actor?: ActorInput | null;
  },
) {
  const order = await tx.order.findUnique({
    where: { id: input.orderId },
    include: { items: true },
  });

  if (!order) throw new Error("Order not found");
  if (order.inventoryRestoredAt) return order;

  for (const item of order.items) {
    if (!item.productId) continue;

    const breakdown = parseBreakdown(item.costBreakdown);
    let shouldRefreshProductStock = false;

    if (breakdown.length === 0) {
      const unitCostPrice = decimalToNumber(item.unitCostPrice);
      const batch = await createPurchaseBatch(tx, {
        productId: item.productId,
        quantity: item.quantity,
        unitCostPrice: unitCostPrice > 0 ? unitCostPrice : 1,
        note: `Stock restored from ${order.invoiceNo}`,
        actor: input.actor,
        updateProductPrice: false,
      });

      await tx.inventoryMovement.create({
        data: {
          productId: item.productId,
          batchId: batch.id,
          type: input.movementType,
          quantity: item.quantity,
          unitCostPrice,
          totalCost: decimalToNumber(item.totalCost),
          reason: input.reason || `Stock restored from ${order.invoiceNo}`,
          referenceType: "ORDER",
          referenceNo: order.invoiceNo,
          createdById: input.actor?.id || null,
          createdByName: input.actor?.name || null,
          createdByEmail: input.actor?.email || null,
        },
      });

      shouldRefreshProductStock = true;
    } else {
      for (const line of breakdown) {
        const restoreQty = Math.max(Math.trunc(Number(line.quantity || 0)), 0);
        if (restoreQty <= 0) continue;

        // Backorder/out-of-stock quantity did not reduce physical inventory.
        // So cancellation/return must not add new stock for this part.
        if (line.source === "backorder") {
          continue;
        }

        if (line.source === "batch" && line.batchId) {
          await tx.inventoryBatch.update({
            where: { id: line.batchId },
            data: {
              remainingQuantity: { increment: restoreQty },
            },
          });
        } else {
          const batch = await createPurchaseBatch(tx, {
            productId: item.productId,
            quantity: restoreQty,
            unitCostPrice: line.unitCostPrice > 0 ? line.unitCostPrice : 1,
            note: `Legacy stock restored from ${order.invoiceNo}`,
            actor: input.actor,
            updateProductPrice: false,
          });
          line.batchId = batch.id;
          line.batchNo = batch.batchNo;
        }

        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            batchId: line.batchId,
            type: input.movementType,
            quantity: restoreQty,
            unitCostPrice: line.unitCostPrice,
            totalCost: line.totalCost,
            reason: input.reason || `Stock restored from ${order.invoiceNo}`,
            referenceType: "ORDER",
            referenceNo: order.invoiceNo,
            createdById: input.actor?.id || null,
            createdByName: input.actor?.name || null,
            createdByEmail: input.actor?.email || null,
          },
        });

        shouldRefreshProductStock = true;
      }
    }

    await tx.product.update({
      where: { id: item.productId },
      data: {
        soldQuantity: { decrement: item.quantity },
      },
    });

    if (shouldRefreshProductStock) {
      await refreshProductInventorySummary(tx, item.productId);
    }
  }

  return tx.order.update({
    where: { id: order.id },
    data: {
      inventoryRestoredAt: new Date(),
    },
    include: orderWithUserAndItemsInclude,
  });
}

export const FIXED_PACKAGING_COST = 20;

export function calculateNetProfit(input: {
  totalAmount: number;
  deliveryCharge: number;
  productCostTotal: number;
  actualCourierCost?: number;
  packagingCost?: number;
}) {
  /**
   * Digital Xpress formula:
   * totalAmount = final discounted product selling total.
   * net profit = totalAmount - productCostTotal + customer delivery charge
   *              - courier company cost - fixed packaging cost.
   *
   * Coupon discount is already deducted from totalAmount and saved separately
   * on Order.discountAmount / Order.couponDiscountAmount for reporting.
   */
  const productSalesProfit = roundMoney(input.totalAmount - input.productCostTotal);
  const packagingCost =
    input.packagingCost === undefined ? FIXED_PACKAGING_COST : toMoney(input.packagingCost);

  const netProfit = roundMoney(
    productSalesProfit +
      toMoney(input.deliveryCharge) -
      toMoney(input.actualCourierCost) -
      packagingCost,
  );

  return { grossProfit: productSalesProfit, netProfit };
}

export async function recalculateOrderProfitById(
  tx: Tx,
  orderId: string,
  overrides?: Partial<{
    actualCourierCost: number;
    packagingCost: number;
    paymentFee: number;
    otherCost: number;
  }>,
): Promise<OrderWithUserAndItems> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) throw new Error("Order not found");

  const productCostTotal = roundMoney(
    order.items.reduce((sum, item) => sum + decimalToNumber(item.totalCost), 0),
  );

  const financial = calculateNetProfit({
    totalAmount: decimalToNumber(order.totalAmount),
    deliveryCharge: decimalToNumber(order.deliveryCharge),
    productCostTotal,
    actualCourierCost:
      overrides?.actualCourierCost ?? decimalToNumber(order.actualCourierCost),
    packagingCost:
      overrides?.packagingCost ?? FIXED_PACKAGING_COST,
  });

  return tx.order.update({
    where: { id: order.id },
    data: {
      productCostTotal,
      grossProfit: financial.grossProfit,
      netProfit: financial.netProfit,
      ...(overrides?.actualCourierCost !== undefined
        ? { actualCourierCost: toMoney(overrides.actualCourierCost) }
        : {}),
      ...(overrides?.packagingCost !== undefined
        ? { packagingCost: toMoney(overrides.packagingCost) }
        : {}),
      ...(overrides?.paymentFee !== undefined
        ? { paymentFee: toMoney(overrides.paymentFee) }
        : {}),
      ...(overrides?.otherCost !== undefined
        ? { otherCost: toMoney(overrides.otherCost) }
        : {}),
    },
    include: orderWithUserAndItemsInclude,
  });
}

export async function seedOpeningStockForExistingProducts(
  actor?: ActorInput | null,
) {
  return prisma.$transaction(async (tx) => {
    const products = await tx.product.findMany({
      where: {
        stock: { gt: 0 },
      },
      select: {
        id: true,
        stock: true,
        costPrice: true,
      },
    });

    let created = 0;

    for (const product of products) {
      const batchCount = await tx.inventoryBatch.count({
        where: { productId: product.id },
      });

      if (batchCount > 0) continue;

      const costPrice = decimalToNumber(product.costPrice);
      if (costPrice <= 0) continue;

      await createPurchaseBatch(tx, {
        productId: product.id,
        quantity: product.stock,
        unitCostPrice: costPrice,
        note: "Opening stock migration",
        actor,
        updateProductPrice: false,
      });

      created += 1;
    }

    return { created };
  });
}
