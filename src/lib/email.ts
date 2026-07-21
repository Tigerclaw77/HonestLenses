import { Resend } from "resend";
import {
  recordTransactionalEmailSend,
  type TransactionalEmailTracking,
} from "@/lib/emailDeliveryServer";

const resend = new Resend(process.env.RESEND_API_KEY!);

/* ======================================
Sender Addresses
====================================== */

const FROM_ORDERS = "Honest Lenses <orders@honestlenses.com>";
const FROM_SUPPORT = "Honest Lenses <support@honestlenses.com>";
const REPLY_TO_SUPPORT = "support@honestlenses.com";

/* ======================================
Types
====================================== */

type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  tracking?: TransactionalEmailTracking;
};

/* ======================================
Generic Send Helper
====================================== */

export async function sendEmail({
  to,
  subject,
  html,
  text,
  tracking,
}: SendEmailParams) {
  const result = await resend.emails.send({
    from: FROM_SUPPORT,
    to,
    subject,
    html,
    text,
    replyTo: REPLY_TO_SUPPORT,
    tags: tracking
      ? [
          { name: "order_id", value: tracking.orderId },
          { name: "email_type", value: tracking.emailType },
        ]
      : undefined,
  });

  if (result.error) {
    console.error("Resend error:", result.error);
    throw new Error("Email send failed");
  }

  if (tracking && result.data?.id) {
    try {
      const recipient = Array.isArray(to) ? to[0] : to;
      await recordTransactionalEmailSend({
        emailId: result.data.id,
        recipient,
        tracking,
      });
    } catch (trackingError) {
      console.error("Transactional email tracking failed:", {
        orderId: tracking.orderId,
        emailType: tracking.emailType,
        emailId: result.data.id,
        error: trackingError,
      });
    }
  }

  return result;
}

/* ======================================
Verification Email
====================================== */

export async function sendVerificationEmail({
  to,
  subject,
  html,
  text,
  tracking,
}: SendEmailParams) {
  return await sendEmail({
    to,
    subject,
    html,
    text,
    tracking,
  });
}

/* ======================================
Internal Order Alert
====================================== */

export async function sendOrderAlert({
  orderId,
  total,
  customerEmail,
}: {
  orderId: string;
  total?: number;
  customerEmail?: string;
}) {
  const html = `
    <h2>New HonestLenses Order</h2>

    <p><b>Order ID:</b> ${orderId}</p>
    ${total ? `<p><b>Total:</b> $${(total / 100).toFixed(2)}</p>` : ""}
    ${customerEmail ? `<p><b>Customer:</b> ${customerEmail}</p>` : ""}

    <hr/>

    <p>Review order in database or admin tools.</p>
  `;

  return await resend.emails.send({
    from: FROM_ORDERS,
    to: "pauldriggers@aol.com",
    subject: `New HonestLenses Order ${orderId}`,
    html,
    replyTo: REPLY_TO_SUPPORT,
  });
}
