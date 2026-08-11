export type MobileHandoffUploadFailureOutcome =
  | "expired"
  | "complete"
  | "retry";

export function classifyMobileHandoffUploadResponse(
  status: number,
  code?: string,
): MobileHandoffUploadFailureOutcome {
  if (status === 409 && code === "handoff_expired") return "expired";
  if (status === 409 && code === "handoff_completed") return "complete";
  return "retry";
}
