import { getFeedbackAmountDueCents } from "@/lib/abandonmentFeedback";

export type CheckoutAmountOrder = {
  id?: string | null;
  total_amount_cents?: number | null;
  feedback_credit_cents?: number | null;
};

function orderLabel(order: CheckoutAmountOrder): string {
  return order.id ? `Order ${order.id}` : "Order";
}

export function getCheckoutAmountCents(order: CheckoutAmountOrder): number {
  const amount = getFeedbackAmountDueCents(order);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`${orderLabel(order)} has an invalid checkout amount.`);
  }
  return amount;
}

export function checkoutAmountMatchesPaymentIntent(
  order: CheckoutAmountOrder,
  paymentIntentAmountCents: number,
): boolean {
  return (
    Number.isInteger(paymentIntentAmountCents) &&
    paymentIntentAmountCents === getCheckoutAmountCents(order)
  );
}
