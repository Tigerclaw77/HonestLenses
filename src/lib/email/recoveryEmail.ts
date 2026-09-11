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
  siteUrl,
  resumeUrl,
}: RecoveryEmailDraftInput): RecoveryEmailDraft {
  const firstName = customerName?.trim() || null;
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const cartUrl = resumeUrl ?? `${normalizeSiteUrl(siteUrl)}/resume-order`;
  const subject = "Complete your Honest Lenses order";
  const text = [
    greeting,
    "",
    "It looks like you started an order with Honest Lenses but didn’t finish checking out.",
    "",
    "If you’d still like to complete your order, you can securely pick up where you left off here:",
    "",
    cartUrl,
    "",
    "If you no longer wish to complete the order, no action is needed.",
    "",
    "Thank you,",
    "Honest Lenses",
  ].join("\n");

  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    "<p>It looks like you started an order with Honest Lenses but didn’t finish checking out.</p>",
    "<p>If you’d still like to complete your order, you can securely pick up where you left off here:</p>",
    `<p><a href="${escapeHtml(cartUrl)}">${escapeHtml(cartUrl)}</a></p>`,
    "<p>If you no longer wish to complete the order, no action is needed.</p>",
    "<p>Thank you,<br>Honest Lenses</p>",
  ].join("\n");

  return {
    to: customerEmail?.trim().toLowerCase() || null,
    subject,
    text,
    html,
  };
}
