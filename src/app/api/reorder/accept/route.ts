export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { hasTrustedMutationOrigin } from "@/lib/auth/authorization";
import { setGuestOrderCookie } from "@/lib/order-access";
import { getAuthoritativeOrderQuote } from "@/lib/orders/orderPricing";
import { isSkuAvailableForCoreId } from "@/lib/pricing/packSizeOptions";
import { enforceRateLimit, rateLimitErrorResponse } from "@/lib/security/rateLimit";
import { supabaseServer } from "@/lib/supabase-server";
import { captureServerEvent } from "@/lib/posthog/server";
import { POSTHOG_EVENTS } from "@/lib/posthog/events";
import { hashReorderEmail, hashReorderToken, isReorderToken } from "@/lib/reorder/tokens";

type Eye = { coreId?: unknown };
type Rx = { expires?: unknown; right?: Eye | null; left?: Eye | null };

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  if (!isReorderToken(body?.token)) {
    return NextResponse.json({ error: "This link is invalid or expired." }, { status: 400 });
  }
  const tokenHash = hashReorderToken(body.token);
  const limit = await enforceRateLimit(request, {
    scope: "reorder-link-accept", identity: tokenHash, limit: 5, windowSeconds: 3600,
  });
  if (!limit.allowed) return rateLimitErrorResponse(limit);

  const { data: consumed, error: consumeError } = await supabaseServer.rpc(
    "consume_reorder_auth_token", { p_hash: tokenHash });
  if (consumeError) return NextResponse.json({ error: "Reorder is temporarily unavailable." }, { status: 503 });
  const claim = Array.isArray(consumed) ? consumed[0] : consumed;
  if (!claim?.order_id || !claim?.recipient_hash) {
    return NextResponse.json({ error: "This link is invalid or expired." }, { status: 410 });
  }

  const { data: source, error: sourceError } = await supabaseServer.from("orders")
    .select(`id,status,sku,rx,right_box_count,left_box_count,
      shipping_first_name,shipping_last_name,shipping_email,shipping_phone,
      shipping_address1,shipping_address2,shipping_city,shipping_state,shipping_zip,
      patient_first_name,patient_last_name,patient_dob,prescriber_name,
      prescriber_practice,prescriber_phone,prescriber_fax,prescriber_email`)
    .eq("id", claim.order_id).maybeSingle();
  if (sourceError || !source || !["captured", "paid", "shipped", "completed"].includes(source.status) ||
      !source.shipping_email ||
      hashReorderEmail(source.shipping_email) !== claim.recipient_hash) {
    return NextResponse.json({ error: "Previous order is unavailable." }, { status: 410 });
  }
  const rx = source.rx as Rx | null;
  const rightCore = typeof rx?.right?.coreId === "string" ? rx.right.coreId : null;
  const leftCore = typeof rx?.left?.coreId === "string" ? rx.left.coreId : null;
  const sku = source.sku;
  if (!rx || !sku || (!rightCore && !leftCore) ||
      [rightCore, leftCore].some(core => core && !isSkuAvailableForCoreId(core, sku))) {
    return NextResponse.json({ error: "This product needs a fresh selection." }, { status: 409 });
  }
  const right = rightCore ? Math.max(1, source.right_box_count ?? 1) : 0;
  const left = leftCore ? Math.max(1, source.left_box_count ?? 1) : 0;
  let quote;
  try {
    quote = getAuthoritativeOrderQuote({
      sku, totalBoxes: right + left, rightBoxCount: right, leftBoxCount: left,
      shippingMethod: "standard",
    });
  } catch {
    return NextResponse.json({ error: "Current pricing is unavailable." }, { status: 409 });
  }
  const expiry = typeof rx.expires === "string" ? Date.parse(`${rx.expires}T23:59:59.999Z`) : NaN;
  const prescriptionExpired = !Number.isFinite(expiry) || expiry < Date.now();
  const { data: draft, error: insertError } = await supabaseServer.from("orders").insert({
    user_id: null,
    status: "draft",
    currency: "USD",
    sku,
    manufacturer: quote.manufacturer,
    rx: source.rx,
    rx_source: "reorder",
    verification_status: "information_needed",
    verification_passed: false,
    right_box_count: right,
    left_box_count: left,
    box_count: right + left,
    total_box_count: right + left,
    shipping_method: quote.shippingMethod,
    shipping_cents: quote.shippingCents,
    subtotal_cents: quote.productSubtotalCents,
    tax_cents: 0,
    total_amount_cents: quote.totalAmountCents,
    price_reason: quote.priceReason,
    shipping_first_name: source.shipping_first_name,
    shipping_last_name: source.shipping_last_name,
    shipping_email: source.shipping_email,
    shipping_phone: source.shipping_phone,
    shipping_address1: source.shipping_address1,
    shipping_address2: source.shipping_address2,
    shipping_city: source.shipping_city,
    shipping_state: source.shipping_state,
    shipping_zip: source.shipping_zip,
    patient_first_name: source.patient_first_name,
    patient_last_name: source.patient_last_name,
    patient_dob: source.patient_dob,
    prescriber_name: source.prescriber_name,
    prescriber_practice: source.prescriber_practice,
    prescriber_phone: source.prescriber_phone,
    prescriber_fax: source.prescriber_fax,
    prescriber_email: source.prescriber_email,
  }).select("id").single();
  if (insertError || !draft) {
    return NextResponse.json({ error: "Unable to start reorder." }, { status: 503 });
  }
  const { error: provenanceError } = await supabaseServer.from("reorder_drafts").insert({
    draft_order_id: draft.id, source_order_id: source.id,
  });
  if (provenanceError) {
    await supabaseServer.from("orders").delete().eq("id", draft.id).eq("status", "draft");
    return NextResponse.json({ error: "Unable to start reorder." }, { status: 503 });
  }
  const response = NextResponse.json({
    ok: true, destination: prescriptionExpired ? "/enter-prescription" : "/cart",
  });
  response.headers.set("Cache-Control", "private, no-store");
  await captureServerEvent({ event: POSTHOG_EVENTS.REORDER_AUTH_COMPLETED,
    request, properties: { prescription_expired: prescriptionExpired } });
  return setGuestOrderCookie(response, draft.id);
}
