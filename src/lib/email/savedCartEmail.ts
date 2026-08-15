type SavedCartEmailInput = {
  resumeUrl: string;
  expiresDays: number;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildSavedCartEmail({
  resumeUrl,
  expiresDays,
}: SavedCartEmailInput) {
  const subject = "Your Honest Lenses cart is saved";
  const text = [
    "Your Honest Lenses cart is saved.",
    "",
    "Use this secure link to return to your cart:",
    resumeUrl,
    "",
    `This secure link expires in ${expiresDays} days. You can use it to return to your cart during that time.`,
    "",
    "This is not a marketing subscription. If you did not request this, you can ignore this email.",
    "",
    "Honest Lenses",
  ].join("\n");

  return {
    subject,
    text,
    html: `
      <p>Your Honest Lenses cart is saved.</p>
      <p><a href="${escapeHtml(resumeUrl)}">Return to your cart</a></p>
      <p style="color:#555;font-size:13px;">This secure link expires in ${expiresDays} days. You can use it to return to your cart during that time.</p>
      <p style="color:#555;font-size:13px;">This is not a marketing subscription. If you did not request this, you can ignore this email.</p>
      <p>Honest Lenses</p>
    `,
  };
}
