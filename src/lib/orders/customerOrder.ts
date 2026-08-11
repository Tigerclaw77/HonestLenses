import { projectOrderCommerce } from "@/lib/orders/orderCommerce";

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
  currency,
  verification_status,
  fulfillment_status,
  shipping_first_name,
  shipping_last_name
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
  currency: string | null;
  verification_status: string | null;
  fulfillment_status: string | null;
  shipping_first_name: string | null;
  shipping_last_name: string | null;
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
  isUploaded,
  uploadedVerificationComplete = false,
  siteUrl,
}: {
  orderId: string;
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
      <p><strong>Order ID:</strong> ${orderId}</p>
      <p>${verificationMessage}</p>
      <p><a href="${orderUrl}">View Your Order</a></p>
      <p>You will receive updates as your order progresses.</p>
      <p>- Honest Lenses</p>
    `,
    text: `Thank you for your order.\n\nOrder ID: ${orderId}\n\n${verificationMessage}\n\nView Your Order: ${orderUrl}\n\n- Honest Lenses`,
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
  const amount = formatCustomerMoney(getCustomerAmountCents(order), currency);
  const created = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(order.created_at));
  const customerName = [order.shipping_first_name, order.shipping_last_name]
    .filter(Boolean)
    .join(" ");

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
    </style>
  </head>
  <body>
    <main>
      <h1>Honest Lenses Receipt</h1>
      <p class="muted">Order ${escapeHtml(order.id)} | ${escapeHtml(created)}</p>
      ${customerName ? `<p>Customer: ${escapeHtml(customerName)}</p>` : ""}
      <table>
        <thead><tr><th>Item</th><th>Boxes</th></tr></thead>
        <tbody>
          <tr><td>${escapeHtml(order.sku ?? "Contact lenses")} - Right eye</td><td>${quantities.right}</td></tr>
          <tr><td>${escapeHtml(order.sku ?? "Contact lenses")} - Left eye</td><td>${quantities.left}</td></tr>
        </tbody>
      </table>
      <p>Payment status: <strong>${escapeHtml(getCustomerPaymentStatus(order))}</strong></p>
      <p>Prescription status: <strong>${escapeHtml(getCustomerVerificationStatus(order))}</strong></p>
      <p class="total">Order amount: ${escapeHtml(amount)}</p>
      <p class="muted">This receipt reflects the order information currently recorded by Honest Lenses.</p>
    </main>
  </body>
</html>`;
}
