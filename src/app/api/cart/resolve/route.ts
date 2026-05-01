export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../lib/get-user-from-request";
import { getPrice } from "../../../../lib/pricing/getPrice";
import { getSkuBoxDurationMonths } from "../../../../lib/pricing/skuDefaults";
import { resolveDefaultSku } from "../../../../lib/pricing/resolveDefaultSku";
import { deriveTotalBoxes } from "../../../../lib/shipping";
import { resolveShipping } from "../../../../lib/shipping/resolveShipping";

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
};

type RxData = {
  expires: string;
  right?: EyeRx;
  left?: EyeRx;
};

type ResolveBody = {
  order_id?: string;
  right_box_count?: number;
  left_box_count?: number;
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

  return true;
}

/* =========================
   Helpers
========================= */

function parseFlexibleDate(input: string): Date | null {
  if (!input) return null;

  // Case 1: ISO (YYYY-MM-DD)
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (iso) {
    return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  }

  // Case 2: M/D/YYYY or MM/DD/YYYY
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input);
  if (us) {
    return new Date(Date.UTC(+us[3], +us[1] - 1, +us[2]));
  }

  return null;
}

function daysUntil(expires: string): number {
  const parsed = parseFlexibleDate(expires);

  if (!parsed) {
    console.warn("⚠️ Invalid RX expiration format", { expires });
    return 365; // 👈 SAFE DEFAULT (treat as valid, not expired)
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
  const user = await getUserFromRequest(req);
  if (!user) {
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
      brand_confidence,
      verification_status,
      created_at
    `,
    )
    .eq("user_id", user.id)
    .eq("status", "draft");

  if (body?.order_id) {
    query = query.eq("id", body.order_id);
  }

  query = query.order("created_at", { ascending: false }).limit(1);

  const { data: rows, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  /* =========================
     RX validation
  ========================= */

  if (!isRxData(order.rx)) {
    return NextResponse.json({ error: "Order missing RX." }, { status: 400 });
  }

  const rx = order.rx;

  /* =========================
   AUTO VERIFICATION GATE
========================= */

  if (
    order.verification_status !== "auto_verified" &&
    order.verification_status !== "verified"
  ) {
    console.log("🚫 BLOCKED: verification_status =", order.verification_status);

    return NextResponse.json(
      { error: "Order requires verification before proceeding." },
      { status: 400 },
    );
  }

  const coreId = rx.right?.coreId ?? rx.left?.coreId ?? null;

  if (!coreId) {
    return NextResponse.json({ error: "Missing coreId." }, { status: 400 });
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

  const resolvedSku = resolveDefaultSku(coreId, targetMonths);
  if (!resolvedSku) {
    return NextResponse.json({ error: "No SKU found." }, { status: 400 });
  }

  const monthsPerBox = getSkuBoxDurationMonths(resolvedSku);

  const defaultPerEye = Math.ceil(targetMonths / monthsPerBox);

  const right = rx.right ? (body?.right_box_count ?? defaultPerEye) : null;
  const left = rx.left ? (body?.left_box_count ?? defaultPerEye) : null;

  const totalBoxes = deriveTotalBoxes({
    sku: resolvedSku,
    total_box_count: null,
    box_count: null,
    left_box_count: left,
    right_box_count: right,
  });
  const totalMonths = totalBoxes && monthsPerBox ? totalBoxes * monthsPerBox : 0;
  console.log("RESOLVE SKU", {
    orderId: order.id,
    coreId,
    resolvedSku,
    totalBoxes,
    totalMonths,
  });

  const pricing = getPrice({ sku: resolvedSku, box_count: totalBoxes });
  const shipping = resolveShipping({
    manufacturer: pricing.manufacturer,
    totalMonths,
    itemCount: totalBoxes,
    hasMixedSkus: false,
  });

  /* =========================
     Persist
  ========================= */

  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      sku: resolvedSku,
      manufacturer: pricing.manufacturer,
      right_box_count: right,
      left_box_count: left,
      box_count: totalBoxes,
      total_box_count: totalBoxes,
      shipping_cents: shipping.shippingCents,
      total_amount_cents: pricing.total_amount_cents + shipping.shippingCents,
    })
    .eq("id", order.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, orderId: order.id });
}
