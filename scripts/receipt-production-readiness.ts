import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { reconcileAdminReceipt, buildAdminReceiptEmail } from "../src/lib/receipts/adminReceipt";
import type { ReceiptSnapshot } from "../src/lib/receipts/core";

// This command only reads production facts and renders messages in memory.
// It never imports or calls the email sender, snapshot writer, or claim RPC.
async function main() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  assert.equal(new URL(base).hostname, "abhkbdyzfbcmpjrobwxq.supabase.co", "Unexpected production target");
  const originalFetch = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(request.method, "GET", "Readiness forbids network writes");
    assert.ok(url.origin === new URL(base).origin || url.origin === "https://api.stripe.com", "Unexpected service");
    reads++;
    return originalFetch(request);
  };
  const db = createClient(base, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { httpClient: Stripe.createFetchHttpClient() });
  const { data: saved, error } = await db.from("order_receipt_snapshots").select("order_id,snapshot");
  if (error) throw error;
  assert.ok(saved?.length, "No captured receipt available for production reconciliation");
  let rendered = 0;
  for (const row of saved) {
    const result = await db.from("orders").select("*").eq("id", row.order_id).single();
    if (result.error) throw result.error;
    const order = result.data;
    const intent = await stripe.paymentIntents.retrieve(order.payment_intent_id, { expand: ["latest_charge"] });
    const receipt = reconcileAdminReceipt(order, intent, row.snapshot as ReceiptSnapshot);
    for (const type of ["receipt", "itemized"] as const) {
      const email = buildAdminReceiptEmail(type, order, receipt);
      assert.ok(email.html && email.text && email.subject);
      assert.ok(email.text.includes(receipt.orderNumber));
      rendered++;
    }
  }
  const ledger = await db.from("order_email_deliveries").select("resend_email_id,order_id,email_type,sent_at").limit(0);
  if (ledger.error) throw ledger.error;
  for (const type of ["receipt", "itemized"]) {
    const audit = await db.from("order_events").select("after").eq("event_type", "admin_receipt_sent")
      .eq("after->>receipt_type", type).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (audit.error) throw audit.error;
  }
  console.log(JSON.stringify({ passed: true, productionProject: new URL(base).hostname,
    capturedReceiptsReconciled: saved.length, emailsRenderedInMemory: rendered, readOnlyNetworkRequests: reads,
    emailsSent: 0, databaseWrites: 0, stripeMutations: 0 }, null, 2));
}
main().catch(error => { console.error("Receipt production readiness failed:", error instanceof Error ? error.message : "Database read failed"); process.exitCode = 1; });
