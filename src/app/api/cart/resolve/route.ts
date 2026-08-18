export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";
import {
  canAccessOrder,
  getOrderAccess,
  hasOrderAccessContext,
} from "@/lib/order-access";
import { getSkuBoxDurationMonths } from "../../../../lib/pricing/skuDefaults";
import { resolveDefaultSku } from "../../../../lib/pricing/resolveDefaultSku";
import {
  convertPackSizeQuantity,
  canChangeOrderPackSize,
  getOrderPackCoreId,
  getPersistedPackSku,
  isSkuAvailableForCoreId,
} from "@/lib/cart/packSizeSelection";
import {
  hasResolvedCartQuantity,
  resolveCartEyeBoxCounts,
} from "@/lib/cart/resolveQuantities";
import { isShippingMethod } from "../../../../lib/shipping/resolveShipping";
import { getAuthoritativeOrderQuote } from "@/lib/orders/orderPricing";
import {
  getAuthoritativeOrderQuantity,
  getStoredEyeQuantityPresence,
} from "@/lib/orders/orderQuantity";
import { getLensById, validateLensParams } from "@/LensCore";
import { findManagedCatalogFamily, getRuntimeLens } from "@/lib/managedCatalog/runtime";
import { convertManagedPackSizeQuantity, getManagedDefaultSku, getManagedOrderQuote, getManagedPackSizeOptions, getManagedSkuDurationMonths } from "@/lib/managedCatalog/commerce";
import { POSTHOG_EVENTS } from "../../../../lib/posthog/events";
import {
  captureServerEvent,
  captureServerException,
} from "../../../../lib/posthog/server";

// import { lenses } from "@/LensCore";
// import { resolveXRVariant } from "@/LensCore/helpers/resolveXRVariant";

/* =========================
   Constants
========================= */

/* =========================
   TODO: XR VARIANT RESOLUTION (RE-ENABLE AFTER STABILIZATION)

   Purpose:
   - Upgrade lens to XR variant when RX exceeds standard ranges

   Example:
   - Biofinity Toric → Biofinity XR Toric

   Requirements before enabling:
   - Cart lifecycle stable (no stale drafts)
   - Resolve route no longer throwing 400s
   - Checkout successfully creates PaymentIntent

   Implementation:
   - Use resolveXRVariant(baseLens, rx)
   - Wrap in try/catch (NEVER break checkout)
   - Fallback to base lens if XR fails

========================= */

const MIN_DAYS_FOR_ANNUAL = 150;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/* =========================
   Types
========================= */

type EyeRx = {
  coreId: string;
  sphere?: number;
  cylinder?: number | null;
  axis?: number | null;
  add?: string | null;
  base_curve?: number | null;
  diameter?: number | null;
};

type RxData = {
  expires: string;
  right?: EyeRx;
  left?: EyeRx;
};

type ResolveBody = {
  order_id?: string;
  right_box_count?: number | null;
  left_box_count?: number | null;
  shipping_method?: string;
  sku?: string;
};

/* =========================
   Type Guards
========================= */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEyeRx(value: unknown): value is EyeRx {
  return isObject(value) && typeof value.coreId === "string";
}

function isRxData(value: unknown): value is RxData {
  if (!isObject(value)) return false;
  if (typeof value.expires !== "string") return false;

  if ("right" in value && value.right && !isEyeRx(value.right)) return false;
  if ("left" in value && value.left && !isEyeRx(value.left)) return false;

  return true;
}

function isFiniteNonNegativeInt(n: unknown): n is number {
  return (
    typeof n === "number" && Number.isFinite(n) && Number.isInteger(n) && n >= 0
  );
}

function isResolveBody(value: unknown): value is ResolveBody {
  if (!isObject(value)) return false;

  if (
    value.order_id !== undefined &&
    value.order_id !== null &&
    typeof value.order_id !== "string"
  )
    return false;

  if (value.sku !== undefined && value.sku !== null && typeof value.sku !== "string") {
    return false;
  }

  if (
    value.right_box_count !== undefined &&
    value.right_box_count !== null &&
    !isFiniteNonNegativeInt(value.right_box_count)
  )
    return false;

  if (
    value.left_box_count !== undefined &&
    value.left_box_count !== null &&
    !isFiniteNonNegativeInt(value.left_box_count)
  )
    return false;

  if (
    value.shipping_method !== undefined &&
    value.shipping_method !== null &&
    !isShippingMethod(value.shipping_method)
  )
    return false;

  return true;
}

function hasOwn(value: object | null, key: string): boolean {
  return value !== null && Object.prototype.hasOwnProperty.call(value, key);
}

async function validateResolvedEyeRx(eye: EyeRx | undefined): Promise<string[]> {
  if (!eye) return [];
  const lens = await getRuntimeLens(eye.coreId);
  if (!lens) return ["Lens not found."];
  const result = validateLensParams(lens, {
    sphere: typeof eye.sphere === "number" ? eye.sphere : Number.NaN,
    cylinder: eye.cylinder ?? null,
    axis: eye.axis ?? null,
    add: eye.add ?? null,
    baseCurve: eye.base_curve ?? null,
    diameter: eye.diameter ?? null,
  });

  return result.errors;
}

/* =========================
   Helpers
========================= */

function parseFlexibleDate(input: string): Date | null {
  if (!input) return null;

  const parseParts = (year: number, month: number, day: number) => {
    if (month < 1 || month > 12) return null;
    const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day < 1 || day > maxDay) return null;
    return new Date(Date.UTC(year, month - 1, day));
  };

  // Case 1: ISO (YYYY-MM-DD)
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (iso) {
    return parseParts(+iso[1], +iso[2], +iso[3]);
  }

  // Case 2: M/D/YYYY or MM/DD/YYYY
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input);
  if (us) {
    return parseParts(+us[3], +us[1], +us[2]);
  }

  return null;
}

function daysUntil(expires: string): number | null {
  const parsed = parseFlexibleDate(expires);

  if (!parsed) {
    console.warn("⚠️ Invalid RX expiration format", { expires });
    return null;
  }

  const now = new Date();
  const todayUTC = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  const expUTC = Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
  );

  return Math.floor((expUTC - todayUTC) / MS_PER_DAY);
}

async function safeJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/* =========================
   ROUTE
========================= */

export async function POST(req: Request) {
  const access = await getOrderAccess(req);
  if (!hasOrderAccessContext(access)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await safeJson(req);
  const body = isResolveBody(rawBody) ? rawBody : null;

  /* =========================
     Load draft (SAFE)
  ========================= */

  let query = supabaseServer
    .from("orders")
    .select(
      `
      id,
      user_id,
      status,
      rx,
      sku,
      box_count,
      total_box_count,
      right_box_count,
      left_box_count,
      adjusted_right_box_count,
      adjusted_left_box_count,
      adjusted_total_box_count,
      shipping_method,
      brand_confidence,
      verification_status,
      created_at
    `,
    )
    .eq("status", "draft");

  if (body?.order_id) {
    query = query.eq("id", body.order_id);
  } else if (access.guestOrderId) {
    query = query.eq("id", access.guestOrderId);
  } else if (access.userId) {
    query = query.eq("user_id", access.userId);
  }

  query = query.order("created_at", { ascending: false }).limit(1);

  const { data: rows, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Unable to load cart." }, { status: 500 });
  }

  const order = rows?.[0] ?? null;

  /* =========================
     Recover if missing
  ========================= */

  if (!order) {
    return NextResponse.json(
      { error: "No active draft order." },
      { status: 400 },
    );
  }

  if (!canAccessOrder(access, order)) {
    return NextResponse.json({ error: "Order not authorized." }, { status: 403 });
  }

  /* =========================
     RX validation
  ========================= */

  if (!isRxData(order.rx)) {
    return NextResponse.json({ error: "Order missing RX." }, { status: 400 });
  }

  const rx = order.rx;
  const [rightRxValidationErrors, leftRxValidationErrors] = await Promise.all([
    validateResolvedEyeRx(rx.right),
    validateResolvedEyeRx(rx.left),
  ]);
  const rxValidationErrors = [...rightRxValidationErrors, ...leftRxValidationErrors];

  if (rxValidationErrors.length > 0) {
    return NextResponse.json(
      {
        error: "Invalid prescription parameters.",
        details: rxValidationErrors,
      },
      { status: 400 },
    );
  }

  const primaryCoreId = rx.right?.coreId ?? rx.left?.coreId ?? null;
  const packCoreId = getOrderPackCoreId({
    rightCoreId: rx.right?.coreId,
    leftCoreId: rx.left?.coreId,
  });

  if (!primaryCoreId) {
    return NextResponse.json(
      { error: "Missing lens selection" },
      { status: 400 },
    );
  }

  /* =========================
     SKU + Pricing
  ========================= */

  console.log("RESOLVE INPUT", {
    orderId: order.id,
    expires: rx.expires,
    verification_status: order.verification_status,
  });

  const remainingDays = daysUntil(rx.expires);

  if (remainingDays === null) {
    return NextResponse.json(
      { error: "Invalid prescription expiration date." },
      { status: 400 },
    );
  }

  if (remainingDays < 0) {
    return NextResponse.json(
      { error: "Prescription expired." },
      { status: 400 },
    );
  }

  const targetMonths = remainingDays >= MIN_DAYS_FOR_ANNUAL ? 12 : 6;

  console.log("RESOLVE OUTPUT", {
    orderId: order.id,
    remainingDays,
  });

  const requestedSku = body?.sku?.trim() || null;
  if (requestedSku && !packCoreId) {
    return NextResponse.json(
      { error: "Order-level pack sizes require matching lens families for both eyes." },
      { status: 400 },
    );
  }

  // An order has one SKU, so only matching-eye families can change pack size.
  // Retain the existing primary-eye resolver behaviour for all other carts.
  const coreId = packCoreId ?? primaryCoreId;
  // Do not touch the managed database for any source-backed family. This is
  // the legacy execution path byte-for-byte in terms of catalog data.
  const managedFamily = getLensById(coreId)
    ? null
    : await findManagedCatalogFamily(coreId);
  const defaultSku = managedFamily
    ? getManagedDefaultSku(managedFamily, targetMonths)
    : resolveDefaultSku(coreId, targetMonths);
  if (!defaultSku) {
    return NextResponse.json({ error: "No SKU found." }, { status: 400 });
  }

  const isRequestedSkuAvailable = requestedSku
    ? managedFamily
      ? getManagedPackSizeOptions(managedFamily).some((option) => option.sku === requestedSku)
      : isSkuAvailableForCoreId(coreId, requestedSku)
    : true;
  if (!isRequestedSkuAvailable) {
    return NextResponse.json(
      { error: "Requested pack size is not available for this lens." },
      { status: 400 },
    );
  }

  const storedQuantity = getAuthoritativeOrderQuantity(order);
  const storedEyeQuantityPresence = getStoredEyeQuantityPresence(order);
  const previousSku = managedFamily
    ? order.sku && storedQuantity.total > 0 && getManagedPackSizeOptions(managedFamily).some((option) => option.sku === order.sku)
      ? order.sku
      : null
    : getPersistedPackSku(coreId, order.sku, storedQuantity.total > 0);
  const hasCompatibleStoredQuantity = previousSku !== null;
  const resolvedSku = requestedSku ?? previousSku ?? defaultSku;

  const monthsPerBox = managedFamily
    ? getManagedSkuDurationMonths(managedFamily, resolvedSku)
    : getSkuBoxDurationMonths(resolvedSku);

  const defaultPerEye = Math.ceil(targetMonths / monthsPerBox);
  const hasRequestedQuantity =
    hasOwn(body, "right_box_count") || hasOwn(body, "left_box_count");
  const hasRequestedPackSize = requestedSku !== null && requestedSku !== previousSku;

  if (
    (storedQuantity.adjusted && hasRequestedQuantity) ||
    !canChangeOrderPackSize({
      adjusted: storedQuantity.adjusted,
      requestedSku,
      previousSku,
    })
  ) {
    return NextResponse.json(
      {
        error:
          "This order quantity was adjusted after review and cannot be changed from the cart.",
        code: "ORDER_QUANTITY_LOCKED",
      },
      { status: 409 },
    );
  }

  const storedRightBoxCount =
    hasRequestedPackSize && previousSku
      ? managedFamily
        ? convertManagedPackSizeQuantity(managedFamily, storedQuantity.right, previousSku, resolvedSku)
        : convertPackSizeQuantity(storedQuantity.right, previousSku, resolvedSku)
      : hasCompatibleStoredQuantity
        ? storedQuantity.right
        : 0;
  const storedLeftBoxCount =
    hasRequestedPackSize && previousSku
      ? managedFamily
        ? convertManagedPackSizeQuantity(managedFamily, storedQuantity.left, previousSku, resolvedSku)
        : convertPackSizeQuantity(storedQuantity.left, previousSku, resolvedSku)
      : hasCompatibleStoredQuantity
        ? storedQuantity.left
        : 0;

  const counts = resolveCartEyeBoxCounts({
    hasRightEye: Boolean(rx.right),
    hasLeftEye: Boolean(rx.left),
    defaultPerEye,
    requestedRightBoxCount: body?.right_box_count,
    requestedLeftBoxCount: body?.left_box_count,
    hasRequestedRightBoxCount: hasOwn(body, "right_box_count"),
    hasRequestedLeftBoxCount: hasOwn(body, "left_box_count"),
    storedRightBoxCount,
    storedLeftBoxCount,
    hasStoredRightBoxCount:
      hasCompatibleStoredQuantity && storedEyeQuantityPresence.right,
    hasStoredLeftBoxCount:
      hasCompatibleStoredQuantity && storedEyeQuantityPresence.left,
  });

  if (!hasResolvedCartQuantity(counts)) {
    return NextResponse.json(
      {
        error: "Choose at least one box before resolving the cart.",
        code: "EMPTY_CART",
      },
      { status: 400 },
    );
  }

  const right = counts.right;
  const left = counts.left;
  const totalBoxes = counts.totalBoxes;
  const quote = managedFamily
    ? getManagedOrderQuote({ family: managedFamily, sku: resolvedSku, totalBoxes, rightBoxCount: right, leftBoxCount: left, shippingMethod: body?.shipping_method ?? order.shipping_method ?? null })
    : getAuthoritativeOrderQuote({
      sku: resolvedSku,
      totalBoxes,
      rightBoxCount: right,
      leftBoxCount: left,
      shippingMethod: body?.shipping_method ?? order.shipping_method ?? null,
    });
  const totalMonths = quote.totalMonths;
  const preserveSubmittedQuantity =
    storedQuantity.adjusted && !hasRequestedQuantity;
  console.log("RESOLVE SKU", {
    orderId: order.id,
    coreId,
    resolvedSku,
    totalBoxes,
    totalMonths,
  });

  if (totalBoxes > 0 && totalMonths <= 0) {
    await captureServerEvent({
      event: POSTHOG_EVENTS.SHIPPING_CALCULATION_ERROR,
      distinctId: access.distinctId,
      request: req,
      properties: {
        order_id: order.id,
        sku: resolvedSku,
        manufacturer: quote.manufacturer,
        total_boxes: totalBoxes,
        total_months: totalMonths,
        reason: "missing_sku_duration_or_box_count",
      },
    });
  }

  /* =========================
     Persist
  ========================= */

  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      sku: resolvedSku,
      manufacturer: quote.manufacturer,
      right_box_count: preserveSubmittedQuantity
        ? order.right_box_count
        : right,
      left_box_count: preserveSubmittedQuantity
        ? order.left_box_count
        : left,
      box_count: preserveSubmittedQuantity ? order.box_count : totalBoxes,
      total_box_count: preserveSubmittedQuantity
        ? order.total_box_count
        : totalBoxes,
      shipping_method: quote.shippingMethod,
      shipping_cents: quote.shippingCents,
      total_amount_cents: quote.totalAmountCents,
      price_reason: quote.priceReason,
    })
    .eq("id", order.id);

  if (updateError) {
    await captureServerException({
      event: POSTHOG_EVENTS.API_ROUTE_FAILED,
      error: updateError,
      distinctId: access.distinctId,
      request: req,
      properties: {
        route: "/api/cart/resolve",
        order_id: order.id,
      },
    });
    return NextResponse.json({ error: "Unable to update cart." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, orderId: order.id });
}
