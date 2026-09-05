import { supabaseServer } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/email";
import { buildCustomerOrderEmail } from "@/lib/orders/customerOrder";
import { ensureCustomerOrderNumber, issueReceiptAccessToken, getReceiptUrl } from "./server";

/** A payment webhook can retry a failed checkout email without recapturing. */
export async function ensureOrderConfirmation(orderId: string): Promise<void> {
  const { data: order, error } = await supabaseServer.from("orders").select(
    "id, status, shipping_email, confirmation_email_sent_at, rx_upload_path, verification_status",
  ).eq("id", orderId).single();
  if (error || !order) throw new Error("Confirmation order facts unavailable");
  if (order.confirmation_email_sent_at) return;
  if (!["authorized", "captured", "paid", "shipped", "completed"].includes(order.status)) return;
  const { data: sent, error: ledgerError } = await supabaseServer.from("order_email_deliveries")
    .select("resend_email_id").eq("order_id", orderId).eq("email_type", "order_confirmation").limit(1);
  if (ledgerError) throw new Error("Confirmation delivery ledger unavailable");
  if (sent?.length) return;
  if (!order.shipping_email) throw new Error("Confirmation recipient unavailable");
  const customerOrderNumber = await ensureCustomerOrderNumber(orderId);
  const access = await issueReceiptAccessToken(orderId, "confirmation");
  const message = buildCustomerOrderEmail({ orderId, customerOrderNumber,
    receiptUrl: getReceiptUrl(access.token), isUploaded: Boolean(order.rx_upload_path),
    uploadedVerificationComplete: ["verified", "auto_verified"].includes(order.verification_status ?? "") });
  await sendEmail({ to: order.shipping_email, ...message,
    tracking: { orderId, emailType: "order_confirmation" }, idempotencyKey: `order-confirmation:${orderId}` });
}
