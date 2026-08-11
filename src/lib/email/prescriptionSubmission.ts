export const CUSTOMER_SUPPORT_EMAIL = "support@honestlenses.com";

export type PrescriptionSubmissionEmail = {
  recipient: string;
  orderReference: string;
  subject: string;
  body: string;
  mailtoHref: string;
};

export function buildPrescriptionSubmissionEmail(
  orderReference: string,
): PrescriptionSubmissionEmail {
  const reference = orderReference.trim();
  if (!reference) {
    throw new Error("Order reference is required");
  }

  const subject = `Prescription for Order ${reference}`;
  const body = [
    "Please attach a clear photo or copy of your contact lens prescription to this email.",
    "",
    `Order: ${reference}`,
  ].join("\n");

  return {
    recipient: CUSTOMER_SUPPORT_EMAIL,
    orderReference: reference,
    subject,
    body,
    mailtoHref: `mailto:${CUSTOMER_SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  };
}
