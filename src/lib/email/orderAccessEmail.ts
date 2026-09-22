import { ORDER_ACCESS_TOKEN_TTL_DAYS } from "@/lib/orders/orderAccessToken";

export function buildOrderAccessEmail(orderUrl: string): { subject: string; html: string; text: string } {
  return {
    subject: "Your Honest Lenses order link",
    html: `<p>Here is the secure link you requested to view your Honest Lenses order.</p><p><a href="${orderUrl}">View Your Order</a></p><p>This link expires in ${ORDER_ACCESS_TOKEN_TTL_DAYS} days. If it expires, you can request another from Find Your Order.</p><p>If you did not request this, you can ignore this email.</p>`,
    text: `Here is the secure link you requested to view your Honest Lenses order.\n\nView Your Order: ${orderUrl}\n\nThis link expires in ${ORDER_ACCESS_TOKEN_TTL_DAYS} days. If it expires, you can request another from Find Your Order.\n\nIf you did not request this, you can ignore this email.`,
  };
}
