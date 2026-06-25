"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const allowedOrderStatuses = [
    "pending",
    "processing",
    "shipped",
    "delivered",
    "returned",
    "cancelled",
];
const cancellableStatuses = ["pending"];
function sendError(res, error, fallback = "Server error") {
    console.error(error);
    const message = error instanceof Error ? error.message : fallback;
    return res.status(500).json({ success: false, message });
}
function getStringParam(value) {
    if (typeof value === "string")
        return value;
    if (Array.isArray(value) && typeof value[0] === "string")
        return value[0];
    return undefined;
}
function requiredString(value, fieldName, maxLength) {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(`${fieldName} is required`);
    }
    const clean = value.trim();
    if (maxLength && clean.length > maxLength) {
        throw new Error(`${fieldName} must be within ${maxLength} characters`);
    }
    return clean;
}
function optionalString(value, maxLength) {
    if (typeof value !== "string")
        return null;
    const clean = value.trim();
    if (!clean)
        return null;
    if (maxLength && clean.length > maxLength)
        return clean.slice(0, maxLength);
    return clean;
}
function decimalToNumber(value) {
    if (typeof value === "number")
        return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (value && typeof value === "object" && "toNumber" in value) {
        const parsed = value.toNumber();
        return Number.isFinite(parsed) ? parsed : 0;
    }
    const fallback = Number(value || 0);
    return Number.isFinite(fallback) ? fallback : 0;
}
function toMoney(value, fallback = 0) {
    if (value === undefined || value === null || value === "")
        return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return fallback;
    return Math.max(Number(parsed.toFixed(2)), 0);
}
function normalizePhone(value, fieldName, required = true) {
    if (!required && (value === undefined || value === null || value === "")) {
        return null;
    }
    let phone = requiredString(value, fieldName).replace(/[^0-9+]/g, "");
    if (phone.startsWith("+88"))
        phone = phone.slice(3);
    if (phone.startsWith("88") && phone.length === 13)
        phone = phone.slice(2);
    phone = phone.replace(/\D/g, "");
    if (!/^01\d{9}$/.test(phone)) {
        throw new Error(`${fieldName} must be a valid 11 digit Bangladeshi phone number`);
    }
    return phone;
}
function normalizeStatus(value) {
    if (typeof value !== "string")
        return null;
    const clean = value.trim().toLowerCase();
    if (clean === "return")
        return "returned";
    if (allowedOrderStatuses.includes(clean))
        return clean;
    return null;
}
function normalizeDeliveryType(value) {
    return value === "point" ? "point" : "home";
}
function getPaymentStatus(total, paid) {
    if (paid <= 0)
        return "unpaid";
    if (paid >= total)
        return "paid";
    return "partial";
}
function getStatusTimestampData(status, existing) {
    const now = new Date();
    return {
        ...(status === "shipped" && !existing?.shippedAt ? { shippedAt: now } : {}),
        ...(status === "delivered" && !existing?.deliveredAt ? { deliveredAt: now } : {}),
        ...(status === "returned" && !existing?.returnedAt ? { returnedAt: now } : {}),
        ...(status === "cancelled" && !existing?.cancelledAt ? { cancelledAt: now } : {}),
    };
}
function serializeOrder(order) {
    const totalAmount = decimalToNumber(order.totalAmount);
    const deliveryCharge = decimalToNumber(order.deliveryCharge);
    const discountAmount = decimalToNumber(order.discountAmount);
    const paidAmount = decimalToNumber(order.paidAmount);
    const dueAmount = decimalToNumber(order.dueAmount);
    const codAmount = decimalToNumber(order.codAmount);
    return {
        ...order,
        totalAmount,
        deliveryCharge,
        discountAmount,
        paidAmount,
        dueAmount,
        codAmount,
        items: Array.isArray(order.items)
            ? order.items.map((item) => ({
                ...item,
                unitPrice: decimalToNumber(item.unitPrice),
                totalPrice: decimalToNumber(item.totalPrice),
            }))
            : [],
    };
}
async function generateInvoiceNo(tx = prisma_1.prisma) {
    const latest = await tx.order.findFirst({
        where: { invoiceNo: { startsWith: "DX-" } },
        orderBy: { createdAt: "desc" },
        select: { invoiceNo: true },
    });
    const latestNumber = latest?.invoiceNo?.match(/DX-(\d+)/)?.[1];
    let nextNumber = latestNumber ? Number(latestNumber) + 1 : 1;
    while (true) {
        const invoiceNo = `DX-${String(nextNumber).padStart(6, "0")}`;
        const exists = await tx.order.findUnique({ where: { invoiceNo }, select: { id: true } });
        if (!exists)
            return invoiceNo;
        nextNumber += 1;
    }
}
function canBuyProduct(product) {
    if (!product.isPublished)
        return false;
    if (!product.inStock)
        return false;
    if (["OUT_OF_STOCK", "COMING_SOON"].includes(product.stockStatus))
        return false;
    if (product.stockStatus !== "PRE_ORDER" && product.stock <= 0)
        return false;
    return true;
}
function calculateDeliveryCharge(products, totalAmount, district) {
    const insideDhaka = /dhaka/i.test(district);
    const charges = products.map((product) => {
        const freeMin = decimalToNumber(product.freeDeliveryMinAmount);
        if (product.freeDelivery || (freeMin > 0 && totalAmount >= freeMin))
            return 0;
        if (insideDhaka && product.insideDhakaDeliveryCharge !== null) {
            return decimalToNumber(product.insideDhakaDeliveryCharge);
        }
        if (!insideDhaka && product.outsideDhakaDeliveryCharge !== null) {
            return decimalToNumber(product.outsideDhakaDeliveryCharge);
        }
        return decimalToNumber(product.deliveryCharge);
    });
    return Math.max(0, ...charges);
}
function normalizeCheckoutItems(itemsInput) {
    if (!Array.isArray(itemsInput))
        return [];
    return itemsInput
        .map((rawItem) => {
        const productId = typeof rawItem.productId === "string"
            ? rawItem.productId
            : typeof rawItem.id === "string"
                ? rawItem.id
                : "";
        return {
            productId,
            quantity: Math.max(Math.trunc(Number(rawItem.quantity || 1)), 1),
        };
    })
        .filter((item) => item.productId.length > 0);
}
function getInvoiceNos(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .filter((invoice) => typeof invoice === "string")
        .map((invoice) => invoice.trim())
        .filter((invoice) => invoice.length > 0);
}
async function getOrderByInvoice(invoiceNo) {
    return prisma_1.prisma.order.findUnique({
        where: { invoiceNo },
        include: {
            user: { select: { id: true, name: true, email: true, mobile: true } },
            items: { orderBy: { createdAt: "asc" } },
        },
    });
}
router.get("/checkout-profile", auth_1.authenticate, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ success: false, message: "Unauthorized" });
    try {
        const user = await prisma_1.prisma.user.findUnique({
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
    }
    catch (error) {
        return sendError(res, error, "Failed to load checkout profile");
    }
});
router.post("/checkout", auth_1.authenticate, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ success: false, message: "Unauthorized" });
    try {
        const normalizedItems = normalizeCheckoutItems(req.body.items);
        if (normalizedItems.length === 0) {
            return res.status(400).json({ success: false, message: "Cart is empty" });
        }
        const customerName = requiredString(req.body.customerName, "Recipient name", 100);
        const customerPhone = normalizePhone(req.body.customerPhone, "Phone number");
        const alternativePhone = normalizePhone(req.body.alternativePhone, "Alternative phone", false);
        const customerEmail = optionalString(req.body.customerEmail, 120);
        const recipientEmail = optionalString(req.body.recipientEmail, 120);
        const customerAddress = requiredString(req.body.customerAddress, "Address", 250);
        const district = requiredString(req.body.district, "District", 80);
        const thana = optionalString(req.body.thana, 80);
        const note = optionalString(req.body.note, 400);
        const deliveryType = normalizeDeliveryType(req.body.deliveryType);
        const productIds = Array.from(new Set(normalizedItems.map((item) => item.productId)));
        const products = await prisma_1.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: {
                id: true,
                name: true,
                slug: true,
                sku: true,
                mainImageUrl: true,
                sellingPrice: true,
                stock: true,
                stockStatus: true,
                inStock: true,
                isPublished: true,
                deliveryCharge: true,
                insideDhakaDeliveryCharge: true,
                outsideDhakaDeliveryCharge: true,
                freeDelivery: true,
                freeDeliveryMinAmount: true,
            },
        });
        if (products.length !== productIds.length) {
            return res.status(400).json({ success: false, message: "Some products were not found" });
        }
        const productMap = new Map(products.map((product) => [product.id, product]));
        const orderItems = normalizedItems.map((item) => {
            const product = productMap.get(item.productId);
            if (!product)
                throw new Error("Product not found");
            if (!canBuyProduct(product))
                throw new Error(`${product.name} is not available for checkout`);
            if (product.stockStatus !== "PRE_ORDER" && item.quantity > product.stock) {
                throw new Error(`Only ${product.stock} item(s) available for ${product.name}`);
            }
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
        const totalAmount = Number(orderItems
            .reduce((sum, item) => {
            return sum + decimalToNumber(item.totalPrice);
        }, 0)
            .toFixed(2));
        const deliveryCharge = calculateDeliveryCharge(products, totalAmount, district);
        const discountAmount = 0;
        const grandTotal = Number((totalAmount + deliveryCharge - discountAmount).toFixed(2));
        const paidAmount = 0;
        const dueAmount = Math.max(Number((grandTotal - paidAmount).toFixed(2)), 0);
        const codAmount = dueAmount;
        const paymentStatus = getPaymentStatus(grandTotal, paidAmount);
        const itemDescription = orderItems
            .map((item) => `${item.productName} x ${item.quantity}`)
            .join(", ")
            .slice(0, 400);
        const order = await prisma_1.prisma.$transaction(async (tx) => {
            const invoiceNo = await generateInvoiceNo(tx);
            const created = await tx.order.create({
                data: {
                    invoiceNo,
                    userId: req.user.id,
                    customerName,
                    customerEmail: customerEmail || req.user.email || null,
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
                    items: { create: orderItems },
                },
                include: { items: true },
            });
            await tx.user.update({
                where: { id: req.user.id },
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
        return res.status(201).json({
            success: true,
            message: "Order created successfully",
            order: serializeOrder(order),
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create order";
        return res.status(400).json({ success: false, message });
    }
});
router.get("/my", auth_1.authenticate, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ success: false, message: "Unauthorized" });
    try {
        const orders = await prisma_1.prisma.order.findMany({
            where: { userId: req.user.id },
            include: { items: { orderBy: { createdAt: "asc" } } },
            orderBy: { createdAt: "desc" },
            take: 100,
        });
        return res.json({ success: true, orders: orders.map(serializeOrder) });
    }
    catch (error) {
        return sendError(res, error, "Failed to load orders");
    }
});
router.patch("/my/:invoiceNo/cancel", auth_1.authenticate, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ success: false, message: "Unauthorized" });
    try {
        const invoiceNo = getStringParam(req.params.invoiceNo);
        if (!invoiceNo)
            return res.status(400).json({ success: false, message: "Invoice number is required" });
        const order = await prisma_1.prisma.order.findFirst({
            where: { invoiceNo, userId: req.user.id },
            include: { items: true },
        });
        if (!order)
            return res.status(404).json({ success: false, message: "Order not found" });
        if (!cancellableStatuses.includes(order.status)) {
            return res.status(400).json({
                success: false,
                message: "Only pending orders can be cancelled",
            });
        }
        const updated = await prisma_1.prisma.order.update({
            where: { invoiceNo },
            data: { status: "cancelled", cancelledAt: new Date() },
            include: { items: true },
        });
        return res.json({
            success: true,
            message: "Order cancelled successfully",
            order: serializeOrder(updated),
        });
    }
    catch (error) {
        return sendError(res, error, "Failed to cancel order");
    }
});
router.get("/admin", auth_1.authenticate, auth_1.requireAdminOrModerator, async (req, res) => {
    try {
        const rawStatus = typeof req.query.status === "string" ? req.query.status : "all";
        const status = rawStatus === "all" ? null : normalizeStatus(rawStatus);
        const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
        const page = Math.max(Number(req.query.page || 1), 1);
        const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 1000);
        const skip = (page - 1) * limit;
        const where = {
            ...(status ? { status } : {}),
            ...(search
                ? {
                    OR: [
                        { invoiceNo: { contains: search, mode: "insensitive" } },
                        { customerPhone: { contains: search, mode: "insensitive" } },
                        { customerName: { contains: search, mode: "insensitive" } },
                        { customerEmail: { contains: search, mode: "insensitive" } },
                        { courierName: { contains: search, mode: "insensitive" } },
                        { courierTrackingNumber: { contains: search, mode: "insensitive" } },
                    ],
                }
                : {}),
        };
        const [orders, total] = await Promise.all([
            prisma_1.prisma.order.findMany({
                where,
                include: { items: true },
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
            }),
            prisma_1.prisma.order.count({ where }),
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
    }
    catch (error) {
        return sendError(res, error, "Failed to load order list");
    }
});
router.get("/admin/:invoiceNo", auth_1.authenticate, auth_1.requireAdminOrModerator, async (req, res) => {
    try {
        const invoiceNo = getStringParam(req.params.invoiceNo);
        if (!invoiceNo)
            return res.status(400).json({ success: false, message: "Invoice number is required" });
        const order = await getOrderByInvoice(invoiceNo);
        if (!order)
            return res.status(404).json({ success: false, message: "Order not found" });
        return res.json({ success: true, order: serializeOrder(order) });
    }
    catch (error) {
        return sendError(res, error, "Failed to load order");
    }
});
router.patch("/admin/bulk/status", auth_1.authenticate, auth_1.requireAdminOrModerator, async (req, res) => {
    try {
        const invoiceNos = getInvoiceNos(req.body.invoiceNos);
        const status = normalizeStatus(req.body.status);
        if (invoiceNos.length === 0) {
            return res.status(400).json({ success: false, message: "Select at least one order" });
        }
        if (!status) {
            return res.status(400).json({ success: false, message: "Invalid order status" });
        }
        const result = await prisma_1.prisma.order.updateMany({
            where: { invoiceNo: { in: invoiceNos } },
            data: {
                status,
                ...getStatusTimestampData(status),
            },
        });
        return res.json({ success: true, message: `${result.count} order(s) updated`, count: result.count });
    }
    catch (error) {
        return sendError(res, error, "Failed to update selected orders");
    }
});
router.patch("/admin/:invoiceNo", auth_1.authenticate, auth_1.requireAdminOrModerator, async (req, res) => {
    try {
        const invoiceNo = getStringParam(req.params.invoiceNo);
        if (!invoiceNo)
            return res.status(400).json({ success: false, message: "Invoice number is required" });
        const existing = await prisma_1.prisma.order.findUnique({ where: { invoiceNo } });
        if (!existing)
            return res.status(404).json({ success: false, message: "Order not found" });
        const status = req.body.status !== undefined ? normalizeStatus(req.body.status) : existing.status;
        if (!status)
            return res.status(400).json({ success: false, message: "Invalid order status" });
        const totalAmount = req.body.totalAmount !== undefined ? toMoney(req.body.totalAmount) : decimalToNumber(existing.totalAmount);
        const deliveryCharge = req.body.deliveryCharge !== undefined ? toMoney(req.body.deliveryCharge) : decimalToNumber(existing.deliveryCharge);
        const discountAmount = req.body.discountAmount !== undefined ? toMoney(req.body.discountAmount) : decimalToNumber(existing.discountAmount);
        const grandTotal = Math.max(Number((totalAmount + deliveryCharge - discountAmount).toFixed(2)), 0);
        const paidAmount = req.body.paidAmount !== undefined ? toMoney(req.body.paidAmount) : decimalToNumber(existing.paidAmount);
        const dueAmount = Math.max(Number((grandTotal - paidAmount).toFixed(2)), 0);
        const courierName = req.body.courierName !== undefined ? optionalString(req.body.courierName, 120) : existing.courierName;
        const courierTrackingNumber = req.body.courierTrackingNumber !== undefined ? optionalString(req.body.courierTrackingNumber, 120) : existing.courierTrackingNumber;
        const courierNote = req.body.courierNote !== undefined ? optionalString(req.body.courierNote, 400) : existing.courierNote;
        const shouldSetCourierAssignedAt = Boolean((courierName || courierTrackingNumber) && !existing.courierAssignedAt);
        const updated = await prisma_1.prisma.order.update({
            where: { invoiceNo },
            data: {
                customerName: req.body.customerName !== undefined ? requiredString(req.body.customerName, "Customer name", 100) : existing.customerName,
                customerEmail: req.body.customerEmail !== undefined ? optionalString(req.body.customerEmail, 120) : existing.customerEmail,
                customerPhone: req.body.customerPhone !== undefined ? normalizePhone(req.body.customerPhone, "Phone number") : existing.customerPhone,
                alternativePhone: req.body.alternativePhone !== undefined ? normalizePhone(req.body.alternativePhone, "Alternative phone", false) : existing.alternativePhone,
                recipientEmail: req.body.recipientEmail !== undefined ? optionalString(req.body.recipientEmail, 120) : existing.recipientEmail,
                customerAddress: req.body.customerAddress !== undefined ? requiredString(req.body.customerAddress, "Address", 250) : existing.customerAddress,
                district: req.body.district !== undefined ? requiredString(req.body.district, "District", 80) : existing.district,
                thana: req.body.thana !== undefined ? optionalString(req.body.thana, 80) : existing.thana,
                deliveryType: req.body.deliveryType !== undefined ? normalizeDeliveryType(req.body.deliveryType) : existing.deliveryType,
                totalAmount,
                deliveryCharge,
                discountAmount,
                paidAmount,
                dueAmount,
                codAmount: dueAmount,
                paymentStatus: getPaymentStatus(grandTotal, paidAmount),
                note: req.body.note !== undefined ? optionalString(req.body.note, 400) : existing.note,
                itemDescription: req.body.itemDescription !== undefined ? optionalString(req.body.itemDescription, 400) : existing.itemDescription,
                courierName,
                courierTrackingNumber,
                courierNote,
                ...(shouldSetCourierAssignedAt ? { courierAssignedAt: new Date() } : {}),
                status,
                ...getStatusTimestampData(status, existing),
            },
            include: { items: true },
        });
        return res.json({ success: true, message: "Order updated successfully", order: serializeOrder(updated) });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update order";
        return res.status(400).json({ success: false, message });
    }
});
router.delete("/admin/:invoiceNo", auth_1.authenticate, auth_1.requireAdminOrModerator, async (req, res) => {
    try {
        const invoiceNo = getStringParam(req.params.invoiceNo);
        if (!invoiceNo)
            return res.status(400).json({ success: false, message: "Invoice number is required" });
        await prisma_1.prisma.order.delete({ where: { invoiceNo } });
        return res.json({ success: true, message: "Order deleted successfully" });
    }
    catch (error) {
        return sendError(res, error, "Failed to delete order");
    }
});
exports.default = router;
