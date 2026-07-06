import { Resend } from "resend";

export type AuthorizationExpirationWarningLevel = "72h" | "24h";

export type PaymentAuthorizationExpirationWarningInput = {
  to: string | string[];
  customerName: string;
  orderId: string;
  amount: string;
  authorizationExpiresAt: Date;
  verificationStatus: string;
  adminOrderUrl: string;
  warningLevel: AuthorizationExpirationWarningLevel;
};

const FROM_ORDERS = "Honest Lenses <orders@honestlenses.com>";
const REPLY_TO_SUPPORT = "support@honestlenses.com";
const SUBJECT = "🔴 Payment Authorization Expiring Soon";

function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  return new Resend(apiKey);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatExpiration(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  }).format(value);
}

export function buildPaymentAuthorizationExpirationWarningEmail({
  customerName,
  orderId,
  amount,
  authorizationExpiresAt,
  verificationStatus,
  adminOrderUrl,
  warningLevel,
}: Omit<PaymentAuthorizationExpirationWarningInput, "to">): {
  subject: string;
  text: string;
  html: string;
} {
  const expiresAt = formatExpiration(authorizationExpiresAt);
  const warningLabel = warningLevel === "24h" ? "24-hour reminder" : "72-hour warning";

  const text = [
    SUBJECT,
    "",
    `Warning: ${warningLabel}`,
    `Customer: ${customerName}`,
    `Order ID: ${orderId}`,
    `Amount: ${amount}`,
    `Authorization expires: ${expiresAt}`,
    `Verification status: ${verificationStatus}`,
    "",
    `Open admin order: ${adminOrderUrl}`,
  ].join("\n");

  const html = `
    <h2>${escapeHtml(SUBJECT)}</h2>
    <p><strong>Warning:</strong> ${escapeHtml(warningLabel)}</p>
    <table style="border-collapse:collapse;line-height:1.6;">
      <tr><td style="padding-right:16px;"><strong>Customer</strong></td><td>${escapeHtml(customerName)}</td></tr>
      <tr><td style="padding-right:16px;"><strong>Order ID</strong></td><td>${escapeHtml(orderId)}</td></tr>
      <tr><td style="padding-right:16px;"><strong>Amount</strong></td><td>${escapeHtml(amount)}</td></tr>
      <tr><td style="padding-right:16px;"><strong>Authorization expires</strong></td><td>${escapeHtml(expiresAt)}</td></tr>
      <tr><td style="padding-right:16px;"><strong>Verification status</strong></td><td>${escapeHtml(verificationStatus)}</td></tr>
    </table>
    <p><a href="${escapeHtml(adminOrderUrl)}">Open order in admin</a></p>
  `;

  return { subject: SUBJECT, text, html };
}

export async function sendPaymentAuthorizationExpirationWarningEmail(
  input: PaymentAuthorizationExpirationWarningInput,
) {
  const { subject, text, html } =
    buildPaymentAuthorizationExpirationWarningEmail(input);

  return getResend().emails.send({
    from: FROM_ORDERS,
    to: input.to,
    subject,
    text,
    html,
    replyTo: REPLY_TO_SUPPORT,
  });
}
