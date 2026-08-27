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
  const attemptedAt = new Date().toISOString();

  // The database record is the durable delivery ledger.  Do not invoke the
  // provider again after a recorded successful send; this keeps dashboard
  // reconciliation safe to run repeatedly.
  const { data: previous, error: previousError } = await supabaseServer
    .from("order_founder_alerts")
    .select("resend_email_id")
    .eq("alert_key", alertKey)
    .maybeSingle();
  if (previousError) {
    console.error("Founder alert audit lookup failed", {
      orderId: alert.orderId,
      type: alert.type,
      alertKey,
      error: previousError.message,
    });
  }
  if (previous?.resend_email_id) {
    return { emailId: previous.resend_email_id, recipient };
  }

  const subject = `[Founder] ${alert.headline}: ${alert.orderId}`;
  const text = [
    "Founder operational action required.",
    "",
    `Order ID: ${alert.orderId}`,
    `Action: ${alert.headline}`,
    `Detail: ${alert.detail}`,
  ].join("\n");

  try {
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
        sent_at: attemptedAt,
        last_attempted_at: attemptedAt,
        last_error: null,
      },
      { onConflict: "alert_key" },
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown send error";
    const { error: auditError } = await supabaseServer
      .from("order_founder_alerts")
      .upsert(
        {
          alert_key: alertKey,
          order_id: alert.orderId,
          alert_type: alert.type,
          recipient,
          resend_email_id: null,
          last_attempted_at: attemptedAt,
          last_error: message.slice(0, 1000),
        },
        { onConflict: "alert_key" },
      );
    if (auditError) {
      console.error("Founder alert failure audit write failed", {
        orderId: alert.orderId,
        type: alert.type,
        alertKey,
        error: auditError.message,
      });
    }
    throw error;
  }
}
