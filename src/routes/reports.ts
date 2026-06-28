import { Router, type Response } from "express";
import { Prisma, type OrderStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  authenticate,
  requireAdminOrModerator,
  type AuthRequest,
} from "../middleware/auth";
import {
  calculateNetProfit,
  decimalToNumber,
  FIXED_PACKAGING_COST,
} from "../lib/inventory";

const router = Router();

type ProfitReportStatus = "completed" | "delivered" | "returned";

type OrderForReport = Prisma.OrderGetPayload<{
  include: {
    items: {
      include: {
        product: {
          select: {
            id: true;
            name: true;
            sku: true;
            costPrice: true;
            sellingPrice: true;
          };
        };
      };
    };
  };
}>;

function sendError(res: Response, error: unknown, fallback = "Server error") {
  console.error(error);
  const message = error instanceof Error ? error.message : fallback;
  return res.status(500).json({ success: false, message });
}

function money(value: unknown) {
  const parsed = Number(value);
  return Number((Number.isFinite(parsed) ? parsed : 0).toFixed(2));
}

function parseDateParam(value: unknown, fallback: Date) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function getProfitReportStatus(value: unknown): ProfitReportStatus {
  const raw =
    typeof value === "string" ? value.trim().toLowerCase() : "completed";

  if (raw === "delivered") return "delivered";
  if (raw === "returned" || raw === "return") return "returned";

  return "completed";
}

function getStatusFilter(status: ProfitReportStatus): OrderStatus[] {
  if (status === "delivered") return ["delivered"];
  if (status === "returned") return ["returned"];
  return ["delivered", "returned"];
}

function itemCost(item: OrderForReport["items"][number]) {
  const savedTotalCost = decimalToNumber(item.totalCost);
  if (savedTotalCost > 0) return savedTotalCost;

  const savedUnitCost = decimalToNumber(item.unitCostPrice);
  if (savedUnitCost > 0) return money(savedUnitCost * item.quantity);

  const productCost = decimalToNumber(item.product?.costPrice);
  if (productCost > 0) return money(productCost * item.quantity);

  return 0;
}

function itemProfit(item: OrderForReport["items"][number]) {
  const cost = itemCost(item);
  return money(decimalToNumber(item.totalPrice) - cost);
}

function normalizeOrder(order: OrderForReport) {
  const totalAmount = decimalToNumber(order.totalAmount);
  const deliveryCharge = decimalToNumber(order.deliveryCharge);
  const discountAmount = decimalToNumber(order.discountAmount);
  const paidAmount = decimalToNumber(order.paidAmount);
  const dueAmount = decimalToNumber(order.dueAmount);
  const codAmount = decimalToNumber(order.codAmount);
  const actualCourierCost = decimalToNumber(order.actualCourierCost);
  const packagingCost =
    decimalToNumber(order.packagingCost) || FIXED_PACKAGING_COST;
  const paymentFee = decimalToNumber(order.paymentFee);
  const otherCost = decimalToNumber(order.otherCost);

  const productCostTotal = money(
    order.items.reduce((sum, item) => sum + itemCost(item), 0),
  );

  const financial = calculateNetProfit({
    totalAmount,
    deliveryCharge,
    productCostTotal,
    actualCourierCost,
    packagingCost,
  });

  return {
    ...order,
    totalAmount,
    deliveryCharge,
    discountAmount,
    paidAmount,
    dueAmount,
    codAmount,
    productCostTotal,
    grossProfit: financial.grossProfit,
    actualCourierCost,
    packagingCost,
    paymentFee,
    otherCost,
    netProfit: financial.netProfit,
    items: order.items.map((item) => ({
      ...item,
      unitPrice: decimalToNumber(item.unitPrice),
      totalPrice: decimalToNumber(item.totalPrice),
      unitCostPrice:
        decimalToNumber(item.unitCostPrice) ||
        decimalToNumber(item.product?.costPrice),
      totalCost: itemCost(item),
      profit: itemProfit(item),
    })),
  };
}

router.get(
  "/profit-loss",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const now = new Date();
      const defaultFrom = new Date(now);
      defaultFrom.setDate(defaultFrom.getDate() - 30);

      const from = startOfDay(parseDateParam(req.query.from, defaultFrom));
      const to = endOfDay(parseDateParam(req.query.to, now));
      const reportStatus = getProfitReportStatus(req.query.status);
      const statusFilter = getStatusFilter(reportStatus);

      const orders = await prisma.order.findMany({
        where: {
          status: { in: statusFilter },
          createdAt: {
            gte: from,
            lte: to,
          },
        },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  costPrice: true,
                  sellingPrice: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 1000,
      });

      const normalizedOrders = orders.map(normalizeOrder);

      const summary = normalizedOrders.reduce(
        (acc, order) => {
          acc.orderCount += 1;
          acc.totalSales += order.totalAmount;
          acc.deliveryCharge += order.deliveryCharge;
          acc.productCostTotal += order.productCostTotal;
          acc.grossProfit += order.grossProfit;
          acc.actualCourierCost += order.actualCourierCost;
          acc.packagingCost += order.packagingCost;
          acc.netProfit += order.netProfit;
          return acc;
        },
        {
          orderCount: 0,
          totalSales: 0,
          deliveryCharge: 0,
          productCostTotal: 0,
          grossProfit: 0,
          actualCourierCost: 0,
          packagingCost: 0,
          netProfit: 0,
        },
      );

      const statusBreakdownMap = new Map<
        OrderStatus,
        {
          status: OrderStatus;
          orderCount: number;
          totalSales: number;
          productCostTotal: number;
          grossProfit: number;
          actualCourierCost: number;
          packagingCost: number;
          netProfit: number;
        }
      >();

      (["delivered", "returned"] as OrderStatus[]).forEach((status) => {
        statusBreakdownMap.set(status, {
          status,
          orderCount: 0,
          totalSales: 0,
          productCostTotal: 0,
          grossProfit: 0,
          actualCourierCost: 0,
          packagingCost: 0,
          netProfit: 0,
        });
      });

      for (const order of normalizedOrders) {
        const current = statusBreakdownMap.get(order.status);
        if (!current) continue;

        current.orderCount += 1;
        current.totalSales += order.totalAmount;
        current.productCostTotal += order.productCostTotal;
        current.grossProfit += order.grossProfit;
        current.actualCourierCost += order.actualCourierCost;
        current.packagingCost += order.packagingCost;
        current.netProfit += order.netProfit;
      }

      const productMap = new Map<
        string,
        {
          productId: string | null;
          productName: string;
          sku: string | null;
          quantity: number;
          totalSales: number;
          totalCost: number;
          profit: number;
        }
      >();

      for (const order of normalizedOrders) {
        for (const item of order.items) {
          const key = item.productId || item.productName;
          const current = productMap.get(key) || {
            productId: item.productId,
            productName: item.productName,
            sku: item.sku || item.product?.sku || null,
            quantity: 0,
            totalSales: 0,
            totalCost: 0,
            profit: 0,
          };

          current.quantity += item.quantity;
          current.totalSales += item.totalPrice;
          current.totalCost += item.totalCost;
          current.profit += item.profit;
          productMap.set(key, current);
        }
      }

      const productProfit = Array.from(productMap.values())
        .map((item) => ({
          ...item,
          totalSales: money(item.totalSales),
          totalCost: money(item.totalCost),
          profit: money(item.profit),
          profitMargin:
            item.totalSales > 0 ? money((item.profit / item.totalSales) * 100) : 0,
        }))
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 50);

      const missingCostItems = normalizedOrders.flatMap((order) =>
        order.items
          .filter((item) => item.totalCost <= 0)
          .map((item) => ({
            invoiceNo: order.invoiceNo,
            productId: item.productId,
            productName: item.productName,
            sku: item.sku || null,
            quantity: item.quantity,
          })),
      );

      return res.json({
        success: true,
        range: {
          from: from.toISOString(),
          to: to.toISOString(),
          status: reportStatus,
        },
        formula:
          "netProfit = totalSales - productCostTotal + deliveryCharge - actualCourierCost - packagingCost",
        summary: Object.fromEntries(
          Object.entries(summary).map(([key, value]) => [
            key,
            key === "orderCount" ? value : money(value),
          ]),
        ),
        statusBreakdown: Array.from(statusBreakdownMap.values()).map(
          (item) => ({
            ...item,
            totalSales: money(item.totalSales),
            productCostTotal: money(item.productCostTotal),
            grossProfit: money(item.grossProfit),
            actualCourierCost: money(item.actualCourierCost),
            packagingCost: money(item.packagingCost),
            netProfit: money(item.netProfit),
          }),
        ),
        productProfit,
        missingCostItems,
        warning:
          missingCostItems.length > 0
            ? "Some sold items have no cost price. Add product cost or purchase batch, then recalculate profit."
            : null,
        orders: normalizedOrders.slice(0, 100),
      });
    } catch (error) {
      return sendError(res, error, "Failed to load profit/loss report");
    }
  },
);

router.post(
  "/profit-loss/recalculate",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const invoiceNo =
        typeof req.body.invoiceNo === "string" ? req.body.invoiceNo.trim() : "";

      const where: Prisma.OrderWhereInput = invoiceNo
        ? { invoiceNo }
        : { status: { in: ["delivered", "returned"] } };

      const orders = await prisma.order.findMany({
        where,
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  costPrice: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: invoiceNo ? 1 : 1000,
      });

      let updatedOrders = 0;
      let updatedItems = 0;
      const missingCostItems: Array<{
        invoiceNo: string;
        productId: string | null;
        productName: string;
      }> = [];

      await prisma.$transaction(async (tx) => {
        for (const order of orders) {
          let productCostTotal = 0;

          for (const item of order.items) {
            const savedTotalCost = decimalToNumber(item.totalCost);
            let totalCost = savedTotalCost;

            if (totalCost <= 0) {
              const unitCost =
                decimalToNumber(item.unitCostPrice) ||
                decimalToNumber(item.product?.costPrice);

              if (unitCost > 0) {
                totalCost = money(unitCost * item.quantity);
                const profit = money(decimalToNumber(item.totalPrice) - totalCost);

                await tx.orderItem.update({
                  where: { id: item.id },
                  data: {
                    unitCostPrice: unitCost,
                    totalCost,
                    profit,
                  },
                });

                updatedItems += 1;
              } else {
                missingCostItems.push({
                  invoiceNo: order.invoiceNo,
                  productId: item.productId,
                  productName: item.productName,
                });
              }
            }

            productCostTotal += totalCost;
          }

          const packagingCost =
            decimalToNumber(order.packagingCost) || FIXED_PACKAGING_COST;

          const financial = calculateNetProfit({
            totalAmount: decimalToNumber(order.totalAmount),
            deliveryCharge: decimalToNumber(order.deliveryCharge),
            productCostTotal,
            actualCourierCost: decimalToNumber(order.actualCourierCost),
            packagingCost,
          });

          await tx.order.update({
            where: { id: order.id },
            data: {
              productCostTotal: money(productCostTotal),
              grossProfit: financial.grossProfit,
              packagingCost,
              netProfit: financial.netProfit,
            },
          });

          updatedOrders += 1;
        }
      });

      return res.json({
        success: true,
        message: "Profit recalculated successfully",
        updatedOrders,
        updatedItems,
        missingCostItems,
      });
    } catch (error) {
      return sendError(res, error, "Failed to recalculate profit");
    }
  },
);

router.get(
  "/inventory-valuation",
  authenticate,
  requireAdminOrModerator,
  async (_req, res) => {
    try {
      const products = await prisma.product.findMany({
        where: { stock: { gt: 0 } },
        include: {
          brand: true,
          category: true,
        },
        orderBy: { stockValue: "desc" },
      });

      const rows = products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        brandName: product.brand?.name || null,
        categoryName: product.category?.name || null,
        stock: product.stock,
        averageCost: decimalToNumber(product.averageCost),
        lastPurchaseCost: decimalToNumber(product.lastPurchaseCost),
        stockValue: decimalToNumber(product.stockValue),
        sellingPrice: decimalToNumber(product.sellingPrice),
        retailValue: money(decimalToNumber(product.sellingPrice) * product.stock),
      }));

      const summary = rows.reduce(
        (acc, row) => {
          acc.productCount += 1;
          acc.totalStock += row.stock;
          acc.stockValue += row.stockValue;
          acc.retailValue += row.retailValue;
          return acc;
        },
        {
          productCount: 0,
          totalStock: 0,
          stockValue: 0,
          retailValue: 0,
        },
      );

      return res.json({
        success: true,
        summary: {
          ...summary,
          stockValue: money(summary.stockValue),
          retailValue: money(summary.retailValue),
          potentialProfit: money(summary.retailValue - summary.stockValue),
        },
        rows,
      });
    } catch (error) {
      return sendError(res, error, "Failed to load inventory valuation");
    }
  },
);

export default router;
