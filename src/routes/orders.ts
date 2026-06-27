import { Router, type Response } from "express";
import {
  Prisma,
  type Order,
  type OrderItem,
  OrderStatus,
  PaymentStatus,
  DeliveryType,
  StockStatus,
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  authenticate,
  requireAdminOrModerator,
  type AuthRequest,
} from "../middleware/auth";
import {
  type OrderMailData,
  sendOrderDeliveredEmail,
  sendOrderPlacedEmail,
  sendOrderProcessingEmail,
  sendOrderShippedEmail,
} from "../lib/email";
import {
  calculateNetProfit,
  recalculateOrderProfitById,
} from "../lib/inventory";

const router = Router();

const DHAKA_DELIVERY_CHARGE = 80;
const OUTSIDE_DHAKA_DELIVERY_CHARGE = 130;

const allowedOrderStatuses: OrderStatus[] = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "returned",
  "cancelled",
];

const cancellableStatuses: OrderStatus[] = ["pending"];

type CheckoutItemInput = {
  id?: unknown;
  productId?: unknown;
  quantity?: unknown;
};

type NormalizedCheckoutItem = {
  productId: string;
  quantity: number;
};

type ProductForCheckout = Prisma.ProductGetPayload<{
  select: {
    id: true;
    name: true;
    slug: true;
    sku: true;
    mainImageUrl: true;
    sellingPrice: true;
    costPrice: true;
    stock: true;
    lowStockAlertQuantity: true;
    stockStatus: true;
    inStock: true;
    isPublished: true;
  };
}>;

const orderUserSelect = {
  id: true,
  name: true,
  email: true,
  mobile: true,
} satisfies Prisma.UserSelect;

const orderWithItemsInclude = {
  user: {
    select: orderUserSelect,
  },
  items: true,
} satisfies Prisma.OrderInclude;

type OrderUserForResponse = {
  id: string;
  name: string | null;
  email: string | null;
  mobile: string | null;
} | null;

type OrderWithItems = Order & {
  items?: OrderItem[];
  user?: OrderUserForResponse;
};

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

function requiredString(
  value: unknown,
  fieldName: string,
  maxLength?: number,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }

  const clean = value.trim();

  if (maxLength && clean.length > maxLength) {
    throw new Error(`${fieldName} must be within ${maxLength} characters`);
  }

  return clean;
}

function optionalString(value: unknown, maxLength?: number): string | null {
  if (typeof value !== "string") return null;

  const clean = value.trim();

  if (!clean) return null;
  if (maxLength && clean.length > maxLength) return clean.slice(0, maxLength);

  return clean;
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

function toMoney(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return fallback;

  return Math.max(Number(parsed.toFixed(2)), 0);
}

function normalizePhone(value: unknown, fieldName: string): string;
function normalizePhone(
  value: unknown,
  fieldName: string,
  required: true,
): string;
function normalizePhone(
  value: unknown,
  fieldName: string,
  required: false,
): string | null;
function normalizePhone(
  value: unknown,
  fieldName: string,
  required = true,
): string | null {
  if (!required && (value === undefined || value === null || value === "")) {
    return null;
  }

  let phone = requiredString(value, fieldName).replace(/[^0-9+]/g, "");

  if (phone.startsWith("+88")) phone = phone.slice(3);
  if (phone.startsWith("88") && phone.length === 13) phone = phone.slice(2);

  phone = phone.replace(/\D/g, "");

  if (!/^01\d{9}$/.test(phone)) {
    throw new Error(
      `${fieldName} must be a valid 11 digit Bangladeshi phone number`,
    );
  }

  return phone;
}

function normalizeStatus(value: unknown): OrderStatus | null {
  if (typeof value !== "string") return null;

  const clean = value.trim().toLowerCase();

  if (clean === "return") return "returned";
  if (allowedOrderStatuses.includes(clean as OrderStatus))
    return clean as OrderStatus;

  return null;
}

function normalizeDeliveryType(value: unknown): DeliveryType {
  return value === "point" ? "point" : "home";
}

function getPaymentStatus(total: number, paid: number): PaymentStatus {
  if (paid <= 0) return "unpaid";
  if (paid >= total) return "paid";
  return "partial";
}

function isDhakaDistrict(district: string) {
  return district.trim().toLowerCase().startsWith("dhaka");
}

function calculateDeliveryCharge(district: string) {
  return isDhakaDistrict(district)
    ? DHAKA_DELIVERY_CHARGE
    : OUTSIDE_DHAKA_DELIVERY_CHARGE;
}

function getStatusTimestampData(
  status: OrderStatus,
  existing?: Partial<Order>,
) {
  const now = new Date();

  return {
    ...(status === "shipped" && !existing?.shippedAt ? { shippedAt: now } : {}),
    ...(status === "delivered" && !existing?.deliveredAt
      ? { deliveredAt: now }
      : {}),
    ...(status === "returned" && !existing?.returnedAt
      ? { returnedAt: now }
      : {}),
    ...(status === "cancelled" && !existing?.cancelledAt
      ? { cancelledAt: now }
      : {}),
  };
}

function serializeOrder(order: OrderWithItems) {
  const totalAmount = decimalToNumber(order.totalAmount);
  const deliveryCharge = decimalToNumber(order.deliveryCharge);
  const discountAmount = decimalToNumber(order.discountAmount);
  const paidAmount = decimalToNumber(order.paidAmount);
  const dueAmount = decimalToNumber(order.dueAmount);
  const codAmount = decimalToNumber(order.codAmount);
  const productCostTotal = decimalToNumber((order as any).productCostTotal);
  const grossProfit = decimalToNumber((order as any).grossProfit);
  const actualCourierCost = decimalToNumber((order as any).actualCourierCost);
  const packagingCost = decimalToNumber((order as any).packagingCost);
  const paymentFee = decimalToNumber((order as any).paymentFee);
  const otherCost = decimalToNumber((order as any).otherCost);
  const netProfit = decimalToNumber((order as any).netProfit);

  return {
    ...order,
    totalAmount,
    deliveryCharge,
    discountAmount,
    paidAmount,
    dueAmount,
    codAmount,
    productCostTotal,
    grossProfit,
    actualCourierCost,
    packagingCost,
    paymentFee,
    otherCost,
    netProfit,
    items: Array.isArray(order.items)
      ? order.items.map((item: OrderItem) => ({
          ...item,
          unitPrice: decimalToNumber(item.unitPrice),
          totalPrice: decimalToNumber(item.totalPrice),
          unitCostPrice: decimalToNumber((item as any).unitCostPrice),
          totalCost: decimalToNumber((item as any).totalCost),
          profit: decimalToNumber((item as any).profit),
        }))
      : [],
  };
}

function toOrderMailData(order: OrderWithItems): OrderMailData {
  const serialized = serializeOrder(order);

  return {
    invoiceNo: serialized.invoiceNo,
    customerName: serialized.customerName,
    customerEmail: serialized.customerEmail || serialized.user?.email || null,
    recipientEmail: serialized.recipientEmail,
    customerPhone: serialized.customerPhone,
    customerAddress: serialized.customerAddress,
    district: serialized.district,
    thana: serialized.thana,
    deliveryType: serialized.deliveryType,
    totalAmount: serialized.totalAmount,
    deliveryCharge: serialized.deliveryCharge,
    discountAmount: serialized.discountAmount,
    paidAmount: serialized.paidAmount,
    dueAmount: serialized.dueAmount,
    codAmount: serialized.codAmount,
    status: serialized.status,
    courierName: serialized.courierName,
    courierTrackingNumber: serialized.courierTrackingNumber,
    courierNote: serialized.courierNote,
    createdAt: serialized.createdAt,
    items: serialized.items.map((item) => ({
      productName: item.productName,
      productImage: item.productImage,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
    })),
  };
}

async function safeSendOrderEmail(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    console.error("Order email send failed:", error);
  }
}

async function sendStatusChangeEmail(
  previousStatus: OrderStatus,
  order: OrderWithItems,
) {
  const mailData = toOrderMailData(order);

  if (previousStatus === order.status) return;

  if (previousStatus === "pending" && order.status === "processing") {
    await safeSendOrderEmail(() => sendOrderProcessingEmail(mailData));
  }

  if (previousStatus === "processing" && order.status === "shipped") {
    await safeSendOrderEmail(() => sendOrderShippedEmail(mailData));
  }

  if (order.status === "delivered") {
    await safeSendOrderEmail(() => sendOrderDeliveredEmail(mailData));
  }
}

async function generateInvoiceNo(
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const latest = await tx.order.findFirst({
    where: { invoiceNo: { startsWith: "DX-" } },
    orderBy: { createdAt: "desc" },
    select: { invoiceNo: true },
  });

  const latestNumber = latest?.invoiceNo?.match(/DX-(\d+)/)?.[1];
  let nextNumber = latestNumber ? Number(latestNumber) + 1 : 1;

  while (true) {
    const invoiceNo = `DX-${String(nextNumber).padStart(6, "0")}`;
    const exists = await tx.order.findUnique({
      where: { invoiceNo },
      select: { id: true },
    });

    if (!exists) return invoiceNo;

    nextNumber += 1;
  }
}

function canBuyProduct(product: {
  stockStatus: StockStatus;
  inStock: boolean;
  isPublished: boolean;
  stock: number;
}) {
  // Business rule:
  // product.stock can be 0 or negative and order will still be accepted.
  // Only admin/moderator manual unavailable state blocks checkout.
  if (!product.isPublished) return false;
  if (product.inStock === false) return false;
  if (product.stockStatus === "OUT_OF_STOCK") return false;
  if (product.stockStatus === "COMING_SOON") return false;

  return true;
}

function normalizeCheckoutItems(itemsInput: unknown): NormalizedCheckoutItem[] {
  if (!Array.isArray(itemsInput)) return [];

  const quantityMap = new Map<string, number>();

  itemsInput.forEach((rawItem: CheckoutItemInput) => {
    const productId =
      typeof rawItem.productId === "string"
        ? rawItem.productId
        : typeof rawItem.id === "string"
          ? rawItem.id
          : "";

    if (!productId) return;

    const quantity = Math.max(Math.trunc(Number(rawItem.quantity || 1)), 1);
    quantityMap.set(productId, (quantityMap.get(productId) || 0) + quantity);
  });

  return Array.from(quantityMap.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

function getInvoiceNos(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (invoice: unknown): invoice is string => typeof invoice === "string",
    )
    .map((invoice: string) => invoice.trim())
    .filter((invoice: string) => invoice.length > 0);
}

async function getOrderByInvoice(invoiceNo: string) {
  return prisma.order.findUnique({
    where: { invoiceNo },
    include: {
      user: { select: { id: true, name: true, email: true, mobile: true } },
      items: { orderBy: { createdAt: "asc" } },
    },
  });
}

async function deductProductStocksAfterOrder(
  tx: Prisma.TransactionClient,
  items: NormalizedCheckoutItem[],
  productMap: Map<string, ProductForCheckout>,
) {
  for (const item of items) {
    const product = productMap.get(item.productId);

    if (!product) {
      throw new Error("Product not found");
    }

    if (!canBuyProduct(product)) {
      throw new Error(`${product.name} is not available for checkout`);
    }

    /**
     * FINAL RULE:
     * - stock can become 0
     * - stock can become negative
     * - stockStatus will NOT change automatically
     * - inStock will NOT change automatically
     *
     * Example: current stock 0, order quantity 5 => database stock becomes -5.
     * Admin/moderator will manually choose OUT_OF_STOCK/COMING_SOON when needed.
     */
    await tx.product.update({
      where: { id: product.id },
      data: {
        stock: {
          decrement: item.quantity,
        },
        soldQuantity: {
          increment: item.quantity,
        },
      },
    });
  }
}

async function restoreProductStocksForOrder(
  tx: Prisma.TransactionClient,
  order: OrderWithItems,
) {
  const items = Array.isArray(order.items) ? order.items : [];

  for (const item of items) {
    if (!item.productId) continue;

    /**
     * Restore stock on cancel/return but do NOT change stockStatus or inStock.
     * Status remains fully manual.
     */
    await tx.product.update({
      where: { id: item.productId },
      data: {
        stock: {
          increment: item.quantity,
        },
        soldQuantity: {
          decrement: item.quantity,
        },
      },
    });
  }
}

router.get("/checkout-profile", authenticate, async (req: AuthRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        address: true,
        district: true,
        thana: true,
      },
    });

    return res.json({ success: true, profile: user });
  } catch (error) {
    return sendError(res, error, "Failed to load checkout profile");
  }
});

router.post("/checkout", authenticate, async (req: AuthRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  try {
    const normalizedItems = normalizeCheckoutItems(req.body.items);

    if (normalizedItems.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const customerName = requiredString(
      req.body.customerName,
      "Recipient name",
      100,
    );
    const customerPhone = normalizePhone(
      req.body.customerPhone,
      "Phone number",
    );
    const alternativePhone = normalizePhone(
      req.body.alternativePhone,
      "Alternative phone",
      false,
    );
    const customerEmail = optionalString(req.body.customerEmail, 120);
    const recipientEmail = optionalString(req.body.recipientEmail, 120);
    const customerAddress = requiredString(
      req.body.customerAddress,
      "Address",
      250,
    );
    const district = requiredString(req.body.district, "District", 80);
    const thana = optionalString(req.body.thana, 80);
    const note = optionalString(req.body.note, 400);
    const deliveryType = normalizeDeliveryType(req.body.deliveryType);

    const productIds = normalizedItems.map((item) => item.productId);

    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        slug: true,
        sku: true,
        mainImageUrl: true,
        sellingPrice: true,
        costPrice: true,
        stock: true,
        lowStockAlertQuantity: true,
        stockStatus: true,
        inStock: true,
        isPublished: true,
      },
    });

    if (products.length !== productIds.length) {
      return res.status(400).json({
        success: false,
        message: "Some products were not found",
      });
    }

    const productMap = new Map<string, ProductForCheckout>(
      products.map((product) => [product.id, product]),
    );

    const orderItems: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] =
      normalizedItems.map((item) => {
        const product = productMap.get(item.productId);

        if (!product) {
          throw new Error("Product not found");
        }

        if (!canBuyProduct(product)) {
          throw new Error(`${product.name} is not available for checkout`);
        }

        // Do not block checkout by database stock.
        // Even if stock is 0, the order will be accepted.
        // Inventory cost will fall back to available FIFO batch, legacy costPrice,
        // or backorder cost calculation.

        const unitPrice = decimalToNumber(product.sellingPrice);
        const totalPrice = unitPrice * item.quantity;

        return {
          productId: product.id,
          productName: product.name,
          productSlug: product.slug,
          productImage: product.mainImageUrl,
          sku: product.sku,
          quantity: item.quantity,
          unitPrice,
          totalPrice,
        };
      });

    const totalAmount = Number(
      orderItems
        .reduce((sum, item) => {
          return sum + decimalToNumber(item.totalPrice);
        }, 0)
        .toFixed(2),
    );

    const deliveryCharge = calculateDeliveryCharge(district);
    const discountAmount = 0;
    const grandTotal = Number(
      (totalAmount + deliveryCharge - discountAmount).toFixed(2),
    );
    const paidAmount = 0;
    const dueAmount = Math.max(Number((grandTotal - paidAmount).toFixed(2)), 0);
    const codAmount = dueAmount;
    const paymentStatus = getPaymentStatus(grandTotal, paidAmount);

    const itemDescription = orderItems
      .map((item) => `${item.productName} x ${item.quantity}`)
      .join(", ")
      .slice(0, 400);

    const order = await prisma.$transaction(async (tx) => {
      const invoiceNo = await generateInvoiceNo(tx);

      const orderItemsWithCost: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] =
        [];

      for (const item of normalizedItems) {
        const product = productMap.get(item.productId);

        if (!product) {
          throw new Error("Product not found");
        }

        const unitPrice = decimalToNumber(product.sellingPrice);
        const totalPrice = Number((unitPrice * item.quantity).toFixed(2));

        /**
         * Do NOT call consumeFifoInventory here.
         * That helper can auto-update stockStatus/inStock when stock reaches 0.
         * This checkout keeps product status 100% manual.
         */
        const unitCostPrice = decimalToNumber(product.costPrice);
        const totalCost = Number((unitCostPrice * item.quantity).toFixed(2));
        const profit = Number((totalPrice - totalCost).toFixed(2));

        orderItemsWithCost.push({
          productId: product.id,
          productName: product.name,
          productSlug: product.slug,
          productImage: product.mainImageUrl,
          sku: product.sku,
          quantity: item.quantity,
          unitPrice,
          totalPrice,
          unitCostPrice,
          totalCost,
          profit,
          costBreakdown: {
            source: "MANUAL_STOCK_CHECKOUT",
            note: "Checkout decremented product stock only. stockStatus and inStock are manual and were not changed.",
            unitCostPrice,
            totalCost,
          } as Prisma.InputJsonValue,
        });
      }

      await deductProductStocksAfterOrder(tx, normalizedItems, productMap);

      const productCostTotal = Number(
        orderItemsWithCost
          .reduce(
            (sum, item) => sum + decimalToNumber((item as any).totalCost),
            0,
          )
          .toFixed(2),
      );

      const financial = calculateNetProfit({
        totalAmount,
        deliveryCharge,
        discountAmount,
        productCostTotal,
      });

      const created = await tx.order.create({
        data: {
          invoiceNo,
          userId: req.user!.id,
          customerName,
          customerEmail: customerEmail || req.user!.email || null,
          customerPhone,
          alternativePhone,
          recipientEmail,
          customerAddress,
          district,
          thana,
          deliveryType,
          totalAmount,
          deliveryCharge,
          discountAmount,
          paidAmount,
          dueAmount,
          codAmount,
          paymentStatus,
          note,
          itemDescription,
          status: "pending",
          productCostTotal,
          grossProfit: financial.grossProfit,
          netProfit: financial.netProfit,
          items: {
            create: orderItemsWithCost,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              mobile: true,
            },
          },
          items: true,
        },
      });

      await tx.user.update({
        where: { id: req.user!.id },
        data: {
          name: customerName,
          mobile: customerPhone,
          address: customerAddress,
          district,
          thana,
        },
      });

      return created;
    });

    await safeSendOrderEmail(() =>
      sendOrderPlacedEmail(toOrderMailData(order)),
    );

    return res.status(201).json({
      success: true,
      message: "Order created successfully",
      order: serializeOrder(order),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create order";
    return res.status(400).json({ success: false, message });
  }
});

router.get("/my", authenticate, async (req: AuthRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return res.json({
      success: true,
      orders: orders.map(serializeOrder),
    });
  } catch (error) {
    return sendError(res, error, "Failed to load orders");
  }
});

router.patch(
  "/my/:invoiceNo/cancel",
  authenticate,
  async (req: AuthRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    try {
      const invoiceNo = getStringParam(req.params.invoiceNo);

      if (!invoiceNo) {
        return res.status(400).json({
          success: false,
          message: "Invoice number is required",
        });
      }

      const order = await prisma.order.findFirst({
        where: {
          invoiceNo,
          userId: req.user.id,
        },
        include: {
          items: true,
        },
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      if (!cancellableStatuses.includes(order.status)) {
        return res.status(400).json({
          success: false,
          message: "Only pending orders can be cancelled",
        });
      }

      const updated = await prisma.$transaction(async (tx) => {
        await restoreProductStocksForOrder(tx, order);

        return tx.order.update({
          where: { invoiceNo },
          data: {
            status: "cancelled",
            cancelledAt: new Date(),
            netProfit: 0,
          },
          include: {
            items: true,
          },
        });
      });

      return res.json({
        success: true,
        message: "Order cancelled successfully",
        order: serializeOrder(updated),
      });
    } catch (error) {
      return sendError(res, error, "Failed to cancel order");
    }
  },
);

router.get(
  "/admin",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const rawStatus =
        typeof req.query.status === "string" ? req.query.status : "all";
      const status = rawStatus === "all" ? null : normalizeStatus(rawStatus);
      const search =
        typeof req.query.search === "string" ? req.query.search.trim() : "";
      const page = Math.max(Number(req.query.page || 1), 1);
      const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 1000);
      const skip = (page - 1) * limit;

      const where: Prisma.OrderWhereInput = {
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { invoiceNo: { contains: search, mode: "insensitive" } },
                { customerPhone: { contains: search, mode: "insensitive" } },
                { customerName: { contains: search, mode: "insensitive" } },
                { customerEmail: { contains: search, mode: "insensitive" } },
                { district: { contains: search, mode: "insensitive" } },
                { courierName: { contains: search, mode: "insensitive" } },
                {
                  courierTrackingNumber: {
                    contains: search,
                    mode: "insensitive",
                  },
                },
              ],
            }
          : {}),
      };

      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where,
          include: {
            items: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          skip,
          take: limit,
        }),
        prisma.order.count({ where }),
      ]);

      return res.json({
        success: true,
        orders: orders.map(serializeOrder),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(Math.ceil(total / limit), 1),
        },
      });
    } catch (error) {
      return sendError(res, error, "Failed to load order list");
    }
  },
);

router.get(
  "/admin/:invoiceNo",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const invoiceNo = getStringParam(req.params.invoiceNo);

      if (!invoiceNo) {
        return res.status(400).json({
          success: false,
          message: "Invoice number is required",
        });
      }

      const order = await getOrderByInvoice(invoiceNo);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      return res.json({
        success: true,
        order: serializeOrder(order),
      });
    } catch (error) {
      return sendError(res, error, "Failed to load order");
    }
  },
);

router.patch(
  "/admin/bulk/status",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const invoiceNos = getInvoiceNos(req.body.invoiceNos);
      const status = normalizeStatus(req.body.status);

      if (invoiceNos.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Select at least one order",
        });
      }

      if (!status) {
        return res.status(400).json({
          success: false,
          message: "Invalid order status",
        });
      }

      const courierName = optionalString(req.body.courierName, 120);
      const courierTrackingNumber = optionalString(
        req.body.courierTrackingNumber,
        120,
      );
      const courierNote = optionalString(req.body.courierNote, 400);

      if (status === "shipped" && !courierName) {
        return res.status(400).json({
          success: false,
          message: "Courier name is required before changing order to shipped",
        });
      }

      const existingOrders = await prisma.order.findMany({
        where: {
          invoiceNo: {
            in: invoiceNos,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              mobile: true,
            },
          },
          items: true,
        },
      });

      if (existingOrders.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No matching orders found",
        });
      }

      const previousStatusMap = new Map(
        existingOrders.map((order) => [order.invoiceNo, order.status]),
      );

      const updatedOrders = await prisma.$transaction(async (tx) => {
        const results: OrderWithItems[] = [];

        for (const order of existingOrders) {
          const hasCourierInfo = Boolean(
            courierName || courierTrackingNumber || courierNote,
          );
          const shouldRestoreInventory =
            (status === "cancelled" || status === "returned") &&
            order.status !== "cancelled" &&
            order.status !== "returned";

          if (shouldRestoreInventory) {
            await restoreProductStocksForOrder(tx, order);
          }

          let updated: OrderWithItems = await tx.order.update({
            where: {
              invoiceNo: order.invoiceNo,
            },
            data: {
              status,
              ...(status === "shipped"
                ? {
                    courierName: courierName || order.courierName,
                    courierTrackingNumber:
                      courierTrackingNumber || order.courierTrackingNumber,
                    courierNote: courierNote || order.courierNote,
                    courierAssignedAt:
                      hasCourierInfo && !order.courierAssignedAt
                        ? new Date()
                        : order.courierAssignedAt,
                  }
                : {}),
              ...(status === "cancelled" || status === "returned"
                ? { netProfit: 0 }
                : {}),
              ...getStatusTimestampData(status, order),
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  mobile: true,
                },
              },
              items: true,
            },
          });

          if (status !== "cancelled" && status !== "returned") {
            updated = (await recalculateOrderProfitById(
              tx,
              updated.id,
            )) as unknown as OrderWithItems;
          }

          results.push(updated);
        }

        return results;
      });

      await Promise.all(
        updatedOrders.map((order) =>
          sendStatusChangeEmail(
            previousStatusMap.get(order.invoiceNo) || order.status,
            order,
          ),
        ),
      );

      return res.json({
        success: true,
        message: `${updatedOrders.length} order(s) updated`,
        count: updatedOrders.length,
      });
    } catch (error) {
      return sendError(res, error, "Failed to update selected orders");
    }
  },
);

router.patch(
  "/admin/:invoiceNo",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const invoiceNo = getStringParam(req.params.invoiceNo);

      if (!invoiceNo) {
        return res.status(400).json({
          success: false,
          message: "Invoice number is required",
        });
      }

      const existing = await getOrderByInvoice(invoiceNo);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      const status =
        req.body.status !== undefined
          ? normalizeStatus(req.body.status)
          : existing.status;

      if (!status) {
        return res.status(400).json({
          success: false,
          message: "Invalid order status",
        });
      }

      const totalAmount =
        req.body.totalAmount !== undefined
          ? toMoney(req.body.totalAmount)
          : decimalToNumber(existing.totalAmount);

      const district =
        req.body.district !== undefined
          ? requiredString(req.body.district, "District", 80)
          : existing.district;

      const autoDeliveryCharge = calculateDeliveryCharge(district);

      const deliveryCharge =
        req.body.deliveryCharge !== undefined
          ? toMoney(req.body.deliveryCharge, autoDeliveryCharge)
          : autoDeliveryCharge;

      const discountAmount =
        req.body.discountAmount !== undefined
          ? toMoney(req.body.discountAmount)
          : decimalToNumber(existing.discountAmount);

      const grandTotal = Math.max(
        Number((totalAmount + deliveryCharge - discountAmount).toFixed(2)),
        0,
      );

      const paidAmount =
        req.body.paidAmount !== undefined
          ? toMoney(req.body.paidAmount)
          : decimalToNumber(existing.paidAmount);

      const dueAmount = Math.max(
        Number((grandTotal - paidAmount).toFixed(2)),
        0,
      );

      const courierName =
        req.body.courierName !== undefined
          ? optionalString(req.body.courierName, 120)
          : existing.courierName;

      const courierTrackingNumber =
        req.body.courierTrackingNumber !== undefined
          ? optionalString(req.body.courierTrackingNumber, 120)
          : existing.courierTrackingNumber;

      const courierNote =
        req.body.courierNote !== undefined
          ? optionalString(req.body.courierNote, 400)
          : existing.courierNote;

      const actualCourierCost =
        req.body.actualCourierCost !== undefined
          ? toMoney(req.body.actualCourierCost)
          : decimalToNumber((existing as any).actualCourierCost);

      const packagingCost =
        req.body.packagingCost !== undefined
          ? toMoney(req.body.packagingCost)
          : decimalToNumber((existing as any).packagingCost);

      const paymentFee =
        req.body.paymentFee !== undefined
          ? toMoney(req.body.paymentFee)
          : decimalToNumber((existing as any).paymentFee);

      const otherCost =
        req.body.otherCost !== undefined
          ? toMoney(req.body.otherCost)
          : decimalToNumber((existing as any).otherCost);

      if (status === "shipped" && !courierName) {
        return res.status(400).json({
          success: false,
          message: "Courier name is required before changing order to shipped",
        });
      }

      const shouldSetCourierAssignedAt = Boolean(
        (courierName || courierTrackingNumber) && !existing.courierAssignedAt,
      );

      let updated: OrderWithItems = await prisma.order.update({
        where: { invoiceNo },
        data: {
          customerName:
            req.body.customerName !== undefined
              ? requiredString(req.body.customerName, "Customer name", 100)
              : existing.customerName,

          customerEmail:
            req.body.customerEmail !== undefined
              ? optionalString(req.body.customerEmail, 120)
              : existing.customerEmail,

          customerPhone:
            req.body.customerPhone !== undefined
              ? normalizePhone(req.body.customerPhone, "Phone number")
              : existing.customerPhone,

          alternativePhone:
            req.body.alternativePhone !== undefined
              ? normalizePhone(
                  req.body.alternativePhone,
                  "Alternative phone",
                  false,
                )
              : existing.alternativePhone,

          recipientEmail:
            req.body.recipientEmail !== undefined
              ? optionalString(req.body.recipientEmail, 120)
              : existing.recipientEmail,

          customerAddress:
            req.body.customerAddress !== undefined
              ? requiredString(req.body.customerAddress, "Address", 250)
              : existing.customerAddress,

          district,

          thana:
            req.body.thana !== undefined
              ? optionalString(req.body.thana, 80)
              : existing.thana,

          deliveryType:
            req.body.deliveryType !== undefined
              ? normalizeDeliveryType(req.body.deliveryType)
              : existing.deliveryType,

          totalAmount,
          deliveryCharge,
          discountAmount,
          paidAmount,
          dueAmount,
          codAmount: dueAmount,
          paymentStatus: getPaymentStatus(grandTotal, paidAmount),
          actualCourierCost,
          packagingCost,
          paymentFee,
          otherCost,

          note:
            req.body.note !== undefined
              ? optionalString(req.body.note, 400)
              : existing.note,

          itemDescription:
            req.body.itemDescription !== undefined
              ? optionalString(req.body.itemDescription, 400)
              : existing.itemDescription,

          courierName,
          courierTrackingNumber,
          courierNote,

          ...(shouldSetCourierAssignedAt
            ? { courierAssignedAt: new Date() }
            : {}),

          status,
          ...getStatusTimestampData(status, existing),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              mobile: true,
            },
          },
          items: true,
        },
      });

      updated = await prisma.$transaction<OrderWithItems>(async (tx) => {
        if (
          (status === "cancelled" || status === "returned") &&
          existing.status !== "cancelled" &&
          existing.status !== "returned"
        ) {
          await restoreProductStocksForOrder(tx, existing);
        }

        if (status === "cancelled" || status === "returned") {
          return tx.order.update({
            where: { invoiceNo },
            data: { netProfit: 0 },
            include: {
              user: {
                select: { id: true, name: true, email: true, mobile: true },
              },
              items: true,
            },
          });
        }

        const recalculated = await recalculateOrderProfitById(tx, updated.id, {
          actualCourierCost,
          packagingCost,
          paymentFee,
          otherCost,
        });

        return recalculated as unknown as OrderWithItems;
      });

      await sendStatusChangeEmail(existing.status, updated);

      return res.json({
        success: true,
        message: "Order updated successfully",
        order: serializeOrder(updated),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update order";
      return res.status(400).json({ success: false, message });
    }
  },
);

router.delete(
  "/admin/:invoiceNo",
  authenticate,
  requireAdminOrModerator,
  async (req: AuthRequest, res) => {
    try {
      const invoiceNo = getStringParam(req.params.invoiceNo);

      if (!invoiceNo) {
        return res.status(400).json({
          success: false,
          message: "Invoice number is required",
        });
      }

      await prisma.order.delete({
        where: { invoiceNo },
      });

      return res.json({
        success: true,
        message: "Order deleted successfully",
      });
    } catch (error) {
      return sendError(res, error, "Failed to delete order");
    }
  },
);

export default router;
