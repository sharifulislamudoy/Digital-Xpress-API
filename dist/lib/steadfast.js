"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSteadfastPayload = buildSteadfastPayload;
exports.createSteadfastOrder = createSteadfastOrder;
exports.createBulkSteadfastOrders = createBulkSteadfastOrders;
const STEADFAST_BASE_URL = (process.env.STEADFAST_BASE_URL || "https://portal.packzy.com/api/v1").replace(/\/+$/, "");
function getHeaders() {
    const apiKey = process.env.STEADFAST_API_KEY;
    const secretKey = process.env.STEADFAST_SECRET_KEY;
    if (!apiKey || !secretKey) {
        throw new Error("STEADFAST_API_KEY or STEADFAST_SECRET_KEY is missing");
    }
    return {
        "Api-Key": apiKey,
        "Secret-Key": secretKey,
        "Content-Type": "application/json",
        Accept: "application/json",
    };
}
function toNumber(value) {
    if (typeof value === "number")
        return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
        const numberValue = Number(value);
        return Number.isFinite(numberValue) ? numberValue : 0;
    }
    if (value && typeof value === "object" && "toNumber" in value) {
        const decimalValue = value;
        const numberValue = decimalValue.toNumber();
        return Number.isFinite(numberValue) ? numberValue : 0;
    }
    const fallbackValue = Number(value || 0);
    return Number.isFinite(fallbackValue) ? fallbackValue : 0;
}
function limitText(value, max) {
    if (typeof value !== "string")
        return undefined;
    const clean = value.trim();
    if (!clean)
        return undefined;
    return clean.length > max ? clean.slice(0, max) : clean;
}
function normalizeBdPhone(value, fieldName, required = true) {
    if (value === undefined || value === null || value === "") {
        if (required) {
            throw new Error(`${fieldName} is required`);
        }
        return undefined;
    }
    let phone = String(value).trim().replace(/[^0-9+]/g, "");
    if (phone.startsWith("+88")) {
        phone = phone.slice(3);
    }
    if (phone.startsWith("88") && phone.length === 13) {
        phone = phone.slice(2);
    }
    phone = phone.replace(/\D/g, "");
    if (!/^01\d{9}$/.test(phone)) {
        throw new Error(`${fieldName} must be a valid 11 digit Bangladeshi phone number`);
    }
    return phone;
}
function getErrorMessage(data, fallback) {
    if (!data)
        return fallback;
    if (typeof data === "string")
        return data || fallback;
    if (typeof data === "object") {
        const obj = data;
        if (typeof obj.message === "string" && obj.message.trim()) {
            return obj.message.trim();
        }
        if (typeof obj.error === "string" && obj.error.trim()) {
            return obj.error.trim();
        }
        if (typeof obj.raw === "string" && obj.raw.trim()) {
            return obj.raw.trim().slice(0, 500);
        }
        if (obj.errors && typeof obj.errors === "object") {
            return JSON.stringify(obj.errors).slice(0, 500);
        }
    }
    return fallback;
}
async function readJsonSafely(response) {
    const text = await response.text();
    try {
        return text ? JSON.parse(text) : null;
    }
    catch {
        return { raw: text };
    }
}
function normalizeBulkResponse(data) {
    if (Array.isArray(data)) {
        return data;
    }
    if (data && typeof data === "object") {
        const obj = data;
        if (Array.isArray(obj.data)) {
            return obj.data;
        }
        if (Array.isArray(obj.results)) {
            return obj.results;
        }
        if (typeof obj.data === "string") {
            try {
                const parsed = JSON.parse(obj.data);
                if (Array.isArray(parsed)) {
                    return parsed;
                }
            }
            catch {
                return null;
            }
        }
    }
    return null;
}
function buildSteadfastPayload(order) {
    const fullAddress = [order.customerAddress, order.thana, order.district]
        .map((item) => typeof item === "string" ? item.trim() : "")
        .filter(Boolean)
        .join(", ");
    const payload = {
        invoice: limitText(order.invoiceNo, 100) || order.invoiceNo,
        recipient_name: limitText(order.customerName, 100) || "Customer",
        recipient_phone: normalizeBdPhone(order.customerPhone, "Recipient phone"),
        recipient_address: limitText(fullAddress, 250) || "N/A",
        cod_amount: Math.max(toNumber(order.codAmount), 0),
        delivery_type: order.deliveryType === "point" ? 1 : 0,
    };
    const alternativePhone = normalizeBdPhone(order.alternativePhone, "Alternative phone", false);
    const recipientEmail = limitText(order.recipientEmail, 120);
    const note = limitText(order.note, 400);
    const itemDescription = limitText(order.itemDescription, 400);
    if (alternativePhone) {
        payload.alternative_phone = alternativePhone;
    }
    if (recipientEmail) {
        payload.recipient_email = recipientEmail;
    }
    if (note) {
        payload.note = note;
    }
    if (itemDescription) {
        payload.item_description = itemDescription;
    }
    return payload;
}
async function createSteadfastOrder(order) {
    const payload = buildSteadfastPayload(order);
    const response = await fetch(`${STEADFAST_BASE_URL}/create_order`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
    });
    const data = await readJsonSafely(response);
    const responseData = data;
    if (!response.ok ||
        !responseData ||
        Number(responseData.status) !== 200 ||
        !responseData.consignment) {
        console.error("Steadfast single order failed", {
            httpStatus: response.status,
            payload,
            response: data,
        });
        throw new Error(`Steadfast API failed: ${getErrorMessage(data, "Failed to create Steadfast consignment")}`);
    }
    return responseData;
}
async function createBulkSteadfastOrders(orders) {
    const payloads = orders.map((order) => buildSteadfastPayload(order));
    const response = await fetch(`${STEADFAST_BASE_URL}/create_order/bulk-order`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ data: JSON.stringify(payloads) }),
    });
    const data = await readJsonSafely(response);
    const normalized = normalizeBulkResponse(data);
    if (!response.ok || !normalized) {
        console.error("Steadfast bulk order failed", {
            httpStatus: response.status,
            payloads,
            response: data,
        });
        throw new Error(`Steadfast bulk API failed: ${getErrorMessage(data, "Failed to create bulk Steadfast consignments")}`);
    }
    return normalized;
}
