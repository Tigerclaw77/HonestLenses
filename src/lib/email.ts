import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendVerificationEmail({
  to,
  subject,
  html,
  text,
}: SendEmailParams) {
  return await resend.emails.send({
    from: "Honest Lenses <verification@honestlenses.com>",
    to,
    subject,
    html,
    text,
  });
}
