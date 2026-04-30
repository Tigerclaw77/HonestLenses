import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

type OrderEmailInput = {
  email: string;
  first_name?: string | null;
  verification_status: "auto_verified" | "pending" | string;
};

export async function sendOrderEmail(order: OrderEmailInput) {
  // ✅ Dev override (only if set)
  const to = order.email;

  let subject = "";
  let html = "";

  if (order.verification_status === "auto_verified") {
    subject = "Your Honest Lenses Order is Being Processed";
    html = `
      <p>Hi ${order.first_name || ""},</p>
      <p>Thanks for your order — everything looks good and we’ve started processing it.</p>
      <p>Your prescription has been accepted, so no further action is needed.</p>
      <p>We’ll notify you when your order ships.</p>
      <p>— Honest Lenses</p>
    `;
  } else {
    subject = "We’re Verifying Your Prescription";
    html = `
      <p>Hi ${order.first_name || ""},</p>
      <p>Thanks for your order — we’ve received it and it’s now being processed.</p>
      <p>Before we can ship your lenses, we need to verify your prescription.</p>
      <p>We’ll update you as soon as this step is complete.</p>
      <p>— Honest Lenses</p>
    `;
  }

  // 🔍 helpful for debugging (remove later)
  console.log("Sending email to:", to);

  await resend.emails.send({
    from: "Honest Lenses <support@honestlenses.com>",
    to,
    subject,
    html,
  });
}