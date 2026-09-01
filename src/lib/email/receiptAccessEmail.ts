import { escapeHtml } from "@/lib/email/html";

export function buildReceiptAccessEmail({
  receiptUrl,
  expiresMinutes,
}: {
  receiptUrl: string;
  expiresMinutes: number;
}) {
  const subject = "Your Honest Lenses receipt link";
  const preview = "Use this secure link to access your receipt.";
  return {
    subject,
    preview,
    text: `${preview}\n\nOpen secure receipt: ${receiptUrl}\n\nThis link expires in ${expiresMinutes} minutes. If you did not request it, you can ignore this email.`,
    html: `
      <div style="display:none;max-height:0;overflow:hidden">${preview}</div>
      <h2>Your receipt link</h2>
      <p>Use the secure link below to access your receipt.</p>
      <p><a href="${escapeHtml(receiptUrl)}" style="display:inline-block;padding:12px 18px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:8px">Open secure receipt</a></p>
      <p>This link expires in ${expiresMinutes} minutes. If you did not request it, you can ignore this email.</p>
    `,
  };
}
