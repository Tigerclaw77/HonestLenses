export const VERIFICATION_INFORMATION_NEEDED_STATUS = "information_needed";

export type VerificationReadinessOrder = {
  rx_upload_path?: unknown;
  rx_status?: unknown;
  verification_details_submitted_at?: unknown;
  patient_first_name?: unknown;
  patient_last_name?: unknown;
  patient_dob?: unknown;
  prescriber_name?: unknown;
  prescriber_practice?: unknown;
  prescriber_phone?: unknown;
  prescriber_fax?: unknown;
  prescriber_email?: unknown;
};

export type VerificationReadiness = {
  canEnterPendingVerification: boolean;
  hasReadableRxImage: boolean;
  hasSufficientPrescriberInfo: boolean;
  hasCollectedVerificationDetails: boolean;
  missingReason: string | null;
};

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function hasReadableRxImage(
  order: VerificationReadinessOrder,
): boolean {
  return hasText(order.rx_upload_path);
}

export function hasSufficientPrescriberInfo(
  order: VerificationReadinessOrder,
): boolean {
  const hasNameOrPractice =
    hasText(order.prescriber_name) || hasText(order.prescriber_practice);
  const hasContact =
    hasText(order.prescriber_phone) ||
    hasText(order.prescriber_fax) ||
    hasText(order.prescriber_email);

  return hasNameOrPractice && hasContact;
}

export function hasCollectedVerificationDetails(
  order: VerificationReadinessOrder,
): boolean {
  const hasPatientDetails =
    hasText(order.patient_first_name) &&
    hasText(order.patient_last_name) &&
    hasText(order.patient_dob);

  return (
    hasText(order.verification_details_submitted_at) &&
    hasPatientDetails &&
    hasSufficientPrescriberInfo(order)
  );
}

export function getVerificationReadiness(
  order: VerificationReadinessOrder,
): VerificationReadiness {
  const readableImage = hasReadableRxImage(order);
  const prescriberInfo = hasSufficientPrescriberInfo(order);
  const verificationDetails = hasCollectedVerificationDetails(order);
  const canEnterPendingVerification =
    readableImage || prescriberInfo || verificationDetails;

  return {
    canEnterPendingVerification,
    hasReadableRxImage: readableImage,
    hasSufficientPrescriberInfo: prescriberInfo,
    hasCollectedVerificationDetails: verificationDetails,
    missingReason: canEnterPendingVerification
      ? null
      : "missing_prescription_or_prescriber_contact",
  };
}
