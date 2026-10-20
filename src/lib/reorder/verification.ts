import { supabaseServer } from "@/lib/supabase-server";

type RecordLike = Record<string, unknown>;

const documentedEvents = [
  "admin_prescription_accepted",
  "admin_verification_override",
  "verification_verified",
  "verification_passive_auto",
  "verification_passive_already_captured",
  "verification_uploaded_auto",
];
const disqualifyingEvents = [
  "verification_rejected",
  "verification_denied",
  "verification_revoked",
  "prescription_rejected",
];

function eye(record: unknown, side: "right" | "left") {
  if (!record || typeof record !== "object") return null;
  const value = (record as RecordLike)[side];
  return value && typeof value === "object" ? value : null;
}

function unexpired(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const expiry = (value as RecordLike).expires;
  if (typeof expiry !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return false;
  const parsed = Date.parse(`${expiry}T23:59:59.999Z`);
  return Number.isFinite(parsed) && parsed >= Date.now();
}

/** Reuse is conditional on the exact Rx and an auditable, completed source verification. */
export async function findReusablePrescription(order: RecordLike): Promise<{
  sourceOrderId: string; verifiedAt: string;
} | null> {
  if (typeof order.id !== "string" || !unexpired(order.rx)) return null;
  const { data: provenance, error: provenanceError } = await supabaseServer
    .from("reorder_drafts").select("source_order_id")
    .eq("draft_order_id", order.id).maybeSingle();
  if (provenanceError || !provenance) return null;
  const { data: source, error: sourceError } = await supabaseServer.from("orders")
    .select(`id,status,verification_status,verification_passed,
      verification_completed_at,rx,patient_first_name,patient_last_name,patient_dob`)
    .eq("id", provenance.source_order_id).maybeSingle();
  if (sourceError || !source ||
      !["captured", "paid", "shipped", "completed"].includes(source.status) ||
      !["verified", "auto_verified"].includes(source.verification_status ?? "") ||
      source.verification_passed !== true || !source.verification_completed_at ||
      !unexpired(source.rx)) return null;
  for (const field of ["patient_first_name", "patient_last_name", "patient_dob"]) {
    if (!source[field as keyof typeof source] || source[field as keyof typeof source] !== order[field]) return null;
  }
  if (JSON.stringify(eye(source.rx, "right")) !== JSON.stringify(eye(order.rx, "right")) ||
      JSON.stringify(eye(source.rx, "left")) !== JSON.stringify(eye(order.rx, "left")) ||
      (source.rx as RecordLike).expires !== (order.rx as RecordLike).expires) return null;
  const { data: evidence, error: evidenceError } = await supabaseServer.from("order_events")
    .select("id").eq("order_id", source.id).in("event_type", documentedEvents)
    .limit(1).maybeSingle();
  if (evidenceError || !evidence) return null;
  const { data: withdrawal, error: withdrawalError } = await supabaseServer.from("order_events")
    .select("id").eq("order_id", source.id).in("event_type", disqualifyingEvents)
    .gte("created_at", source.verification_completed_at)
    .limit(1).maybeSingle();
  if (withdrawalError || withdrawal) return null;
  return { sourceOrderId: source.id, verifiedAt: source.verification_completed_at };
}

export async function recordReusedPrescription(orderId: string, sourceOrderId: string) {
  const { error } = await supabaseServer.from("order_events").insert({
    order_id: orderId,
    event_type: "reorder_prescription_reused",
    actor: "system",
    message: "Valid documented prescription verification reused from a prior order.",
    after: { source_order_id: sourceOrderId },
  });
  if (error && error.code !== "23505") throw error;
}
