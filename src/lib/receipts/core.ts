import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lenses } from "@/LensCore";
import { getPackSizeFromSku } from "@/lib/cart/skuPackSize";
import { getLensSkus } from "@/lib/pricing/getLensSkus";
import { getPricePerBox } from "@/lib/pricing/getPricePerBox";
import { getAuthoritativeOrderQuantity } from "@/lib/orders/orderQuantity";

export const RECEIPT_RETRIEVAL_TOKEN_TTL_MINUTES = 60;
export const RECEIPT_CONFIRMATION_TOKEN_TTL_DAYS = 30;
export const RECEIPT_ORDER_STATUS_TOKEN_TTL_MINUTES = 30;

export type ReceiptTokenPurpose = "confirmation" | "order_status" | "retrieval";

export type ReceiptLine = {
  description: string;
  packSize: number | null;
  rightBoxes: number;
  leftBoxes: number;
  totalBoxes: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

export type ReceiptSnapshot = {
  version: 1;
  merchantName: "Honest Lenses";
  supportEmail: "support@honestlenses.com";
  documentTitle: "PAID ITEMIZED RECEIPT";
  orderNumber: string;
  paymentDate: string;
  customerName: string | null;
  line: ReceiptLine;
  adjustmentCents: number;
  shippingMethod: string;
  shippingCents: number;
  taxCents: number;
  amountPaidCents: number;
  currency: string;
  cardBrand: string | null;
  cardLast4: string | null;
  paymentStatus: "Paid";
  eligibilityLabel: "HSA/FSA eligible medical expense";
  disclaimer: "Eligibility and reimbursement are determined by your plan administrator. Keep this receipt with your records.";
};

export type ReceiptOrderSource = {
  id: string;
  customer_order_number?: string | null;
  created_at?: string | null;
  sku?: string | null;
  right_box_count?: number | null;
  left_box_count?: number | null;
  total_box_count?: number | null;
  box_count?: number | null;
  adjusted_right_box_count?: number | null;
  adjusted_left_box_count?: number | null;
  adjusted_total_box_count?: number | null;
  total_amount_cents?: number | null;
  capture_amount_cents?: number | null;
  feedback_credit_cents?: number | null;
  shipping_cents?: number | null;
  shipping_method?: string | null;
  price_reason?: string | null;
  tax_cents?: number | null;
  currency?: string | null;
  shipping_first_name?: string | null;
  shipping_last_name?: string | null;
};

export type ReceiptPaymentSource = {
  amountReceivedCents: number;
  currency: string;
  capturedAt: string;
  cardBrand?: string | null;
  cardLast4?: string | null;
};

function receiptSecret(): string {
  const secret =
    process.env.RECEIPT_TOKEN_SECRET?.trim() ||
    process.env.ORDER_RESUME_TOKEN_SECRET?.trim();
  if (!secret) throw new Error("RECEIPT_TOKEN_SECRET is required");
  return secret;
}

function hmac(material: string): Buffer {
  return createHmac("sha256", receiptSecret()).update(material).digest();
}

export function createRandomReceiptToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createStableReceiptToken(
  orderId: string,
  purpose: Exclude<ReceiptTokenPurpose, "retrieval">,
  expiresAt: string,
): string {
  return hmac(`receipt-access\n${purpose}\n${orderId}\n${expiresAt}`).toString(
    "base64url",
  );
}

export function hashReceiptToken(token: string): string {
  return createHmac("sha256", receiptSecret())
    .update("receipt-token-hash\n")
    .update(token)
    .digest("hex");
}

export function receiptTokenHashesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function getReceiptExpiry(minutes: number, now = Date.now()): string {
  return new Date(now + minutes * 60 * 1000).toISOString();
}

export function isReceiptTokenActive(
  expiresAt: string,
  revokedAt?: string | null,
  now = Date.now(),
): boolean {
  const expiry = new Date(expiresAt).getTime();
  return !revokedAt && Number.isFinite(expiry) && expiry > now;
}

export function createCustomerOrderNumber(now = new Date()): string {
  const year = now.getUTCFullYear();
  const suffix = randomBytes(6).toString("hex").toUpperCase();
  return `HL-${year}-${suffix}`;
}

export function normalizeReceiptEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function receiptEmailsMatch(left: string, right: string): boolean {
  const leftHash = createHash("sha256")
    .update(normalizeReceiptEmail(left))
    .digest();
  const rightHash = createHash("sha256")
    .update(normalizeReceiptEmail(right))
    .digest();
  return timingSafeEqual(leftHash, rightHash);
}

export function isReceiptEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isCustomerOrderNumber(value: string): boolean {
  return /^HL-\d{4}-[A-F0-9]{12}$/i.test(value.trim());
}

export function isHistoricalOrderUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

function money(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

export function buildReceiptSnapshot(
  order: ReceiptOrderSource,
  payment: ReceiptPaymentSource,
): ReceiptSnapshot {
  const orderNumber = order.customer_order_number?.trim();
  if (!orderNumber || !isCustomerOrderNumber(orderNumber)) {
    throw new Error("Customer order number is unavailable");
  }
  const sku = order.sku?.trim();
  if (!sku) throw new Error("Receipt product SKU is unavailable");
  if (order.price_reason !== "flat_retail_v1") {
    throw new Error("Receipt pricing provenance is not trustworthy");
  }

  const quantity = getAuthoritativeOrderQuantity(order);
  if (quantity.total <= 0 || quantity.right + quantity.left !== quantity.total) {
    throw new Error("Receipt quantities cannot be reconciled");
  }

  const unitPriceCents = getPricePerBox(sku);
  const lens = lenses.find((candidate) => getLensSkus(candidate).includes(sku));
  if (!unitPriceCents || !lens?.displayName) {
    throw new Error("Receipt product pricing cannot be reconstructed accurately");
  }

  const shippingCents = money(order.shipping_cents);
  const taxCents = money(order.tax_cents);
  const lineTotalCents = unitPriceCents * quantity.total;
  const storedTotal = money(order.total_amount_cents);
  if (storedTotal !== lineTotalCents + shippingCents + taxCents) {
    throw new Error("Receipt line items do not reconcile to the stored order total");
  }

  const amountPaidCents = money(payment.amountReceivedCents);
  if (amountPaidCents <= 0 || !Number.isFinite(new Date(payment.capturedAt).getTime())) {
    throw new Error("Captured payment facts are unavailable");
  }
  const adjustmentCents =
    amountPaidCents - lineTotalCents - shippingCents - taxCents;
  const currency = payment.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Receipt currency is invalid");

  const customerName = [order.shipping_first_name, order.shipping_last_name]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" ");

  return {
    version: 1,
    merchantName: "Honest Lenses",
    supportEmail: "support@honestlenses.com",
    documentTitle: "PAID ITEMIZED RECEIPT",
    orderNumber,
    paymentDate: new Date(payment.capturedAt).toISOString(),
    customerName: customerName || null,
    line: {
      description: lens.displayName,
      packSize: getPackSizeFromSku(sku),
      rightBoxes: quantity.right,
      leftBoxes: quantity.left,
      totalBoxes: quantity.total,
      unitPriceCents,
      lineTotalCents,
    },
    adjustmentCents,
    shippingMethod: order.shipping_method?.trim() || "Standard shipping",
    shippingCents,
    taxCents,
    amountPaidCents,
    currency,
    cardBrand: payment.cardBrand?.trim() || null,
    cardLast4: /^\d{4}$/.test(payment.cardLast4 ?? "")
      ? payment.cardLast4!
      : null,
    paymentStatus: "Paid",
    eligibilityLabel: "HSA/FSA eligible medical expense",
    disclaimer:
      "Eligibility and reimbursement are determined by your plan administrator. Keep this receipt with your records.",
  };
}

export function receiptSnapshotContainsProhibitedData(snapshot: unknown): boolean {
  const serialized = JSON.stringify(snapshot).toLowerCase();
  return [
    "payment_intent",
    "prescriber",
    "prescription",
    "shipping_address",
    "date_of_birth",
    "cylinder",
    "base_curve",
    "vendor_cost",
  ].some((term) => serialized.includes(term));
}
