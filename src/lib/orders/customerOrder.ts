import { projectOrderCommerce } from "@/lib/orders/orderCommerce";
import { lenses } from "@/LensCore";
import { getLensSkus } from "@/lib/pricing/getLensSkus";
import { getPackSizeFromSku } from "@/lib/cart/skuPackSize";
import { getVisionCarrier } from "@/lib/visionBenefits";

export const CUSTOMER_ORDER_SELECT = `
  id,
  user_id,
  status,
  created_at,
  sku,
  right_box_count,
  left_box_count,
  total_box_count,
  box_count,
  adjusted_right_box_count,
  adjusted_left_box_count,
  adjusted_total_box_count,
  total_amount_cents,
  feedback_credit_cents,
  capture_amount_cents,
  shipping_cents,
  currency,
  verification_status,
  fulfillment_status,
  shipping_first_name,
  shipping_last_name,
  vision_insurance_carrier
  ,customer_order_number
`;

export type CustomerOrder = {
  id: string;
  user_id?: string | null;
  status: string;
  created_at: string;
  sku: string | null;
  right_box_count: number | null;
  left_box_count: number | null;
  total_box_count: number | null;
  box_count: number | null;
  adjusted_right_box_count: number | null;
  adjusted_left_box_count: number | null;
  adjusted_total_box_count: number | null;
  total_amount_cents: number | null;
  feedback_credit_cents: number | null;
  capture_amount_cents: number | null;
  shipping_cents: number | null;
  currency: string | null;
  verification_status: string | null;
  fulfillment_status: string | null;
  shipping_first_name: string | null;
  shipping_last_name: string | null;
  vision_insurance_carrier: string | null;
  customer_order_number?: string | null;
};

export type CustomerOrderQuantities = {
  right: number;
  left: number;
  total: number;
  adjusted: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCustomerOrderId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function getCustomerOrderQuantities(
  order: CustomerOrder,
): CustomerOrderQuantities {
  return projectOrderCommerce(order).quantity;
}

export function getCustomerPaymentStatus(order: CustomerOrder): string {
  const status = order.status.trim().toLowerCase();
  if (["captured", "paid", "shipped", "completed"].includes(status)) {
    return "Paid";
  }
  if (status === "authorized") return "Authorized";
  if (status === "cancelled" || status === "canceled") return "Cancelled";
  if (status === "refunded") return "Refunded";
  return "Awaiting payment";
}

export function isCustomerReceiptAvailable(order: CustomerOrder): boolean {
  const status = order.status.trim().toLowerCase();
  return ["captured", "paid", "shipped", "completed"].includes(status);
}

export function getCustomerVerificationStatus(order: CustomerOrder): string {
  const status = order.verification_status?.trim().toLowerCase();
  if (
    status === "verified" ||
    status === "auto_verified" ||
    status === "ocr_verified" ||
    status === "upload_verified"
  ) {
    return "Verified";
  }
  if (status === "rejected") return "Customer action required";
  if (status === "altered") return "Updated after review";
  return "Verification in progress";
}

export function getCustomerFulfillmentStatus(order: CustomerOrder): string {
  const status = order.fulfillment_status?.trim().toLowerCase();
  if (status === "ready_to_order") return "Ready to order";
  if (status === "ordered") return "Ordered from manufacturer";
  if (status === "shipped") return "Shipped";
  if (status === "completed") return "Completed";
  if (status === "hold") return "On hold";
  return "In review";
}

export function getCustomerNextStep(order: CustomerOrder): string {
  const fulfillment = order.fulfillment_status?.trim().toLowerCase();
  const verification = getCustomerVerificationStatus(order);

  if (fulfillment === "completed") return "Your order is complete.";
  if (fulfillment === "shipped") return "Your shipment is on the way.";
  if (fulfillment === "ordered") {
    return "Your lenses have been ordered from the manufacturer.";
  }
  if (verification === "Customer action required") {
    return "Please check your email for the prescription correction requested.";
  }
  if (verification !== "Verified") {
    return "Prescription verification is in progress. No action is needed unless we contact you.";
  }
  return "Your order is ready for the next fulfillment step.";
}

export function getCustomerAmountCents(order: CustomerOrder): number {
  return projectOrderCommerce(order).billingAmountCents ?? 0;
}

export function formatCustomerMoney(
  cents: number,
  currency = "USD",
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export function getCustomerOrderUrl(orderId: string, siteUrl?: string): string {
  const baseUrl = (
    siteUrl ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    "https://www.honestlenses.com"
  ).replace(/\/$/, "");

  return `${baseUrl}/order/${encodeURIComponent(orderId)}`;
}

export function buildCustomerOrderEmail({
  orderId,
  customerOrderNumber,
  receiptUrl,
  isUploaded,
  uploadedVerificationComplete = false,
  siteUrl,
}: {
  orderId: string;
  customerOrderNumber: string;
  receiptUrl: string;
  isUploaded: boolean;
  uploadedVerificationComplete?: boolean;
  siteUrl?: string;
}): { subject: string; html: string; text: string; orderUrl: string } {
  const orderUrl = getCustomerOrderUrl(orderId, siteUrl);
  const verificationMessage = uploadedVerificationComplete
    ? "Your uploaded prescription was verified and your payment was completed."
    : isUploaded
      ? "Your prescription has been received and is awaiting required review."
    : "We will contact your doctor to verify your prescription before shipping.";

  return {
    subject: "Order received - Honest Lenses",
    orderUrl,
    html: `
      <h2>Thank you for your order</h2>
      <p>Your order has been received and is now being processed.</p>
      <p><strong>Order number:</strong> ${escapeHtml(customerOrderNumber)}</p>
      <p>${verificationMessage}</p>
      <p><a href="${escapeHtml(orderUrl)}">View Your Order</a></p>
      <hr style="border:0;border-top:1px solid #d9dee8;margin:24px 0" />
      <h3>Using HSA/FSA funds or requesting reimbursement?</h3>
      <p>Open your secure receipt link. Your itemized receipt is available there after payment is captured.</p>
      <p><a href="${escapeHtml(receiptUrl)}" style="display:inline-block;padding:12px 18px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:8px">Open secure receipt</a></p>
      <p>You will receive updates as your order progresses.</p>
      <p>- Honest Lenses</p>
    `,
    text: `Thank you for your order.\n\nOrder number: ${customerOrderNumber}\n\n${verificationMessage}\n\nView Your Order: ${orderUrl}\n\nUsing HSA/FSA funds or requesting reimbursement?\nOpen your secure receipt link. Your itemized receipt is available there after payment is captured.\nOpen secure receipt: ${receiptUrl}\n\n- Honest Lenses`,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

export function buildCustomerReceiptHtml(order: CustomerOrder): string {
  const quantities = getCustomerOrderQuantities(order);
  const currency = order.currency ?? "USD";
  const created = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(order.created_at));
  const customerName = [order.shipping_first_name, order.shipping_last_name]
    .filter(Boolean)
    .join(" ");
  const lens = order.sku
    ? lenses.find((candidate) => getLensSkus(candidate).includes(order.sku!))
    : null;
  const productName = lens?.displayName ?? order.sku ?? "Contact lenses";
  const packSize = order.sku ? getPackSizeFromSku(order.sku) : null;
  const capturedAmountCents = Math.max(
    0,
    order.capture_amount_cents ?? getCustomerAmountCents(order),
  );
  const shippingCents = Math.min(
    capturedAmountCents,
    Math.max(0, order.shipping_cents ?? 0),
  );
  const lensAmountCents = capturedAmountCents - shippingCents;
  const carrier = getVisionCarrier(order.vision_insurance_carrier);
  const formatBoxQuantity = (boxes: number) =>
    `${boxes} ${boxes === 1 ? "box" : "boxes"}`;
  const rightQuantity = packSize
    ? `${formatBoxQuantity(quantities.right)} (${quantities.right * packSize} lenses)`
    : formatBoxQuantity(quantities.right);
  const leftQuantity = packSize
    ? `${formatBoxQuantity(quantities.left)} (${quantities.left * packSize} lenses)`
    : formatBoxQuantity(quantities.left);
  const itemQuantity = `Right eye: ${rightQuantity}; Left eye: ${leftQuantity}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>Honest Lenses receipt ${escapeHtml(order.id)}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #172033; margin: 40px; line-height: 1.45; }
      main { max-width: 760px; margin: 0 auto; }
      h1 { margin-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; margin: 24px 0; }
      th, td { padding: 10px 0; border-bottom: 1px solid #d9dee8; text-align: left; }
      th:last-child, td:last-child { text-align: right; }
      .total { font-size: 20px; font-weight: 700; }
      .muted { color: #5d6677; }
      .store { margin: 20px 0; }
    </style>
  </head>
  <body>
    <main>
      <h1>Honest Lenses Receipt</h1>
      <p class="muted">Itemized receipt for vision-plan or HSA/FSA reimbursement</p>
      <div class="store">
        <strong>Honest Lenses</strong><br />
        honestlenses.com<br />
        support@honestlenses.com
      </div>
      <p><strong>Order number:</strong> ${escapeHtml(order.id)}</p>
      <p><strong>Purchase/service date:</strong> ${escapeHtml(created)}</p>
      ${customerName ? `<p><strong>Patient/customer:</strong> ${escapeHtml(customerName)}</p>` : ""}
      ${carrier ? `<p><strong>Vision plan selected by customer:</strong> ${escapeHtml(carrier.label)}</p>` : ""}
      <table>
        <thead><tr><th>Item</th><th>Quantity</th><th>Amount</th></tr></thead>
        <tbody>
          <tr><td>${escapeHtml(productName)}</td><td>${escapeHtml(itemQuantity)}</td><td>${escapeHtml(formatCustomerMoney(lensAmountCents, currency))}</td></tr>
          ${shippingCents > 0 ? `<tr><td>Shipping</td><td>1</td><td>${escapeHtml(formatCustomerMoney(shippingCents, currency))}</td></tr>` : ""}
        </tbody>
      </table>
      <p>Payment status: <strong>Paid</strong></p>
      <p class="total">Total paid/captured: ${escapeHtml(formatCustomerMoney(capturedAmountCents, currency))}</p>
      <p><strong>Claim reference:</strong> HCPCS S0500 — disposable contact lens, per lens.</p>
      <p class="muted">Benefits and reimbursement vary by plan. This receipt documents the purchase; it is not a guarantee of coverage or reimbursement.</p>
    </main>
  </body>
</html>`;
}
