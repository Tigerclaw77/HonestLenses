import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/email/html";
import { supabaseServer } from "@/lib/supabase-server";
import {
  founderAlertKey,
  getFounderAlertRecipient,
  type FounderAlertType,
} from "@/lib/founderAlertConfig";

export { founderAlertKey, getFounderAlertRecipient } from "@/lib/founderAlertConfig";
export type { FounderAlertType } from "@/lib/founderAlertConfig";

type FounderOperationalAlert = {
  orderId: string;
  type: FounderAlertType;
  headline: string;
  detail: string;
  dedupeSuffix?: string;
};

export async function sendFounderOperationalAlert(
  alert: FounderOperationalAlert,
): Promise<{ emailId: string | null; recipient: string }> {
  const recipient = getFounderAlertRecipient();
  const alertKey = founderAlertKey(alert);
  const subject = `[Founder] ${alert.headline}: ${alert.orderId}`;
  const text = [
    "Founder operational action required.",
    "",
    `Order ID: ${alert.orderId}`,
    `Action: ${alert.headline}`,
    `Detail: ${alert.detail}`,
  ].join("\n");

  const result = await sendEmail({
    to: recipient,
    subject,
    text,
    html: `
      <h2>Founder operational action required</h2>
      <p><strong>Order ID:</strong> ${escapeHtml(alert.orderId)}</p>
      <p><strong>Action:</strong> ${escapeHtml(alert.headline)}</p>
      <p><strong>Detail:</strong> ${escapeHtml(alert.detail)}</p>
    `,
    // Resend makes repeated requests with this key a single logical email.
    idempotencyKey: alertKey,
  });

  const emailId = result.data?.id ?? null;
  const { error } = await supabaseServer.from("order_founder_alerts").upsert(
    {
      alert_key: alertKey,
      order_id: alert.orderId,
      alert_type: alert.type,
      recipient,
      resend_email_id: emailId,
    },
    { onConflict: "alert_key", ignoreDuplicates: true },
  );

  if (error) {
    console.error("Founder alert audit write failed", {
      orderId: alert.orderId,
      type: alert.type,
      alertKey,
      error: error.message,
    });
  }

  return { emailId, recipient };
}
