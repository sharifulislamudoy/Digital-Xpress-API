import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

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
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:linear-gradient(135deg,#ffffff,#fef9f2);border-radius:20px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.05);">
              <!-- Header -->
              <tr>
                <td style="background:linear-gradient(135deg,#f97316,#ea580c);padding:30px 20px;text-align:center;">
                  <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">DIGITAL XPRESS</h1>
                  <p style="margin:8px 0 0;color:#fed7aa;font-size:14px;">Your trusted shopping destination</p>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="padding:30px 24px;">
                  ${content}
                </td>
              </tr>
              <!-- Footer -->
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

export async function sendOtpEmail(email: string, otp: string) {
  const content = `
    <h2 style="color:#1f2937;font-size:22px;margin-top:0;">Verify Your Email Address</h2>
    <p style="color:#4b5563;font-size:16px;line-height:1.6;">Thank you for signing up! Please use the following verification code to complete your registration:</p>
    <div style="text-align:center;margin:32px 0;">
      <span style="display:inline-block;font-size:36px;font-weight:700;letter-spacing:8px;color:#f97316;background:#fff7ed;padding:16px 32px;border-radius:12px;border:2px dashed #f97316;">${otp}</span>
    </div>
    <p style="color:#4b5563;font-size:14px;">This code will expire in <strong>10 minutes</strong>. If you didn't create an account, you can safely ignore this email.</p>
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;">
      <p style="color:#6b7280;font-size:13px;">Need help? Contact our support team.</p>
    </div>
  `;
  
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Your Digital Xpress Verification Code',
    html: emailTemplate(content),
  });
}

export async function sendWelcomeEmail(email: string, name?: string) {
  const productsUrl = `${process.env.FRONTEND_URL}/products`;
  const displayName = name || 'Valued Customer';
  
  const content = `
    <h2 style="color:#1f2937;font-size:22px;margin-top:0;">Welcome to the Family, ${displayName}! 🎉</h2>
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
    subject: 'Welcome to Digital Xpress!',
    html: emailTemplate(content),
  });
}

export async function sendBanEmail(email: string, name: string | undefined, reason: string) {
  const contactPhone = process.env.CONTACT_PHONE || "+8801995322033";
  const contactEmail = process.env.CONTACT_EMAIL || "info@digital-xpress-bd.com";
  const displayName = name || "User";

  const content = `
    <h2 style="color:#dc2626;font-size:22px;margin-top:0;">Account Banned</h2>
    <p style="color:#4b5563;font-size:16px;line-height:1.6;">Dear ${displayName},</p>
    <p style="color:#4b5563;font-size:16px;line-height:1.6;">Your Digital Xpress account has been <strong style="color:#dc2626;">banned</strong>.</p>
    <p style="color:#4b5563;font-size:16px;line-height:1.6;"><strong>Reason:</strong> ${reason}</p>
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
    subject: 'Your Digital Xpress Account Has Been Banned',
    html: emailTemplate(content),
  });
}

export async function sendUnbanEmail(email: string, name?: string) {
  const loginUrl = `${process.env.FRONTEND_URL}/login`;
  const displayName = name || "User";

  const content = `
    <h2 style="color:#16a34a;font-size:22px;margin-top:0;">Account Reinstated</h2>
    <p style="color:#4b5563;font-size:16px;line-height:1.6;">Dear ${displayName},</p>
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
    subject: 'Your Digital Xpress Account Has Been Unbanned',
    html: emailTemplate(content),
  });
}

export async function sendDeletionEmail(email: string, name?: string) {
  const displayName = name || "User";
  const content = `
    <h2 style="color:#dc2626;font-size:22px;margin-top:0;">Account Permanently Deleted</h2>
    <p style="color:#4b5563;font-size:16px;line-height:1.6;">Dear ${displayName},</p>
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
    subject: 'Your Digital Xpress Account Has Been Deleted',
    html: emailTemplate(content),
  });
}