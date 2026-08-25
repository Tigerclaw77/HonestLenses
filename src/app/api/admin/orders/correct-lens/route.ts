import { NextResponse } from "next/server";
import {
  adminAuthErrorResponse,
  logAdminAuthFailure,
  requireAdminUser,
} from "@/lib/admin-auth";
import {
  buildAdminLensCorrectionPatch,
  type AdminLensCorrectionInput,
} from "@/lib/orders/adminLensCorrection";
import { getAuthoritativeOrderQuote } from "@/lib/orders/orderPricing";
import { CORE_TO_SKUS } from "@/lib/pricing/resolveDefaultSku";
import { getLensById } from "@/LensCore";
import { findManagedCatalogFamily } from "@/lib/managedCatalog/runtime";
import { getManagedOrderQuote, getManagedPackSizeOptions } from "@/lib/managedCatalog/commerce";
import { managedInputToLensCore } from "@/lib/managedCatalog/validation";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

type RequestBody = {
  orderId?: unknown;
  coreId?: unknown;
  sku?: unknown;
  expires?: unknown;
  right?: unknown;
  left?: unknown;
  right_box_count?: unknown;
  left_box_count?: unknown;
  shared_pack_for_both_eyes?: unknown;
  reason?: unknown;
  customer_approved_substitution?: unknown;
  payment_already_captured?: unknown;
  captured_amount_cents?: unknown;
  supplier_order_already_placed?: unknown;
};

type OrderRow = {
  id: string;
  status: string | null;
  fulfillment_status: string | null;
  verification_status: string | null;
  payment_status: string | null;
  capture_amount_cents: number | null;
  admin_notes: string | null;
  rx: unknown;
  sku: string | null;
  manufacturer: string | null;
  rx_lens_brand: string | null;
  shipping_method: "standard" | "express" | null;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberField(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableNumberField(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return numberField(value) ?? undefined;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanField(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseEye(value: unknown) {
  const eye = object(value);
  const sphere = numberField(eye?.sphere);
  if (sphere === null) return null;
  const cylinder = nullableNumberField(eye?.cylinder);
  const axis = nullableNumberField(eye?.axis);
  const baseCurve = nullableNumberField(eye?.base_curve);
  const diameter = nullableNumberField(eye?.diameter);
  const addValue = eye?.add;
  if (
    cylinder === undefined || axis === undefined || baseCurve === undefined ||
    diameter === undefined ||
    (addValue !== null && addValue !== undefined && typeof addValue !== "string")
  ) return null;
  return {
    sphere,
    cylinder,
    axis,
    base_curve: baseCurve,
    diameter,
    add: typeof addValue === "string" && addValue.trim() ? addValue.trim() : null,
  };
}

async function bodyOf(request: Request): Promise<RequestBody> {
  try {
    const body = (await request.json()) as RequestBody;
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

/**
 * This endpoint is deliberately a record correction. It has no Stripe client,
 * no payment command, and no supplier integration; payment and supplier work
 * stay explicit, separate operational actions.
 */
export async function POST(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    logAdminAuthFailure("POST /api/admin/orders/correct-lens", auth);
    return adminAuthErrorResponse(auth);
  }

  const body = await bodyOf(request);
  const orderId = stringField(body.orderId);
  const coreId = stringField(body.coreId);
  const sku = stringField(body.sku);
  const expires = stringField(body.expires);
  const right = parseEye(body.right);
  const left = parseEye(body.left);
  const rightBoxCount = numberField(body.right_box_count);
  const leftBoxCount = numberField(body.left_box_count);
  const reason = stringField(body.reason);
  const customerApprovedSubstitution = booleanField(body.customer_approved_substitution);
  const paymentAlreadyCaptured = booleanField(body.payment_already_captured);
  const supplierOrderAlreadyPlaced = booleanField(body.supplier_order_already_placed);
  const capturedAmountCents = nullableNumberField(body.captured_amount_cents);

  if (
    !orderId || !coreId || !sku || !expires || !right || !left ||
    rightBoxCount === null || leftBoxCount === null || !reason ||
    customerApprovedSubstitution === null || paymentAlreadyCaptured === null ||
    supplierOrderAlreadyPlaced === null || capturedAmountCents === undefined ||
    typeof body.shared_pack_for_both_eyes !== "boolean"
  ) {
    return NextResponse.json({ error: "Complete correction, approval, payment, and supplier-record details are required.", code: "INVALID_LENS_CORRECTION" }, { status: 400 });
  }

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("id, status, fulfillment_status, verification_status, payment_status, capture_amount_cents, admin_notes, rx, sku, manufacturer, rx_lens_brand, shipping_method")
    .eq("id", orderId)
    .maybeSingle<OrderRow>();
  if (orderError) return NextResponse.json({ error: "Unable to load the order.", code: "ORDER_LOOKUP_FAILED" }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found.", code: "ORDER_NOT_FOUND" }, { status: 404 });

  const sourceLens = getLensById(coreId);
  const managed = sourceLens ? null : await findManagedCatalogFamily(coreId);
  const lens = sourceLens ?? (managed ? managedInputToLensCore(managed) : null);
  if (!lens) return NextResponse.json({ error: "Selected replacement lens is not available in the current catalog.", code: "LENS_NOT_FOUND" }, { status: 400 });

  const allowedSkus = managed
    ? getManagedPackSizeOptions(managed).map((option) => option.sku)
    : CORE_TO_SKUS[coreId] ?? [];
  if (!allowedSkus.includes(sku)) {
    return NextResponse.json({ error: "Selected SKU does not belong to the replacement lens.", code: "INVALID_REPLACEMENT_SKU" }, { status: 400 });
  }

  const totalBoxes = rightBoxCount + leftBoxCount;
  let quote;
  try {
    quote = managed
      ? getManagedOrderQuote({ family: managed, sku, totalBoxes, rightBoxCount, leftBoxCount, shippingMethod: order.shipping_method })
      : getAuthoritativeOrderQuote({ sku, totalBoxes, rightBoxCount, leftBoxCount, shippingMethod: order.shipping_method });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Replacement pricing failed.", code: "REPLACEMENT_PRICING_FAILED" }, { status: 400 });
  }

  const actor = auth.user.email ?? auth.user.id;
  const now = new Date().toISOString();
  let patch;
  try {
    patch = buildAdminLensCorrectionPatch({
      order,
      input: {
        expires,
        right,
        left,
        rightBoxCount,
        leftBoxCount,
        sharedPackForBothEyes: body.shared_pack_for_both_eyes,
        reason,
        customerApprovedSubstitution,
        paymentAlreadyCaptured,
        capturedAmountCents,
        supplierOrderAlreadyPlaced,
      } satisfies AdminLensCorrectionInput,
      lens,
      sku,
      quote,
      actor,
      now,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid lens correction.", code: "INVALID_LENS_CORRECTION" }, { status: 400 });
  }

  const event = {
    event_type: "admin_lens_prescription_reconciliation",
    actor,
    message: reason,
    before: {
      status: order.status,
      fulfillment_status: order.fulfillment_status,
      verification_status: order.verification_status,
      payment_status: order.payment_status,
      capture_amount_cents: order.capture_amount_cents,
      product: { sku: order.sku, manufacturer: order.manufacturer, rx_lens_brand: order.rx_lens_brand, rx: order.rx },
    },
    after: {
      product: { sku, manufacturer: patch.manufacturer, rx_lens_brand: lens.displayName, rx: patch.rx },
      quantities: { right_box_count: patch.right_box_count, left_box_count: patch.left_box_count, total_box_count: patch.total_box_count },
      corrected_catalog_quote: { total_amount_cents: quote.totalAmountCents, shipping_cents: quote.shippingCents, price_reason: quote.priceReason },
      customer_approved_substitution: customerApprovedSubstitution,
      payment_already_captured: paymentAlreadyCaptured,
      captured_amount_cents: paymentAlreadyCaptured ? capturedAmountCents : null,
      supplier_order_already_placed: supplierOrderAlreadyPlaced,
    },
  };
  const { data: updatedOrder, error: reconciliationError } = await supabaseServer.rpc(
    "apply_admin_lens_reconciliation",
    { p_order_id: order.id, p_patch: patch, p_event: event },
  );
  if (reconciliationError || !updatedOrder) {
    return NextResponse.json(
      { error: "Lens correction and audit record were not saved.", code: "LENS_CORRECTION_SAVE_FAILED" },
      { status: reconciliationError?.code === "P0002" ? 404 : 500 },
    );
  }

  return NextResponse.json({ ok: true, order: updatedOrder, event_logged: true });
}
