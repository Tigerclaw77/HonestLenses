import type Stripe from "stripe";
import { buildReceiptSnapshot, isReceiptEmail, type ReceiptOrderSource, type ReceiptSnapshot } from "./core";
import { getCaptureAmountCents } from "@/lib/payments/captureAmount";
import { buildCustomerOrderEmail } from "@/lib/orders/customerOrder";
import { escapeHtml } from "@/lib/email/html";
import { record, selectedProduct } from "@/lib/orders/productSelection";
import { lenses } from "@/LensCore";
import { getLensSkus } from "@/lib/pricing/getLensSkus";

export type AdminReceiptType = "receipt" | "itemized";
export type AdminReceiptOrder = ReceiptOrderSource & {
  shipping_email?: string | null;
  payment_intent_id?: string | null;
  status?: string | null;
  rx?: unknown;
};

export function reconcileAdminReceipt(order: AdminReceiptOrder, intent: Stripe.PaymentIntent,
  saved: ReceiptSnapshot | null): ReceiptSnapshot {
  if (!isReceiptEmail(order.shipping_email?.trim() ?? "")) throw new Error("A valid customer email is required.");
  if (intent.id !== order.payment_intent_id || intent.metadata.order_id !== order.id ||
      intent.status !== "succeeded" || intent.amount_received <= 0) {
    throw new Error("A captured payment belonging to this order is required.");
  }
  const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  if (!charge || charge.refunded || charge.amount_refunded > 0 || charge.disputed) {
    throw new Error("Payment details are unavailable, refunded, or disputed; review before sending.");
  }
  const payment = { amountReceivedCents: intent.amount_received, currency: intent.currency,
    capturedAt: saved?.paymentDate ?? new Date(charge.created * 1000).toISOString(),
    cardBrand: charge.payment_method_details?.card?.brand,
    cardLast4: charge.payment_method_details?.card?.last4 };
  // Validate current canonical quantities/prices as well as any immutable capture snapshot.
  const current = buildReceiptSnapshot(order, payment);
  if (saved && (Object.entries(current.line).some(([key, value]) => saved.line[key as keyof typeof saved.line] !== value) ||
      saved.orderNumber !== current.orderNumber || saved.currency !== current.currency ||
      saved.shippingCents !== current.shippingCents || saved.taxCents !== current.taxCents ||
      saved.adjustmentCents !== current.adjustmentCents || saved.amountPaidCents !== intent.amount_received)) {
    throw new Error("Current order details differ from the paid receipt; review before sending.");
  }
  if (current.line.lineTotalCents + current.adjustmentCents + current.shippingCents + current.taxCents !==
      getCaptureAmountCents(order)) throw new Error("Receipt totals do not reconcile.");
  const product = lenses.find(lens => getLensSkus(lens).includes(order.sku ?? ""));
  const selected = selectedProduct(order);
  for (const eye of ["right", "left"] as const) {
    const count = eye === "right" ? current.line.rightBoxes : current.line.leftBoxes;
    if (count > 0 && selected[eye] && selected[eye] !== product?.coreId) {
      throw new Error("Stored eye product differs from the purchased SKU; review before sending.");
    }
  }
  return current;
}

export function buildAdminReceiptEmail(type: AdminReceiptType, order: AdminReceiptOrder, receipt: ReceiptSnapshot) {
  const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: receipt.currency }).format(cents / 100);
  const date = order.created_at && Number.isFinite(Date.parse(order.created_at))
    ? new Date(order.created_at).toISOString().slice(0, 10) : null;
  const summary = [
    `Order number: ${receipt.orderNumber}`, ...(date ? [`Order date: ${date} (UTC)`] : []),
    ...(receipt.customerName ? [`Customer: ${receipt.customerName}`] : []),
    `Email: ${order.shipping_email!.trim()}`, `Payment status: Paid`,
    `Total paid: ${money(receipt.amountPaidCents)}`,
  ];
  if (type === "receipt") return buildCustomerOrderEmail({ orderId: order.id,
    customerOrderNumber: receipt.orderNumber, receiptUrl: "", isUploaded: false,
    paidReceiptSummary: summary });

  const rows: string[][] = [];
  for (const [eye, label, count] of [["right", "OD (right)", receipt.line.rightBoxes],
    ["left", "OS (left)", receipt.line.leftBoxes]] as const) {
    if (!count) continue;
    const rx = record(record(order.rx)[eye]);
    const details: string[] = [];
    for (const [label, keys] of [["Sphere", ["sphere"]], ["Cylinder", ["cyl", "cylinder"]],
      ["Axis", ["axis"]], ["Add", ["add"]], ["Base curve", ["base_curve", "baseCurve", "bc"]],
      ["Diameter", ["diameter", "dia"]]] as const) {
      const value = keys.map(key => rx[key]).find(value =>
        (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.trim()));
      if (value !== undefined) details.push(`${label}: ${value}`);
    }
    rows.push([receipt.line.description, label, details.join("; ") || "Not recorded",
      receipt.line.packSize ? `${receipt.line.packSize} lenses/box` : "Not recorded",
      String(count), money(receipt.line.unitPriceCents), money(count * receipt.line.unitPriceCents)]);
  }
  const totals = [`Merchandise: ${money(receipt.line.lineTotalCents)}`,
    ...(receipt.adjustmentCents ? [`Discount / approved adjustment: ${money(receipt.adjustmentCents)}`] : []),
    `Shipping${order.shipping_method ? ` (${order.shipping_method})` : ""}: ${money(receipt.shippingCents)}`,
    `Tax: ${money(receipt.taxCents)}`, `Total paid: ${money(receipt.amountPaidCents)}`];
  const headers = ["Product", "Eye", "Lens details", "Pack size", "Boxes", "Price / box", "Line total"];
  return {
    subject: `Your Honest Lenses itemized receipt — ${receipt.orderNumber}`,
    text: ["Honest Lenses — Itemized receipt", ...summary, "", headers.join(" | "),
      ...rows.map(row => row.join(" | ")), "", ...totals, "", receipt.disclaimer,
      "Questions? support@honestlenses.com"].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;color:#172033;max-width:860px;margin:auto;padding:24px">
      <h1>Honest Lenses</h1><h2>Itemized receipt</h2>
      ${summary.map(line => `<p>${escapeHtml(line)}</p>`).join("")}
      <table style="width:100%;border-collapse:collapse;text-align:left"><thead><tr>${headers.map(h => `<th style="padding:8px;border-bottom:2px solid #cbd5e1">${h}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(row => `<tr>${row.map(cell => `<td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>
      ${totals.map(line => `<p>${escapeHtml(line)}</p>`).join("")}
      <p>${escapeHtml(receipt.disclaimer)}</p><p>Questions? <a href="mailto:support@honestlenses.com">support@honestlenses.com</a></p></div>`,
  };
}
