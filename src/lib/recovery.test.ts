import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { recoveryTouchDue, verifiedResumeDestination, RECOVERY_DELIVERY_ENABLED } from "./recovery";
import { createOrderResumeToken, hashOrderResumeToken, getResumeDestination } from "./order-recovery";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
process.env.ORDER_RESUME_TOKEN_SECRET = "synthetic-recovery-secret";
process.env.GUEST_ORDER_COOKIE_SECRET = "synthetic-cookie-secret";
process.env.STRIPE_SECRET_KEY = "sk_test_unit_only";
const now = new Date("2026-09-07T12:00:00Z");
const base = { id: "00000000-0000-4000-8000-000000000001", status: "draft", sku: "OASYS_1D_90",
  shipping_email: "customer@example.test", updated_at: "2026-09-07T11:00:00Z" };
assert.equal(RECOVERY_DELIVERY_ENABLED, false);
for (const [age, touch] of [[0,null],[3_599_999,null],[3_600_000,1],[86_399_999,1],[86_400_000,24],[7*86_400_000+1,null]] as const) {
  assert.equal(recoveryTouchDue({ ...base, updated_at: new Date(+now-age).toISOString() }, now), touch);
}
for (const status of ["paid","captured","authorized","cancelled","canceled","completed","refunded","failed","shipped"]) {
  assert.equal(getResumeDestination({ ...base, status }), null);
}
for (const patch of [{ archived: true }, { archived_at: now.toISOString() }, { fulfillment_status: "hold" },
  { fulfillment_status: "ordered" }, { confirmation_email_sent_at: now.toISOString() }, { payment_status: "captured" },
  { stripe_payment_intent_status: "processing" }]) assert.equal(getResumeDestination({ ...base, ...patch }), null);
for (const patch of [{ shipping_email: "" }, { updated_at: "bad" }, { email_delivery_status: "complained" },
  { email_delivery_status: "bounced" }]) assert.equal(recoveryTouchDue({ ...base, ...patch }, now), null);
assert.equal(getResumeDestination({ id: base.id, status: "draft" }), null);
const token = createOrderResumeToken();
assert.match(token, /^[A-Za-z0-9_-]{43}$/);
assert.notEqual(token, createOrderResumeToken());
assert.match(hashOrderResumeToken(token), /^[a-f0-9]{64}$/);
assert.notEqual(hashOrderResumeToken(token), hashOrderResumeToken(token+'x'));

async function main() {
  globalThis.fetch = async () => { throw new Error("Network forbidden in recovery tests"); };
  const orderWithIntent = { ...base, payment_intent_id: "pi_fixture" };
  for (const status of ["requires_payment_method", "requires_confirmation", "requires_action", "requires_capture", "succeeded", "canceled", "processing", "unknown"]) {
    const result = await verifiedResumeDestination(orderWithIntent, async () => ({ id: "pi_fixture", status,
      metadata: { order_id: base.id }, amount_received: 0, amount_capturable: 0 }));
    assert.equal(Boolean(result), ["requires_payment_method","requires_confirmation","requires_action"].includes(status));
    if (result) assert.equal(result.path, `/checkout?orderId=${base.id}`);
  }
  for (const patch of [{ metadata: { order_id: "different" } }, { amount_received: 1 }, { amount_capturable: 1 }]) {
    assert.equal(await verifiedResumeDestination(orderWithIntent, async () => ({ id: "pi_fixture", status: "requires_action",
      metadata: { order_id: base.id }, amount_received: 0, amount_capturable: 0, ...patch })), null);
  }
  await assert.rejects(verifiedResumeDestination(orderWithIntent, async () => { throw new Error("Stripe unavailable"); }));
  const { supabaseServer } = await import("./supabase-server");
  const { prepareRecoveryDraft } = await import("./recoveryServer");
  const { GET } = await import("@/app/resume-order/accept/route");
  let order = { ...base, updated_at: new Date(Date.now()-3_600_001).toISOString() };
  const drafts: Record<string, unknown>[] = [];
  // Mimic PostgREST filters; unique insert models the database concurrency fence.
  supabaseServer.from = ((table: string) => {
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];
    const q = {
      select: () => q,
      eq: (k: string,v: unknown) => { filters.push(r => r[k] === v); return q; },
      is: (k: string,v: unknown) => { filters.push(r => r[k] === v); return q; },
      gt: (k: string,v: string) => { filters.push(r => String(r[k]) > v); return q; },
      maybeSingle: async () => ({ data: (table === "orders" ? [order] : table === "recovery_touch_drafts" ? drafts : []).find(r => filters.every(f=>f(r))) ?? null, error: null }),
      insert: async (row: Record<string, unknown>) => {
        assert.equal(table, "recovery_touch_drafts", "Recovery never creates orders/payments or sends email");
        if (drafts.some(d=>d.order_id===row.order_id && d.touch_hours===row.touch_hours)) return {error:{code:"23505"}};
        drafts.push(row); return {error:null};
      },
    }; return q;
  }) as unknown as typeof supabaseServer.from;
  const results = await Promise.all(Array.from({length:10},()=>prepareRecoveryDraft(base.id)));
  assert.equal(drafts.length,1);
  assert.equal(results.filter(r=>'duplicate' in r && r.duplicate).length,9);
  const prepared = results.find(r=>'draft' in r && r.draft)!;
  assert.ok('draft' in prepared && prepared.draft);
  assert.doesNotMatch(prepared.draft.text,/discount|coupon/i);
  const url = prepared.draft.text.match(/https:\/\/honestlenses.com\/resume-order\/accept\?token=[\w-]+/)![0];
  assert.ok(!JSON.stringify(drafts).includes(new URL(url).searchParams.get('token')!));
  for (let i=0;i<2;i++) {
    const response = await GET(new NextRequest(url));
    assert.equal(new URL(response.headers.get('location')!).pathname,'/cart');
    assert.ok(response.headers.get('set-cookie'));
    assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  }
  for (const patch of [{ status: "captured" }, { archived: true }, { shipping_email: "changed@example.test" }]) {
    const saved=order; order={...order,...patch};
    const response=await GET(new NextRequest(url)); assert.equal(response.headers.get('set-cookie'),null); order=saved;
  }
  drafts[0].expires_at = new Date(Date.now()-1).toISOString();
  assert.equal((await GET(new NextRequest(url))).headers.get('set-cookie'),null);
  assert.equal((await GET(new NextRequest(url+'x'))).headers.get('set-cookie'),null);
  console.log("Recovery timing, exclusions, live-payment validation, concurrent deduplication and capability route tests passed; no network/delivery.");
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
