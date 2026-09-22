import { isCustomerOrderNumber, isHistoricalOrderUuid, isReceiptEmail, normalizeReceiptEmail, receiptEmailsMatch } from "@/lib/receipts/core";

export const FIND_ORDER_NEUTRAL_MESSAGE = "If the order details match our records, we’ll send a secure order link to the checkout email.";

export function parseFindOrderInput(body: unknown): { orderNumber: string; email: string } | null {
  const input = body as { orderNumber?: unknown; email?: unknown } | null;
  const orderNumber = typeof input?.orderNumber === "string" ? input.orderNumber.trim() : "";
  const email = typeof input?.email === "string" ? normalizeReceiptEmail(input.email) : "";
  return email.length <= 254 && (isCustomerOrderNumber(orderNumber) || isHistoricalOrderUuid(orderNumber)) && isReceiptEmail(email)
    ? { orderNumber, email } : null;
}

export function isRecoverableOrder(order: { id: string; status: string | null; shipping_email: string | null } | null, email: string): order is { id: string; status: string; shipping_email: string } {
  return Boolean(order?.shipping_email && receiptEmailsMatch(order.shipping_email, email) &&
    ["authorized", "captured", "paid", "shipped", "completed", "cancelled", "canceled", "refunded"].includes(order.status?.trim().toLowerCase() ?? ""));
}

export async function deliverMatchedOrderAccess<T extends { id: string; status: string | null; shipping_email: string | null }>(
  order: T | null,
  email: string,
  deliver: (matched: T & { shipping_email: string }) => Promise<void>,
): Promise<void> {
  if (isRecoverableOrder(order, email)) await deliver(order);
}
