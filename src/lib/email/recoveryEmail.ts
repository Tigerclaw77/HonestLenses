export type RecoveryEmailDraftInput = {
  customerName?: string | null;
  customerEmail?: string | null;
  orderId: string;
  siteUrl?: string | null;
  resumeUrl?: string;
  postalAddress?: string;
  unsubscribeUrl?: string;
};

export type RecoveryEmailDraft = {
  to: string | null;
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeSiteUrl(value?: string | null): string {
  return (value ?? "https://honestlenses.com").replace(/\/$/, "");
}

export function buildAbandonedCheckoutRecoveryEmail({
  customerName,
  customerEmail,
  orderId,
  siteUrl,
  resumeUrl,
  postalAddress,
  unsubscribeUrl,
}: RecoveryEmailDraftInput): RecoveryEmailDraft {
  const name = customerName?.trim() || "there";
  const cartUrl = resumeUrl ?? `${normalizeSiteUrl(siteUrl)}/resume-order`;
  const subject = "Need help finishing your HonestLenses order?";
  const text = [
    `Hi ${name},`,
    "",
    "It looks like your HonestLenses order was started but not finished.",
    "",
    "If you still need lenses, you can return to your cart and complete the remaining steps. If anything felt confusing or you need help with prescription details, reply to this email and we can help.",
    "",
    "We will not ship or capture payment unless checkout is completed and the order is authorized.",
    "",
    `Return to cart: ${cartUrl}`,
    "",
    `Order reference: ${orderId}`,
    "",
    "HonestLenses",
    ...(postalAddress && unsubscribeUrl ? ["Commercial reminder about your unfinished checkout.",postalAddress,`Stop commercial emails: ${unsubscribeUrl}`] : []),
  ].join("\n");

  const html = `
    <p>Hi ${escapeHtml(name)},</p>
    <p>It looks like your HonestLenses order was started but not finished.</p>
    <p>If you still need lenses, you can return to your cart and complete the remaining steps. If anything felt confusing or you need help with prescription details, reply to this email and we can help.</p>
    <p>We will not ship or capture payment unless checkout is completed and the order is authorized.</p>
    <p><a href="${escapeHtml(cartUrl)}">Return to cart</a></p>
    <p style="color:#555;font-size:13px;">Order reference: ${escapeHtml(orderId)}</p>
    <p>HonestLenses</p>
    ${postalAddress && unsubscribeUrl ? `<p>Commercial reminder about your unfinished checkout.</p><p>${escapeHtml(postalAddress)}</p><p><a href="${escapeHtml(unsubscribeUrl)}">Stop commercial emails</a></p>` : ""}
  `;

  return {
    to: customerEmail?.trim().toLowerCase() || null,
    subject,
    text,
    html,
  };
}
