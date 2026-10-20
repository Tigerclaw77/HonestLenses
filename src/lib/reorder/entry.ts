import { supabaseServer } from "@/lib/supabase-server";
import { createReorderEntryToken, getReorderEntryUrl, hashReorderToken } from "./tokens";

/** Issue only for an order whose receipt is being delivered. A revoked link stays revoked. */
export async function ensureReorderEntry(orderId: string): Promise<string> {
  const tokenHash = hashReorderToken(createReorderEntryToken(orderId));
  const { data: existing, error: lookupError } = await supabaseServer
    .from("reorder_entry_links")
    .select("token_hash,revoked_at")
    .eq("order_id", orderId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) {
    if (existing.revoked_at || existing.token_hash !== tokenHash) {
      throw new Error("Reorder entry is revoked or uses another signing key");
    }
    return getReorderEntryUrl(orderId);
  }
  const { error } = await supabaseServer.from("reorder_entry_links")
    .upsert({ order_id: orderId, token_hash: tokenHash },
      { onConflict: "order_id", ignoreDuplicates: true });
  if (error) throw error;
  const { data: issued, error: verifyError } = await supabaseServer
    .from("reorder_entry_links")
    .select("token_hash,revoked_at")
    .eq("order_id", orderId).single();
  if (verifyError || !issued || issued.revoked_at || issued.token_hash !== tokenHash) {
    throw new Error("Reorder entry unavailable");
  }
  return getReorderEntryUrl(orderId);
}
