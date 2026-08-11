import { createHash, randomBytes } from "node:crypto";

export const PRESCRIPTION_HANDOFF_TTL_MS = 10 * 60 * 1000;
export const PRESCRIPTION_HANDOFF_CLAIM_MS = 2 * 60 * 1000;

export type PrescriptionHandoffStatus =
  | "pending"
  | "uploading"
  | "completed"
  | "expired";

export type PrescriptionHandoffRecord = {
  id: string;
  order_id: string;
  token_hash: string;
  expires_at: string;
  completed_at: string | null;
  upload_claim_id: string | null;
  upload_claim_expires_at: string | null;
  created_at: string;
};

export function createPrescriptionHandoffToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isValidPrescriptionHandoffToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function hashPrescriptionHandoffToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function prescriptionHandoffTokenMatches(
  row: Pick<PrescriptionHandoffRecord, "token_hash">,
  token: unknown,
): boolean {
  return isValidPrescriptionHandoffToken(token) &&
    hashPrescriptionHandoffToken(token) === row.token_hash;
}

export function prescriptionHandoffCanAcceptUpload(
  row: PrescriptionHandoffRecord,
  token: unknown,
  now = new Date(),
): boolean {
  return prescriptionHandoffTokenMatches(row, token) &&
    getPrescriptionHandoffStatus(row, now) === "pending";
}

export function prescriptionHandoffBelongsToOrder(
  row: Pick<PrescriptionHandoffRecord, "order_id">,
  orderId: string,
): boolean {
  return row.order_id === orderId;
}

export function buildPrescriptionHandoffResponse(
  row: Pick<PrescriptionHandoffRecord, "id" | "expires_at">,
  qrDataUrl: string,
) {
  return { handoffId: row.id, expiresAt: row.expires_at, qrDataUrl };
}

export function getPrescriptionHandoffStatus(
  row: Pick<
    PrescriptionHandoffRecord,
    "expires_at" | "completed_at" | "upload_claim_expires_at"
  >,
  now = new Date(),
): PrescriptionHandoffStatus {
  if (row.completed_at) return "completed";
  if (Date.parse(row.expires_at) <= now.getTime()) return "expired";
  if (
    row.upload_claim_expires_at &&
    Date.parse(row.upload_claim_expires_at) > now.getTime()
  ) {
    return "uploading";
  }
  return "pending";
}
