import assert from "node:assert/strict";

async function main() {
  process.env.ORDER_RESUME_TOKEN_SECRET = "unit-test-only-reorder-secret";
  process.env.GUEST_ORDER_COOKIE_SECRET = "unit-test-only-guest-cookie-secret";
  process.env.RATE_LIMIT_KEY_SECRET = "unit-test-only-rate-limit-secret";
  process.env.SITE_URL = "https://www.honestlenses.com";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "unit-test-only";
  const { supabaseServer } = await import("@/lib/supabase-server");
  const { POST } = await import("@/app/api/reorder/accept/route");
  const { createReorderAuthToken, hashReorderEmail } = await import("./tokens");
  const { getAuthoritativeOrderQuote } = await import("@/lib/orders/orderPricing");

  const sourceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const draftId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const authToken = createReorderAuthToken();
  const source = {
    id: sourceId, status: "captured", sku: "PRECISION7_27",
    rx: { expires: "2027-05-27", right: { coreId: "PRECISION7", sphere: -2.75 },
      left: { coreId: "PRECISION7", sphere: -3.25 } },
    right_box_count: 2, left_box_count: 1,
    shipping_first_name: "Test", shipping_last_name: "Customer",
    shipping_email: "customer@example.test", shipping_phone: "5555555555",
    shipping_address1: "100 Test Road", shipping_address2: null,
    shipping_city: "Testville", shipping_state: "TX", shipping_zip: "75001",
    patient_first_name: "Test", patient_last_name: "Patient", patient_dob: "1990-01-01",
    prescriber_name: "Test Doctor", prescriber_practice: null,
    prescriber_phone: null, prescriber_fax: null, prescriber_email: null,
    subtotal_cents: 100, shipping_cents: 1, total_amount_cents: 101,
  };
  let currentSource: Record<string, unknown> = structuredClone(source);
  let available = true;
  let inserted: Record<string, unknown> | null = null;
  let provenance: Record<string, unknown> | null = null;
  supabaseServer.rpc = (async (name: string) => ({
    data: name === "consume_rate_limit" ? true
      : available ? [{ order_id: sourceId,
        recipient_hash: hashReorderEmail(source.shipping_email) }] : [],
    error: null,
  })) as unknown as typeof supabaseServer.rpc;
  supabaseServer.from = ((table: string) => {
    const query = {
      select: () => query, eq: () => query,
      maybeSingle: async () => ({ data: table === "orders" ? currentSource : null, error: null }),
      single: async () => ({ data: { id: draftId }, error: null }),
      insert: (value: Record<string, unknown>) => {
        if (table === "orders") inserted = value;
        if (table === "reorder_drafts") provenance = value;
        return table === "orders" ? query : Promise.resolve({ error: null });
      },
      delete: () => query,
    };
    return query;
  }) as unknown as typeof supabaseServer.from;
  const request = () => new Request("https://www.honestlenses.com/api/reorder/accept", {
    method: "POST", headers: { origin: "https://www.honestlenses.com",
      "Content-Type": "application/json" },
    body: JSON.stringify({ token: authToken }),
  });
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).destination, "/cart");
  assert.match(response.headers.get("set-cookie") ?? "", /hl_guest_order=/);
  const quote = getAuthoritativeOrderQuote({ sku: source.sku, totalBoxes: 3,
    rightBoxCount: 2, leftBoxCount: 1, shippingMethod: "standard" });
  assert.equal(inserted?.["subtotal_cents"], quote.productSubtotalCents);
  assert.equal(inserted?.["shipping_cents"], quote.shippingCents);
  assert.equal(inserted?.["total_amount_cents"], quote.totalAmountCents);
  assert.notEqual(inserted?.["total_amount_cents"], source.total_amount_cents);
  assert.equal(inserted?.["verification_passed"], false);
  assert.equal(inserted?.["payment_intent_id"], undefined);
  assert.deepEqual(provenance, { draft_order_id: draftId, source_order_id: sourceId });
  assert.equal(source.status, "captured");

  available = false;
  inserted = null;
  const replay = await POST(request());
  assert.equal(replay.status, 410);
  assert.equal(inserted, null);

  available = true;
  currentSource = { ...source, rx: { ...source.rx, expires: "2025-01-01" } };
  const expired = await POST(request());
  assert.equal((await expired.json()).destination, "/enter-prescription");

  currentSource = { ...source, rx: { expires: "2027-05-27",
    right: { coreId: "PRECISION7", sphere: -2.75 } },
    right_box_count: 1, left_box_count: 0 };
  const oneEye = await POST(request());
  assert.equal((await oneEye.json()).destination, "/cart");
  assert.equal(inserted?.["right_box_count"], 1);
  assert.equal(inserted?.["left_box_count"], 0);

  currentSource = { ...source, shipping_email: "different@example.test" };
  inserted = null;
  const wrongRecipient = await POST(request());
  assert.equal(wrongRecipient.status, 410);
  assert.equal(inserted, null);
  console.log("Reorder accept route passed: current price/shipping, one/two eyes, expired Rx, replay, recipient binding, guest ownership; no payment or email.");
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
