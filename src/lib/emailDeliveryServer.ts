import { supabaseServer } from "@/lib/supabase-server";
import type {
  DeliveryEventApplyResult,
  NormalizedResendDeliveryEvent,
} from "@/lib/emailDelivery";

export type TransactionalEmailTracking = {
  orderId: string;
  emailType: string;
};

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
