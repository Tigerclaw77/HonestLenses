import { Resend } from "resend";
import {
  hasVerificationInformationNeededNotification,
  recordTransactionalEmailSend,
  type TransactionalEmailTracking,
} from "@/lib/emailDeliveryServer";
import { escapeHtml, sanitizeEmailHeader } from "@/lib/email/html";
import { CUSTOMER_SUPPORT_EMAIL } from "@/lib/email/prescriptionSubmission";

const resend = new Resend(process.env.RESEND_API_KEY!);

export class EmailSendError extends Error {
  readonly definitivelyRejected: boolean;
  constructor(statusCode: number | null) {
    super("Email send failed");
    this.name = "EmailSendError";
    this.definitivelyRejected = statusCode !== null && [400, 401, 403, 404, 422, 429].includes(statusCode);
  }
}

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
  headers?: Record<string, string>;
  redactProviderErrorLog?: boolean;
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
  headers,
  redactProviderErrorLog = false,
}: SendEmailParams) {
  const result = await resend.emails.send(
    {
      from: FROM_SUPPORT,
      to,
      subject: sanitizeEmailHeader(subject),
      html,
      text,
      replyTo: REPLY_TO_SUPPORT,
      headers,
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
    console.error("Resend error:", redactProviderErrorLog ? { code: result.error.name } : result.error);
    throw new EmailSendError(result.error.statusCode);
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
      console.error(
        "Transactional email tracking failed:",
        redactProviderErrorLog
          ? { emailType: tracking.emailType, code: trackingError instanceof Error ? trackingError.name : "UNKNOWN" }
          : { orderId: tracking.orderId, emailType: tracking.emailType, emailId: result.data.id, error: trackingError },
      );
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

export function buildVerificationInformationNeededEmail(orderId: string) {
  const subject =
    "Additional Information Needed for Your Honest Lenses Order";
  const text = `Hi,

Thanks for your Honest Lenses order. Before we can complete prescription verification, please reply with a clear photo or copy of your contact-lens prescription.

If you do not have a copy available, please send the prescriber or practice name and phone number so Honest Lenses can verify it.

Order ID: ${orderId}

Honest Lenses`;

  const html = `
    <p>Hi,</p>
    <p>Thanks for your Honest Lenses order. Before we can complete prescription verification:</p>
    <ol>
      <li>First, please reply with a clear photo or copy of your contact-lens prescription.</li>
      <li>If you do not have a copy available, please send the prescriber or practice name and phone number so Honest Lenses can verify it.</li>
    </ol>
    <p><strong>Order ID:</strong> ${escapeHtml(orderId)}</p>
    <p>Honest Lenses</p>
  `;

  return {
    subject,
    html,
    text,
    emailType: "verification_information_needed" as const,
    idempotencyKey: `verification-information-needed:${orderId}`,
  };
}

export async function sendVerificationInformationNeededEmail({
  to,
  orderId,
}: {
  to: string;
  orderId: string;
}, {
  hasExistingNotification = hasVerificationInformationNeededNotification,
}: {
  hasExistingNotification?: (orderId: string) => Promise<boolean>;
} = {}) {
  if (await hasExistingNotification(orderId)) {
    return { data: null, error: null, suppressed: true as const };
  }

  const message = buildVerificationInformationNeededEmail(orderId);
  const result = await sendEmail({
    to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    tracking: {
      orderId,
      emailType: message.emailType,
    },
    idempotencyKey: message.idempotencyKey,
  });
  return { ...result, suppressed: false as const };
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
