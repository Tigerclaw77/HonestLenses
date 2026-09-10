import { supabaseServer } from "@/lib/supabase-server";
import type {
  DeliveryEventApplyResult,
  NormalizedResendDeliveryEvent,
} from "@/lib/emailDelivery";

export type TransactionalEmailTracking = {
  orderId: string;
  emailType: string;
  updateOrderSummary?: boolean;
};

export const MANUAL_VERIFICATION_INFORMATION_REQUEST_EVENT =
  "verification_information_requested_manually";
export const VERIFICATION_INFORMATION_NEEDED_EMAIL_TYPE =
  "verification_information_needed";

/**
 * Returns true when the customer request was already sent either through
 * Resend or manually. Database errors intentionally fail closed so a lookup
 * outage cannot turn into an accidental duplicate customer message.
 */
export async function hasVerificationInformationNeededNotification(
  orderId: string,
): Promise<boolean> {
  const [manualRequest, trackedDelivery] = await Promise.all([
    supabaseServer
      .from("order_events")
      .select("id")
      .eq("order_id", orderId)
      .eq("event_type", MANUAL_VERIFICATION_INFORMATION_REQUEST_EVENT)
      .limit(1)
      .maybeSingle(),
    supabaseServer
      .from("order_email_deliveries")
      .select("resend_email_id")
      .eq("order_id", orderId)
      .eq("email_type", VERIFICATION_INFORMATION_NEEDED_EMAIL_TYPE)
      .limit(1)
      .maybeSingle(),
  ]);

  if (manualRequest.error) throw manualRequest.error;
  if (trackedDelivery.error) throw trackedDelivery.error;
  return Boolean(manualRequest.data || trackedDelivery.data);
}

export async function recordTransactionalEmailSend({
  emailId,
  recipient,
  tracking,
  sentAt = new Date().toISOString(),
}: {
  emailId: string;
  recipient: string;
  tracking: TransactionalEmailTracking;
  sentAt?: string;
}): Promise<void> {
  if (tracking.updateOrderSummary === false) {
    const { error } = await supabaseServer.from("order_email_deliveries").upsert({
      resend_email_id: emailId, order_id: tracking.orderId, email_type: tracking.emailType,
      recipient, delivery_status: "sent", last_event: "email.sent", last_event_at: sentAt, sent_at: sentAt,
    }, { onConflict: "resend_email_id", ignoreDuplicates: true });
    if (error) throw error;
    return;
  }
  const { data, error } = await supabaseServer.rpc(
    "record_transactional_email_send",
    {
      p_email_id: emailId,
      p_order_id: tracking.orderId,
      p_email_type: tracking.emailType,
      p_recipient: recipient,
      p_sent_at: sentAt,
    },
  );

  if (error) throw error;
  if (data !== true) {
    throw new Error(`Unable to associate Resend email ${emailId} with order ${tracking.orderId}`);
  }
}

export async function applyResendDeliveryEvent(
  event: NormalizedResendDeliveryEvent,
): Promise<DeliveryEventApplyResult> {
  const { data, error } = await supabaseServer.rpc(
    "apply_resend_delivery_event",
    {
      p_svix_id: event.svixId,
      p_event_type: event.eventType,
      p_email_id: event.emailId,
      p_event_at: event.eventAt,
      p_order_id: event.orderId,
      p_email_type: event.emailType,
      p_recipient: event.recipient,
      p_delivery_status: event.deliveryStatus,
      p_failure_reason: event.failureReason,
      p_requires_attention: event.requiresAttention,
    },
  );

  if (error) throw error;
  return (data ?? {}) as DeliveryEventApplyResult;
}
