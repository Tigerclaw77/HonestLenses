import { plainTextToHtml, sanitizeEmailHeader } from "@/lib/email/html";

export const VERIFICATION_RESEND_COOLDOWN_MS = 60_000;

export type VerificationEmailOrder = {
  id: string;
  status?: string | null;
  verification_status?: string | null;
  passive_deadline_at?: string | null;
  prescriber_name?: string | null;
  prescriber_practice?: string | null;
  prescriber_phone?: string | null;
  prescriber_fax?: string | null;
  prescriber_timezone?: string | null;
  patient_first_name?: string | null;
  patient_middle_name?: string | null;
  patient_last_name?: string | null;
  patient_dob?: string | null;
  patient_address_line1?: string | null;
  patient_address_line2?: string | null;
  patient_city?: string | null;
  patient_state?: string | null;
  patient_zip?: string | null;
  sku?: string | null;
  right_box_count?: number | null;
  left_box_count?: number | null;
};

export type VerificationResendDependencies = {
  updatePrescriberEmail: (email: string) => Promise<void>;
  send: (message: {
    to: string;
    subject: string;
    html: string;
    text: string;
    tracking: { orderId: string; emailType: "verification_request" };
    idempotencyKey: string;
    trackingRequired: true;
  }) => Promise<void>;
  recordAuditEvent: (email: string, sentAt: string) => Promise<void>;
};

export function normalizePrescriberEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function buildVerificationRequestEmail(order: VerificationEmailOrder) {
  const fullName = [order.patient_first_name, order.patient_middle_name, order.patient_last_name]
    .filter(Boolean).join(" ");
  const timeZone = order.prescriber_timezone || "America/Chicago";
  const deadlineDisplay = order.passive_deadline_at
    ? new Date(order.passive_deadline_at).toLocaleString("en-US", { timeZone })
    : "the existing verification deadline";
  const subject = sanitizeEmailHeader(
    `Prescription Verification Request – ${fullName} – Order ${order.id.slice(0, 8)}`,
  );
  const text = `Prescription Verification Request

Practice: ${order.prescriber_practice || ""}
Prescriber: ${order.prescriber_name || ""}
Phone: ${order.prescriber_phone || ""}
Fax: ${order.prescriber_fax || ""}

Patient:
${fullName}
DOB: ${order.patient_dob || ""}

Address:
${order.patient_address_line1 || ""}
${order.patient_address_line2 || ""}
${order.patient_city || ""}, ${order.patient_state || ""} ${order.patient_zip || ""}

Contact Lenses Ordered:
SKU: ${order.sku || ""}
Right Eye Boxes: ${order.right_box_count || 0}
Left Eye Boxes: ${order.left_box_count || 0}

Under the FTC Contact Lens Rule, we are requesting verification of this prescription.

If we do not receive a response within the applicable verification period (by ${deadlineDisplay}), the prescription will be considered verified unless otherwise indicated.

Please reply to this email to:
• Approve as written
• Provide corrected values
• Deny with reason

Honest Lenses
Verification Department`;
  return { subject, text, html: plainTextToHtml(text) };
}

export async function resendVerificationRequest(
  order: VerificationEmailOrder,
  email: string,
  deps: VerificationResendDependencies,
  now = new Date(),
): Promise<{ sentAt: string }> {
  const content = buildVerificationRequestEmail(order);
  const sentAt = now.toISOString();
  const bucket = Math.floor(now.getTime() / VERIFICATION_RESEND_COOLDOWN_MS);
  await deps.updatePrescriberEmail(email);
  await deps.send({
    to: email,
    ...content,
    tracking: { orderId: order.id, emailType: "verification_request" },
    idempotencyKey: `verification-resend:${order.id}:${email}:${bucket}`,
    trackingRequired: true,
  });
  await deps.recordAuditEvent(email, sentAt);
  return { sentAt };
}
