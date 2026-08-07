import { getCheckoutAmountCents } from "@/lib/payments/checkoutAmount";

export const GOOGLE_ADS_TAG_ID = "AW-18375463747";
export const GOOGLE_ADS_PURCHASE_DESTINATION =
  "AW-18375463747/7903CKX6sd0cEMOmjbpE";

const PURCHASE_STORAGE_KEY_PREFIX = "hl_google_ads_purchase:";

type GoogleAdsPurchaseOrder = {
  id?: unknown;
  status?: unknown;
  payment_intent_id?: unknown;
  total_amount_cents?: unknown;
  feedback_credit_cents?: unknown;
};

export type GoogleAdsPurchaseConversion = {
  send_to: typeof GOOGLE_ADS_PURCHASE_DESTINATION;
  value: number;
  currency: "USD";
  transaction_id: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * A conversion is only eligible after the authenticated order read confirms
 * the server has recorded a Stripe-backed authorization (or later capture).
 */
export function buildGoogleAdsPurchaseConversion(
  order: GoogleAdsPurchaseOrder,
): GoogleAdsPurchaseConversion | null {
  const transactionId = text(order.id);
  const paymentIntentId = text(order.payment_intent_id);
  const status = text(order.status);

  if (
    !transactionId ||
    !paymentIntentId ||
    (status !== "authorized" && status !== "captured")
  ) {
    return null;
  }

  try {
    const amountCents = getCheckoutAmountCents({
      id: transactionId,
      total_amount_cents:
        typeof order.total_amount_cents === "number"
          ? order.total_amount_cents
          : null,
      feedback_credit_cents:
        typeof order.feedback_credit_cents === "number"
          ? order.feedback_credit_cents
          : null,
    });

    return {
      send_to: GOOGLE_ADS_PURCHASE_DESTINATION,
      value: Number((amountCents / 100).toFixed(2)),
      currency: "USD",
      transaction_id: transactionId,
    };
  } catch {
    return null;
  }
}

export function hasRecordedGoogleAdsPurchase(
  storage: StorageLike,
  transactionId: string,
): boolean {
  try {
    return storage.getItem(`${PURCHASE_STORAGE_KEY_PREFIX}${transactionId}`) === "1";
  } catch {
    return false;
  }
}

export function recordGoogleAdsPurchase(
  storage: StorageLike,
  transactionId: string,
): void {
  try {
    storage.setItem(`${PURCHASE_STORAGE_KEY_PREFIX}${transactionId}`, "1");
  } catch {
    // Storage can be unavailable in privacy-restricted contexts. Google Ads
    // still receives the stable transaction_id for its own deduplication.
  }
}
