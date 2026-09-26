import assert from "node:assert/strict";
import type Stripe from "stripe";
import { lenses } from "@/LensCore";
import { resolveBrand } from "@/lib/resolveBrand";
import { resolveSkuSelection } from "@/lib/cart/resolveSkuSelection";
import { getPackSizeFromSku } from "@/lib/cart/skuPackSize";
import { getLensSkus } from "@/lib/pricing/getLensSkus";
import { getPackSizeOptionsForCoreId } from "@/lib/pricing/packSizeOptions";
import { getAuthoritativeOrderQuote } from "./orderPricing";
import { getCheckoutAmountCents, checkoutAmountMatchesPaymentIntent } from "@/lib/payments/checkoutAmount";
import { getCaptureAmountCents } from "@/lib/payments/captureAmount";
import { buildReceiptSnapshot } from "@/lib/receipts/core";
import { processLegacyStripeWebhook } from "@/lib/payments/legacyStripeWebhook";

// Deliberately pinned incident/neighbor prices, not expectations derived from the catalog.
const cases = [
  ["OASYS_1D","OASYS_1D_90",90,9299,1400,4],
  ["OASYS_MAX_1D","OASYS_MAX_1D_30",30,4699,1400,12],
  ["OASYS_MAX_1D","OASYS_MAX_1D_90",90,10399,1400,4],
  ["OASYS_2W","OASYS_2W_12",12,7299,1400,2],
  ["OASYS_2W","OASYS_2W_24",24,13799,1400,1],
  ["DT1","DT1_30",30,4199,1200,12], ["DT1","DT1_90",90,10499,1200,4],
  ["TOTAL30","TOTAL30_6",6,6599,1200,2],
  ["BIOTRUE_1D","BIOTRUE_1D_30",30,3199,1000,12],
  ["BIOTRUE_1D","BIOTRUE_1D_90",90,6499,1000,4],
  ["BIOTRUE_1D_AST","BIOTRUE_1D_AST_90",90,7999,1000,4],
  ["MYDAY","MYDAY_90",90,10499,1500,4], ["MYDAY","MYDAY_180",180,18499,1500,2],
  ["BIOFINITY","BIOFINITY_6",6,5999,1500,2],
] as const;
const id = "00000000-0000-4000-8000-000000000001";
for (const [core,sku,pack,unit,shipping,annual] of cases) {
  const display = getPackSizeOptionsForCoreId(core).find(o=>o.sku===sku)!;
  assert.equal(display.packSize,pack); assert.equal(display.pricePerBoxCents,unit);
  assert.equal(resolveSkuSelection([core],sku,"OASYS_MAX_1D_90",12).sku,sku);
  assert.equal(resolveSkuSelection([core],null,sku,12).sku,sku,"Existing customer pack survives fallback");
  for (const boxes of [...new Set([1,2,annual-1,annual])].filter(n=>n>0)) {
    const q=getAuthoritativeOrderQuote({sku,totalBoxes:boxes*2,rightBoxCount:boxes,leftBoxCount:boxes});
    const ship=boxes>=annual?0:shipping;
    assert.equal(q.sku,sku); assert.equal(q.pricePerBoxCents,unit);
    assert.equal(q.productSubtotalCents,unit*boxes*2); assert.equal(q.shippingCents,ship);
    assert.equal(q.totalAmountCents,unit*boxes*2+ship);
    const order={id,sku,status:"authorized",customer_order_number:"HL-2026-123456ABCDEF",price_reason:"flat_retail_v1",total_amount_cents:q.totalAmountCents,
      subtotal_cents:q.productSubtotalCents,right_box_count:boxes,left_box_count:boxes,total_box_count:boxes*2,shipping_cents:ship,tax_cents:0};
    assert.equal(getCheckoutAmountCents(order),q.totalAmountCents);
    assert.equal(getCaptureAmountCents(order),q.totalAmountCents);
    assert.equal(checkoutAmountMatchesPaymentIntent(order,q.totalAmountCents+1),false);
    const receipt=buildReceiptSnapshot(order,{amountReceivedCents:q.totalAmountCents,currency:"usd",capturedAt:"2026-09-07T12:00:00Z"});
    assert.equal(receipt.line.packSize,pack); assert.equal(receipt.line.unitPriceCents,unit);
    assert.equal(receipt.line.lineTotalCents,unit*boxes*2); assert.equal(receipt.amountPaidCents,q.totalAmountCents);
  }
  assert.equal(getAuthoritativeOrderQuote({sku,totalBoxes:annual*2,rightBoxCount:annual,leftBoxCount:annual,shippingMethod:"express"}).shippingCents,2900);
}
for (const [core,wrong] of [["OASYS_1D","OASYS_MAX_1D_90"],["OASYS_1D","OASYS_2W_24"],
  ["DT1","TOTAL30_6"],["BIOTRUE_1D","BIOTRUE_1D_AST_90"],["MYDAY","BIOFINITY_6"]]) {
  assert.throws(()=>resolveSkuSelection([core],wrong,null,12),/not available/);
  assert.notEqual(resolveSkuSelection([core],null,wrong,12).sku,wrong);
}
for (const core of ["OASYS_1D","OASYS_MAX_1D","OASYS_2W","DT1","TOTAL30","BIOTRUE_1D","BIOTRUE_1D_AST","MYDAY","BIOFINITY"]) {
  const lens=lenses.find(l=>l.coreId===core)!;
  assert.equal(resolveBrand({rawString:lens.displayName},lenses).lensId,core,`${core} exact family identity`);
}
for (const lens of lenses) {
  for (const sku of getLensSkus(lens)) {
    const packSize = getPackSizeFromSku(sku);
    assert.ok(packSize, `${sku} has a catalog pack size`);
    const resolved = resolveBrand({
      rawString: `${lens.displayName} ${packSize}PK`,
      hasCyl: lens.type.toric,
      hasAdd: lens.type.multifocal,
      bc: lens.parameters.baseCurve?.[0] ?? null,
      dia: lens.parameters.diameter?.[0] ?? null,
    }, lenses);
    assert.equal(resolved.lensId, lens.coreId, `${sku} pack text preserves exact clinical identity`);
    assert.equal(resolved.confidence, "high", `${sku} pack text remains high confidence`);
  }
}
assert.throws(()=>getAuthoritativeOrderQuote({sku:"OASYS_1D_90",totalBoxes:3,rightBoxCount:1,leftBoxCount:1}),/quantities/);

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL="https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY="test-only"; process.env.STRIPE_SECRET_KEY="sk_test_unit_only";
  process.env.RESEND_API_KEY="re_unit_only"; process.env.ORDER_RESUME_TOKEN_SECRET="test-only-receipt-secret";
  process.env.ORDER_ACCESS_TOKEN_SECRET="test-only-order-access-secret-0001";
  let emails=0;
  globalThis.fetch=async (input,options)=>{
    assert.equal(String(input),"https://api.resend.com/emails","Every other network call is forbidden");
    assert.ok(String(options?.body).includes("customer@example.test"));
    emails++; return new Response(JSON.stringify({id:"email_fixture"}),{status:200,headers:{"Content-Type":"application/json"}});
  };
  const {captureAuthorizedOrderPayment}=await import("@/lib/payments/legacyPaymentCommands");
  const {ensureOrderConfirmation}=await import("@/lib/receipts/confirmation");
  const {supabaseServer}=await import("@/lib/supabase-server");
  const order={id,status:"authorized",sku:"OASYS_1D_90",payment_intent_id:"pi_fixture",customer_order_number:"HL-2026-123456ABCDEF",
    shipping_email:"customer@example.test",confirmation_email_sent_at:null as string|null,
    right_box_count:1,left_box_count:1,total_box_count:2,total_amount_cents:19998,subtotal_cents:18598,shipping_cents:1400,tax_cents:0,
    price_reason:"flat_retail_v1",capture_amount_cents:null,feedback_credit_cents:null,verification_status:"verified"};
  let captured=false; let captures=0; let snapshots=0; let ledger=false;
  const intent=()=>({id:order.payment_intent_id,status:captured?"succeeded":"requires_capture",capture_method:"manual",currency:"usd",
    metadata:{order_id:id},amount:19998,amount_received:captured?19998:0,amount_capturable:captured?0:19998,receipt_email:order.shipping_email});
  assert.equal(checkoutAmountMatchesPaymentIntent(order,intent().amount),true,"Authorized amount equals selected cart");
  const stripe={paymentIntents:{retrieve:async()=>intent(),capture:async (_id:string,p:{amount_to_capture:number})=>{
    assert.equal(_id,order.payment_intent_id);assert.equal(p.amount_to_capture,19998);captured=true;captures++;
  }}};
  const deps={stripe:stripe as never,loadOrder:async()=>order,persistSubtotal:async()=>{},createReceiptSnapshot:async()=>{
    const receipt=buildReceiptSnapshot(order,{amountReceivedCents:intent().amount_received,currency:"usd",capturedAt:"2026-09-07T12:00:00Z"});
    assert.equal(receipt.amountPaidCents,19998);snapshots++;return true;
  }};
  await captureAuthorizedOrderPayment({id},"admin-operator",deps);
  const event={id:"evt_fixture",type:"payment_intent.succeeded",data:{object:intent()}} as unknown as Stripe.Event;
  const repository={findOrder:async()=>order,markCaptured:async()=>{order.status="captured";return true;}};
  assert.equal((await processLegacyStripeWebhook(event,repository)).reason,"captured");
  supabaseServer.from=((table:string)=>{
    const q={select:()=>q,eq:()=>q,is:()=>q,gt:()=>q,order:()=>q,
      limit:()=>table==="order_email_deliveries"?Promise.resolve({data:ledger?[{resend_email_id:"email_fixture"}]:[],error:null}):q,
      single:async()=>({data:order,error:null}),maybeSingle:async()=>({data:table==="orders"?order:null,error:null}),
      insert:async()=>({error:null})};return q;
  }) as unknown as typeof supabaseServer.from;
  supabaseServer.rpc=(async(name:string)=>{assert.equal(name,"record_transactional_email_send");ledger=true;return{data:true,error:null};}) as unknown as typeof supabaseServer.rpc;
  await ensureOrderConfirmation(id);
  assert.equal(emails,1);assert.equal(ledger,true);
  assert.equal((await processLegacyStripeWebhook(event,repository)).reason,"already_current");
  await captureAuthorizedOrderPayment({id},"admin-operator",deps);
  await ensureOrderConfirmation(id);
  assert.equal(captures,1);assert.equal(emails,1);assert.equal(snapshots,2);
  ledger=false;order.confirmation_email_sent_at="2026-09-07T12:00:00Z";
  await ensureOrderConfirmation(id);assert.equal(emails,1);
  console.log("14 revenue fixtures and authorization -> capture -> webhook -> confirmation/receipt replay passed; provider delivery mocked.");
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
