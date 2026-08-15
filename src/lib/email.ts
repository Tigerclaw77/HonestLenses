import { Resend } from "resend";
import {
  recordTransactionalEmailSend,
  type TransactionalEmailTracking,
} from "@/lib/emailDeliveryServer";
import { escapeHtml, sanitizeEmailHeader } from "@/lib/email/html";
import { CUSTOMER_SUPPORT_EMAIL } from "@/lib/email/prescriptionSubmission";

const resend = new Resend(process.env.RESEND_API_KEY!);

/* ======================================
Sender Addresses
====================================== */

const FROM_ORDERS = "Honest Lenses <orders@honestlenses.com>";
const FROM_SUPPORT = `Honest Lenses <${CUSTOMER_SUPPORT_EMAIL}>`;
const REPLY_TO_SUPPORT = CUSTOMER_SUPPORT_EMAIL;

export function isTransactionalEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/* ======================================
Types
====================================== */

type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  tracking?: TransactionalEmailTracking;
  idempotencyKey?: string;
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
  idempotencyKey,
}: SendEmailParams) {
  const result = await resend.emails.send(
    {
      from: FROM_SUPPORT,
      to,
      subject: sanitizeEmailHeader(subject),
      html,
      text,
      replyTo: REPLY_TO_SUPPORT,
      tags: tracking
        ? [
            { name: "order_id", value: tracking.orderId },
            { name: "email_type", value: tracking.emailType },
          ]
        : undefined,
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  );

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
Customer Verification Info Needed
====================================== */

export async function sendVerificationInformationNeededEmail({
  to,
  orderId,
}: {
  to: string;
  orderId: string;
}) {
  const subject =
    "Additional Information Needed for Your Honest Lenses Order";
  const text = `Hi,

Thanks for your Honest Lenses order. Before we can complete prescription verification, we need either a photo of your contact lens prescription or your prescribing doctor's name and contact information.

Please reply to this email with either option so we can keep your order moving.

Order ID: ${orderId}

Honest Lenses`;

  const html = `
    <p>Hi,</p>
    <p>Thanks for your Honest Lenses order. Before we can complete prescription verification, we need either:</p>
    <ul>
      <li>a photo of your contact lens prescription, or</li>
      <li>your prescribing doctor's name and contact information.</li>
    </ul>
    <p>Please reply to this email with either option so we can keep your order moving.</p>
    <p><strong>Order ID:</strong> ${escapeHtml(orderId)}</p>
    <p>Honest Lenses</p>
  `;

  return await sendEmail({
    to,
    subject,
    html,
    text,
    tracking: {
      orderId,
      emailType: "order_confirmation",
    },
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
  const adminAlertEmail =
    process.env.FOUNDER_ALERT_EMAIL?.trim() ||
    process.env.ARMORY_OPERATOR_ALERT_RECIPIENT?.trim();
  if (!adminAlertEmail) {
    throw new Error("Founder operational alert recipient is required");
  }
  const html = `
    <h2>New HonestLenses Order</h2>

    <p><b>Order ID:</b> ${escapeHtml(orderId)}</p>
    ${total ? `<p><b>Total:</b> $${(total / 100).toFixed(2)}</p>` : ""}
    ${customerEmail ? `<p><b>Customer:</b> ${escapeHtml(customerEmail)}</p>` : ""}

    <hr/>

    <p>Review order in database or admin tools.</p>
  `;

  return await resend.emails.send({
    from: FROM_ORDERS,
    to: adminAlertEmail,
    subject: sanitizeEmailHeader(`New HonestLenses Order ${orderId}`),
    html,
    replyTo: REPLY_TO_SUPPORT,
  });
}
