export type UploadResponseBody = {
  ok?: boolean;
  usable?: boolean;
  confidence?: number;
  reviewRequired?: boolean;
  error?: string;
  code?: string;
};

export type UploadFailureClassification =
  | "EXPECTED_VALIDATION"
  | "HANDLED_RECOVERABLE"
  | "GENUINE_SERVER_FAILURE"
  | "UNKNOWN";

export function classifyUploadHttpFailure(
  status: number,
  body: UploadResponseBody,
): UploadFailureClassification {
  if (body.code === "invalid_upload") return "EXPECTED_VALIDATION";
  if (status === 401 || status === 403 || status === 429) {
    return "HANDLED_RECOVERABLE";
  }
  if (status >= 500) return "GENUINE_SERVER_FAILURE";
  return "UNKNOWN";
}

export function uploadNeedsRecovery(body: UploadResponseBody): boolean {
  return body.ok === true && body.reviewRequired === true && body.usable === false;
}

export function hasUploadedEvidenceWithoutPrescription(order: unknown): boolean {
  if (!order || typeof order !== "object") return false;
  const candidate = order as { rx?: unknown; rx_upload_path?: unknown };
  return !candidate.rx &&
    typeof candidate.rx_upload_path === "string" &&
    candidate.rx_upload_path.trim().length > 0;
}
