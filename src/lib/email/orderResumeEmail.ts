type OrderResumeEmailInput = {
  resumeUrl: string;
  expiresMinutes: number;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildOrderResumeEmail({
  resumeUrl,
  expiresMinutes,
}: OrderResumeEmailInput) {
  const subject = "Resume your Honest Lenses order";
  const text = [
    "Resume your unfinished Honest Lenses order:",
    "",
    resumeUrl,
    "",
    `This secure link expires in ${expiresMinutes} minutes and can only be used once.`,
    "",
    "If you did not request this, you can ignore this email.",
    "",
    "Honest Lenses",
  ].join("\n");

  const escapedUrl = escapeHtml(resumeUrl);
  const html = `
    <p>Resume your unfinished Honest Lenses order:</p>
    <p><a href="${escapedUrl}">Resume Order</a></p>
    <p style="color:#555;font-size:13px;">This secure link expires in ${expiresMinutes} minutes and can only be used once.</p>
    <p style="color:#555;font-size:13px;">If you did not request this, you can ignore this email.</p>
    <p>Honest Lenses</p>
  `;

  return { subject, text, html };
}
