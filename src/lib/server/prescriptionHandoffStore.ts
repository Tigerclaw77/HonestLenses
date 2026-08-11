import { randomUUID } from "node:crypto";
import { supabaseServer } from "@/lib/supabase-server";
import {
  createPrescriptionHandoffToken,
  hashPrescriptionHandoffToken,
  isValidPrescriptionHandoffToken,
  PRESCRIPTION_HANDOFF_CLAIM_MS,
  PRESCRIPTION_HANDOFF_TTL_MS,
  prescriptionHandoffCanAcceptUpload,
  type PrescriptionHandoffRecord,
} from "@/lib/prescriptionHandoff";

const COLUMNS =
  "id, order_id, token_hash, expires_at, completed_at, upload_claim_id, upload_claim_expires_at, created_at";

export async function createPrescriptionHandoff(orderId: string) {
  const token = createPrescriptionHandoffToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PRESCRIPTION_HANDOFF_TTL_MS);

  // Replacement codes immediately expire older unfinished capabilities.
  await supabaseServer
    .from("prescription_mobile_handoffs")
    .update({ expires_at: now.toISOString() })
    .eq("order_id", orderId)
    .is("completed_at", null)
    .gt("expires_at", now.toISOString());

  const { data, error } = await supabaseServer
    .from("prescription_mobile_handoffs")
    .insert({
      order_id: orderId,
      token_hash: hashPrescriptionHandoffToken(token),
      expires_at: expiresAt.toISOString(),
    })
    .select(COLUMNS)
    .single();

  if (error || !data) throw new Error("Unable to create mobile upload code.");
  return { token, row: data as PrescriptionHandoffRecord };
}

export async function getPrescriptionHandoffById(id: string) {
  const { data, error } = await supabaseServer
    .from("prescription_mobile_handoffs")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as PrescriptionHandoffRecord | null;
}

export async function getPrescriptionHandoffByToken(token: unknown) {
  if (!isValidPrescriptionHandoffToken(token)) return null;
  const { data, error } = await supabaseServer
    .from("prescription_mobile_handoffs")
    .select(COLUMNS)
    .eq("token_hash", hashPrescriptionHandoffToken(token))
    .maybeSingle();
  if (error) throw error;
  return data as PrescriptionHandoffRecord | null;
}

export async function claimPrescriptionHandoff(token: unknown) {
  const existing = await getPrescriptionHandoffByToken(token);
  if (!existing || !prescriptionHandoffCanAcceptUpload(existing, token)) {
    return null;
  }

  const now = new Date();
  const claimId = randomUUID();
  const claimExpiresAt = new Date(now.getTime() + PRESCRIPTION_HANDOFF_CLAIM_MS);
  const { data, error } = await supabaseServer
    .from("prescription_mobile_handoffs")
    .update({
      upload_claim_id: claimId,
      upload_claim_expires_at: claimExpiresAt.toISOString(),
    })
    .eq("id", existing.id)
    .is("completed_at", null)
    .gt("expires_at", now.toISOString())
    .or(`upload_claim_id.is.null,upload_claim_expires_at.lt.${now.toISOString()}`)
    .select(COLUMNS)
    .maybeSingle();

  if (error) throw error;
  return data ? { row: data as PrescriptionHandoffRecord, claimId } : null;
}

export async function releasePrescriptionHandoffClaim(
  id: string,
  claimId: string,
) {
  await supabaseServer
    .from("prescription_mobile_handoffs")
    .update({ upload_claim_id: null, upload_claim_expires_at: null })
    .eq("id", id)
    .eq("upload_claim_id", claimId)
    .is("completed_at", null);
}

export async function completePrescriptionHandoff(
  id: string,
  claimId: string,
) {
  const { data, error } = await supabaseServer
    .from("prescription_mobile_handoffs")
    .update({
      completed_at: new Date().toISOString(),
      upload_claim_id: null,
      upload_claim_expires_at: null,
    })
    .eq("id", id)
    .eq("upload_claim_id", claimId)
    .is("completed_at", null)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error("Mobile upload capability was already used.");
}
