import { Resend } from "resend";

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
};

/* ======================================
Generic Send Helper
====================================== */

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: SendEmailParams) {
  try {
    const result = await resend.emails.send({
      from: FROM_SUPPORT,
      to,
      subject,
      html,
      text,
      replyTo: REPLY_TO_SUPPORT,
    });

    return result;
  } catch (err) {
    console.error("Email send failed:", err);
    throw err;
  }
}

/* ======================================
Verification Email
====================================== */

export async function sendVerificationEmail({
  to,
  subject,
  html,
  text,
}: SendEmailParams) {
  return await sendEmail({
    to,
    subject,
    html,
    text,
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