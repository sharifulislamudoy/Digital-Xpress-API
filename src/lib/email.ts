import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

type OrderMailItem = {
  productName: string;
  productImage?: string | null;
  sku?: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type OrderMailData = {
  invoiceNo: string;
  customerName: string;
  customerEmail?: string | null;
  recipientEmail?: string | null;
  customerPhone: string;
  customerAddress: string;
  district: string;
  thana?: string | null;
  deliveryType: "home" | "point";
  totalAmount: number;
  deliveryCharge: number;
  discountAmount: number;
  paidAmount: number;
  dueAmount: number;
  codAmount: number;
  status: string;
  courierName?: string | null;
  courierTrackingNumber?: string | null;
  courierNote?: string | null;
  createdAt?: Date | string;
  items: OrderMailItem[];
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPrice(value: unknown) {
  const amount = Number(value || 0);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return `${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(safeAmount)} Tk`;
}

function formatDate(value?: Date | string) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getOrderRecipients(order: OrderMailData) {
  return Array.from(
    new Set(
      [order.customerEmail, order.recipientEmail]
        .filter((email): email is string => typeof email === "string" && email.trim().length > 0)
        .map((email) => email.trim().toLowerCase())
    )
  );
}

function orderAddress(order: OrderMailData) {
  return `${order.customerAddress}${order.thana ? `, ${order.thana}` : ""}, ${order.district}`;
}

function productTable(items: OrderMailItem[]) {
  const rows = items
    .map((item) => {
      const image = item.productImage
        ? `<img src="${escapeHtml(item.productImage)}" alt="${escapeHtml(item.productName)}" width="52" height="52" style="display:block;width:52px;height:52px;object-fit:contain;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;" />`
        : `<div style="width:52px;height:52px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;"></div>`;

      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;width:64px;">${image}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;color:#111827;font-size:14px;font-weight:700;line-height:1.4;">${escapeHtml(item.productName)}</p>
            <p style="margin:4px 0 0;color:#6b7280;font-size:12px;">SKU: ${escapeHtml(item.sku || "N/A")}</p>
          </td>
          <td align="center" style="padding:12px 8px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:13px;font-weight:700;">${item.quantity}</td>
          <td align="right" style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#ea580c;font-size:13px;font-weight:800;white-space:nowrap;">${formatPrice(item.totalPrice)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:18px;">
      <thead>
        <tr>
          <th align="left" colspan="2" style="padding:0 0 10px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #e5e7eb;">Product</th>
          <th align="center" style="padding:0 8px 10px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #e5e7eb;">Qty</th>
          <th align="right" style="padding:0 0 10px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #e5e7eb;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function orderSummary(order: OrderMailData) {
  const grandTotal = order.totalAmount + order.deliveryCharge - order.discountAmount;

  return `
    <div style="margin-top:18px;border:1px solid #fed7aa;background:#fff7ed;border-radius:16px;padding:16px;">
      <p style="margin:0 0 10px;color:#9a3412;font-size:13px;font-weight:800;">Order Summary</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;color:#374151;font-size:13px;">
        <tr><td style="padding:5px 0;">Invoice</td><td align="right" style="padding:5px 0;font-weight:800;color:#111827;">${escapeHtml(order.invoiceNo)}</td></tr>
        <tr><td style="padding:5px 0;">Product Total</td><td align="right" style="padding:5px 0;font-weight:700;">${formatPrice(order.totalAmount)}</td></tr>
        <tr><td style="padding:5px 0;">Delivery Charge</td><td align="right" style="padding:5px 0;font-weight:700;">${formatPrice(order.deliveryCharge)}</td></tr>
        <tr><td style="padding:5px 0;">Discount</td><td align="right" style="padding:5px 0;font-weight:700;">${formatPrice(order.discountAmount)}</td></tr>
        <tr><td style="padding:9px 0 5px;border-top:1px solid #fed7aa;font-weight:800;color:#111827;">Grand Total</td><td align="right" style="padding:9px 0 5px;border-top:1px solid #fed7aa;font-size:16px;font-weight:900;color:#ea580c;">${formatPrice(grandTotal)}</td></tr>
        <tr><td style="padding:5px 0;">Paid</td><td align="right" style="padding:5px 0;font-weight:700;">${formatPrice(order.paidAmount)}</td></tr>
        <tr><td style="padding:5px 0;">COD / Due</td><td align="right" style="padding:5px 0;font-weight:900;color:#dc2626;">${formatPrice(order.codAmount || order.dueAmount)}</td></tr>
      </table>
    </div>
  `;
}

function courierBlock(order: OrderMailData) {
  if (!order.courierName && !order.courierTrackingNumber && !order.courierNote) return "";

  return `
    <div style="margin-top:18px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:16px;padding:16px;">
      <p style="margin:0 0 10px;color:#1d4ed8;font-size:13px;font-weight:800;">Courier Information</p>
      <p style="margin:4px 0;color:#374151;font-size:14px;"><strong>Courier:</strong> ${escapeHtml(order.courierName || "N/A")}</p>
      <p style="margin:4px 0;color:#374151;font-size:14px;"><strong>Tracking:</strong> ${escapeHtml(order.courierTrackingNumber || "N/A")}</p>
      ${order.courierNote ? `<p style="margin:4px 0;color:#374151;font-size:14px;"><strong>Note:</strong> ${escapeHtml(order.courierNote)}</p>` : ""}
    </div>
  `;
}

function customerBlock(order: OrderMailData) {
  return `
    <div style="margin-top:18px;border:1px solid #e5e7eb;background:#ffffff;border-radius:16px;padding:16px;">
      <p style="margin:0 0 10px;color:#111827;font-size:13px;font-weight:800;">Delivery Information</p>
      <p style="margin:4px 0;color:#374151;font-size:14px;"><strong>Name:</strong> ${escapeHtml(order.customerName)}</p>
      <p style="margin:4px 0;color:#374151;font-size:14px;"><strong>Phone:</strong> ${escapeHtml(order.customerPhone)}</p>
      <p style="margin:4px 0;color:#374151;font-size:14px;"><strong>Address:</strong> ${escapeHtml(orderAddress(order))}</p>
      <p style="margin:4px 0;color:#374151;font-size:14px;"><strong>Delivery Type:</strong> ${order.deliveryType === "point" ? "Point Delivery" : "Home Delivery"}</p>
    </div>
  `;
}

function orderEmailBody(order: OrderMailData, intro: string, badgeText: string, badgeColor = "#ea580c") {
  const myOrdersUrl = `${process.env.FRONTEND_URL || ""}/my-orders`;

  return `
    <div style="text-align:center;margin-bottom:22px;">
      <span style="display:inline-block;background:${badgeColor};color:#ffffff;border-radius:999px;padding:8px 18px;font-size:12px;font-weight:900;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(badgeText)}</span>
    </div>
    <h2 style="color:#111827;font-size:22px;margin:0 0 12px;font-weight:900;">Hello ${escapeHtml(order.customerName)},</h2>
    <p style="color:#4b5563;font-size:15px;line-height:1.7;margin:0;">${intro}</p>
    ${productTable(order.items)}
    ${orderSummary(order)}
    ${courierBlock(order)}
    ${customerBlock(order)}
    ${myOrdersUrl.startsWith("http") ? `<div style="text-align:center;margin:28px 0 6px;"><a href="${myOrdersUrl}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#ffffff;font-weight:800;font-size:15px;padding:13px 28px;border-radius:999px;text-decoration:none;box-shadow:0 4px 12px rgba(249,115,22,0.35);">View My Orders</a></div>` : ""}
    <p style="color:#6b7280;font-size:12px;line-height:1.6;margin-top:22px;">Order date: ${escapeHtml(formatDate(order.createdAt))}</p>
  `;
}

// Common email wrapper with branding
function emailTemplate(content: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Digital Xpress</title>
    </head>
    <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:20px 0;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:linear-gradient(135deg,#ffffff,#fef9f2);border-radius:20px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.06);">
              <tr>
                <td style="background:linear-gradient(135deg,#f97316,#ea580c);padding:30px 20px;text-align:center;">
                  <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:900;letter-spacing:-0.5px;">DIGITAL XPRESS</h1>
                  <p style="margin:8px 0 0;color:#fed7aa;font-size:14px;">Your trusted shopping destination</p>
                </td>
              </tr>
              <tr>
                <td style="padding:30px 24px;">
                  ${content}
                </td>
              </tr>
              <tr>
                <td style="background:#1f2937;padding:20px 24px;text-align:center;">
                  <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} Digital Xpress. All rights reserved.</p>
                  <p style="margin:4px 0 0;color:#6b7280;font-size:12px;">If you didn't request this email, please ignore it.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

async function sendOrderEmail(order: OrderMailData, subject: string, content: string) {
  const recipients = getOrderRecipients(order);
  if (recipients.length === 0) return;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: recipients.join(", "),
    subject,
    html: emailTemplate(content),
  });
}

export async function sendOrderPlacedEmail(order: OrderMailData) {
  await sendOrderEmail(
    order,
    `Thank you for your order ${order.invoiceNo}`,
    orderEmailBody(
      order,
      "Thank you for shopping with Digital Xpress. We have received your order and our team will confirm it shortly.",
      "Order Received",
      "#ea580c"
    )
  );
}

export async function sendOrderProcessingEmail(order: OrderMailData) {
  await sendOrderEmail(
    order,
    `Your order is confirmed ${order.invoiceNo}`,
    orderEmailBody(
      order,
      "Good news. Your order has been confirmed and moved to processing. We are preparing your products now.",
      "Order Confirmed",
      "#d97706"
    )
  );
}

export async function sendOrderShippedEmail(order: OrderMailData) {
  await sendOrderEmail(
    order,
    `Your order has been shipped ${order.invoiceNo}`,
    orderEmailBody(
      order,
      "Your order has been handed over to courier. You can use the courier information below to track the delivery.",
      "Order Shipped",
      "#2563eb"
    )
  );
}

export async function sendOrderDeliveredEmail(order: OrderMailData) {
  await sendOrderEmail(
    order,
    `Your order has been delivered ${order.invoiceNo}`,
    orderEmailBody(
      order,
      "Your order has been delivered successfully. Thank you for choosing Digital Xpress. We hope you enjoy your product.",
      "Delivered",
      "#16a34a"
    )
  );
}

export async function sendOtpEmail(email: string, otp: string) {
  const content = `
    <h2 style="color:#1f2937;font-size:22px;margin-top:0;">Verify Your Email Address</h2>
    <p style="color:#4b5563;font-size:16px;line-height:1.6;">Thank you for signing up! Please use the following verification code to complete your registration:</p>
    <div style="text-align:center;margin:32px 0;">
      <span style="display:inline-block;font-size:36px;font-weight:700;letter-spacing:8px;color:#f97316;background:#fff7ed;padding:16px 32px;border-radius:12px;border:2px dashed #f97316;">${escapeHtml(otp)}</span>
    </div>
    <p style="color:#4b5563;font-size:14px;">This code will expire in <strong>10 minutes</strong>. If you didn't create an account, you can safely ignore this email.</p>
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;">
      <p style="color:#6b7280;font-size:13px;">Need help? Contact our support team.</p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Your Digital Xpress Verification Code",
    html: emailTemplate(content),
  });
}

export async function sendWelcomeEmail(email: string, name?: string) {
  const productsUrl = `${process.env.FRONTEND_URL}/products`;
  const displayName = name || "Valued Customer";

  const content = `
    <h2 style="color:#1f2937;font-size:22px;margin-top:0;">Welcome to the Family, ${escapeHtml(displayName)}! 🎉</h2>
    <p style="color:#4b5563;font-size:16px;line-height:1.6;">Your account has been successfully created. We're thrilled to have you on board!</p>
    <p style="color:#4b5563;font-size:16px;line-height:1.6;">Start exploring our exclusive collection of products and enjoy a seamless shopping experience.</p>
    <div style="text-align:center;margin:36px 0;">
      <a href="${productsUrl}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#ffffff;font-weight:600;font-size:16px;padding:14px 36px;border-radius:40px;text-decoration:none;box-shadow:0 4px 12px rgba(249,115,22,0.4);">Start Shopping Now</a>
    </div>
    <p style="color:#4b5563;font-size:14px;margin-top:20px;">Or copy this link: <a href="${productsUrl}" style="color:#f97316;text-decoration:underline;">${productsUrl}</a></p>
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;">
      <p style="color:#6b7280;font-size:13px;">Questions? Simply reply to this email – we're here to help!</p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Welcome to Digital Xpress!",
    html: emailTemplate(content),
  });
}

export async function sendBanEmail(email: string, name: string | undefined, reason: string) {
  const contactPhone = process.env.CONTACT_PHONE || "+8801995322033";
  const contactEmail = process.env.CONTACT_EMAIL || "info@digital-xpress-bd.com";
  const displayName = name || "User";

  const content = `
    <h2 style="color:#dc2626;font-size:22px;margin-top:0;">Account Banned</h2>
    <p style="color:#4b5563;font-size:16px;line-height:1.6;">Dear ${escapeHtml(displayName)},</p>
    <p style="color:#4b5563;font-size:16px;line-height:1.6;">Your Digital Xpress account has been <strong style="color:#dc2626;">banned</strong>.</p>
    <p style="color:#4b5563;font-size:16px;line-height:1.6;"><strong>Reason:</strong> ${escapeHtml(reason)}</p>
    <p style="color:#4b5563;font-size:16px;line-height:1.6;">If you believe this is an error, please contact support.</p>
    <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;margin:32px 0;border-radius:8px;">
      <p style="margin:0 0 8px 0;font-weight:600;color:#991b1b;">Contact Information:</p>
      <p style="margin:4px 0;"><a href="tel:${contactPhone}" style="color:#f97316;text-decoration:none;">📞 ${contactPhone}</a></p>
      <p style="margin:4px 0;"><a href="mailto:${contactEmail}" style="color:#f97316;text-decoration:none;">✉️ ${contactEmail}</a></p>
    </div>
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;">
      <p style="color:#6b7280;font-size:13px;">Digital Xpress Team</p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Your Digital Xpress Account Has Been Banned",
    html: emailTemplate(content),
  });
}

export async function sendUnbanEmail(email: string, name?: string) {
  const loginUrl = `${process.env.FRONTEND_URL}/login`;
  const displayName = name || "User";

  const content = `
    <h2 style="color:#16a34a;font-size:22px;margin-top:0;">Account Reinstated</h2>
    <p style="color:#4b5563;font-size:16px;line-height:1.6;">Dear ${escapeHtml(displayName)},</p>
    <p style="color:#4b5563;font-size:16px;line-height:1.6;">Your account has been <strong style="color:#16a34a;">unbanned</strong>. You can now log in again.</p>
    <div style="text-align:center;margin:36px 0;">
      <a href="${loginUrl}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#ffffff;font-weight:600;font-size:16px;padding:14px 36px;border-radius:40px;text-decoration:none;box-shadow:0 4px 12px rgba(249,115,22,0.4);">Login to Your Account</a>
    </div>
    <p style="color:#4b5563;font-size:16px;line-height:1.6;margin-top:20px;">Happy shopping!</p>
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;">
      <p style="color:#6b7280;font-size:13px;">If you have any questions, reply to this email.</p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Your Digital Xpress Account Has Been Unbanned",
    html: emailTemplate(content),
  });
}

export async function sendDeletionEmail(email: string, name?: string) {
  const displayName = name || "User";
  const content = `
    <h2 style="color:#dc2626;font-size:22px;margin-top:0;">Account Permanently Deleted</h2>
    <p style="color:#4b5563;font-size:16px;line-height:1.6;">Dear ${escapeHtml(displayName)},</p>
    <p style="color:#4b5563;font-size:16px;line-height:1.6;">Your Digital Xpress account has been <strong style="color:#dc2626;">permanently deleted</strong> by an administrator.</p>
    <p style="color:#4b5563;font-size:16px;line-height:1.6;">All your data has been removed from our system. You cannot log in or recover this account.</p>
    <p style="color:#4b5563;font-size:16px;line-height:1.6;">If you believe this was a mistake, please contact support.</p>
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;">
      <p style="color:#6b7280;font-size:13px;">Digital Xpress Team</p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Your Digital Xpress Account Has Been Deleted",
    html: emailTemplate(content),
  });
}
