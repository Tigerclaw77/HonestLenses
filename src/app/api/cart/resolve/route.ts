export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../lib/get-user-from-request";
import { getPrice } from "../../../../lib/pricing/getPrice";
import { SKU_BOX_DURATION_MONTHS } from "../../../../lib/pricing/skuDefaults";
import { resolveDefaultSku } from "../../../../lib/pricing/resolveDefaultSku";

/* =========================
   Constants
========================= */

const MIN_DAYS_FOR_ANNUAL = 150; // ~5 months remaining
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/* =========================
   Types
========================= */

type EyeRx = {
  lens_id: string;
};

type RxData = {
  expires: string; // YYYY-MM-DD
  right?: EyeRx;
  left?: EyeRx;
};

type ResolveBody = {
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
  return (
    isObject(value) &&
    typeof value.lens_id === "string" &&
    value.lens_id.length > 0
  );
}

function isRxData(value: unknown): value is RxData {
  if (!isObject(value)) return false;

  if (typeof value.expires !== "string" || value.expires.length === 0) {
    return false;
  }

  if ("right" in value && value.right != null && !isEyeRx(value.right)) {
    return false;
  }

  if ("left" in value && value.left != null && !isEyeRx(value.left)) {
    return false;
  }

  return true;
}

function isFiniteNonNegativeInt(n: unknown): n is number {
  return (
    typeof n === "number" &&
    Number.isFinite(n) &&
    Number.isInteger(n) &&
    n >= 0
  );
}

function isResolveBody(value: unknown): value is ResolveBody {
  if (!isObject(value)) return false;

  const r = value.right_box_count;
  const l = value.left_box_count;

  if (r !== undefined && r !== null && !isFiniteNonNegativeInt(r)) return false;
  if (l !== undefined && l !== null && !isFiniteNonNegativeInt(l)) return false;

  return true;
}

/* =========================
   Helpers
========================= */

function daysUntil(expires: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expires);
  if (!m) throw new Error("Invalid RX expiration date");

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);

  const expUTC = Date.UTC(y, mo - 1, d);
  const now = new Date();
  const todayUTC = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );

  return Math.floor((expUTC - todayUTC) / MS_PER_DAY);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

async function safeJson(req: Request): Promise<unknown> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return null;
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/* =========================
   POST /api/cart/resolve
========================= */

export async function POST(req: Request) {
  /* ---------- Auth ---------- */
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  /* ---------- Optional body ---------- */
  const rawBody = await safeJson(req);
  const body: ResolveBody | null = isResolveBody(rawBody) ? rawBody : null;

  /* ---------- Load draft order ---------- */
  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(`
      id,
      user_id,
      status,
      rx,
      sku,
      right_box_count,
      left_box_count
    `)
    .eq("user_id", user.id)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!order?.id) {
    return NextResponse.json(
      { error: "Draft order not found." },
      { status: 400 }
    );
  }

  /* ---------- RX validation ---------- */
  if (!isRxData(order.rx)) {
    return NextResponse.json(
      { error: "Order missing RX. Save prescription first." },
      { status: 400 }
    );
  }

  const rx = order.rx;
  const hasRight = Boolean(rx.right);
  const hasLeft = Boolean(rx.left);

  if (!hasRight && !hasLeft) {
    return NextResponse.json(
      { error: "Order missing RX eyes." },
      { status: 400 }
    );
  }

  const lens_id = rx.right?.lens_id ?? rx.left?.lens_id ?? null;
  if (!lens_id) {
    return NextResponse.json({ error: "Missing lens_id." }, { status: 400 });
  }

  /* ---------- Expiration + SKU Resolution ---------- */
  let remainingDays: number;
  let targetMonths: 6 | 12;
  let resolvedSku: string | null = null;

  try {
    remainingDays = daysUntil(rx.expires);

    if (remainingDays < 0) {
      return NextResponse.json(
        { error: "Prescription expired. Please upload an updated prescription." },
        { status: 400 }
      );
    }

    targetMonths =
      remainingDays >= MIN_DAYS_FOR_ANNUAL ? 12 : 6;

    resolvedSku = resolveDefaultSku(lens_id, targetMonths);

    if (!resolvedSku) {
      return NextResponse.json(
        { error: `No default SKU for lens_id ${lens_id}` },
        { status: 400 }
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid expiration" },
      { status: 400 }
    );
  }

  /* ---------- Duration Lookup ---------- */
  const durationMonths = SKU_BOX_DURATION_MONTHS[resolvedSku];
  if (!durationMonths) {
    return NextResponse.json(
      { error: `Missing duration for SKU ${resolvedSku}` },
      { status: 500 }
    );
  }

  const defaultPerEye = Math.ceil(targetMonths / durationMonths);
  const maxPerEye = defaultPerEye * 2;

  const requestedRight = body?.right_box_count;
  const requestedLeft = body?.left_box_count;

  const finalRight = hasRight
    ? clamp(requestedRight ?? defaultPerEye, 0, maxPerEye)
    : null;

  const finalLeft = hasLeft
    ? clamp(requestedLeft ?? defaultPerEye, 0, maxPerEye)
    : null;

  const totalBoxes = (finalRight ?? 0) + (finalLeft ?? 0);

  if (totalBoxes <= 0) {
    return NextResponse.json(
      { error: "Invalid total box count." },
      { status: 400 }
    );
  }

  /* ---------- Pricing ---------- */
  const pricing = getPrice({ sku: resolvedSku, box_count: totalBoxes });
  const subtotalCents = pricing.total_amount_cents;

  const totalMonthsAcrossOrder = totalBoxes * durationMonths;

  /* ---------- Shipping ---------- */
  const shippingCents = totalMonthsAcrossOrder >= 12 ? 0 : 1000;
  const totalAmountCents = subtotalCents + shippingCents;

  /* ---------- Persist ---------- */
  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      sku: resolvedSku,
      right_box_count: finalRight,
      left_box_count: finalLeft,
      box_count: totalBoxes,
      shipping_cents: shippingCents,
      total_amount_cents: totalAmountCents,
      price_reason:
        `cart_resolve: sku=${resolvedSku}, remainingDays=${remainingDays}, ` +
        `targetMonths=${targetMonths}, durationMonths=${durationMonths}, ` +
        `totalMonths=${totalMonthsAcrossOrder}, shipping=${shippingCents}`,
    })
    .eq("id", order.id)
    .eq("user_id", user.id)
    .eq("status", "draft");

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    order: {
      id: order.id,
      sku: resolvedSku,
      right_box_count: finalRight,
      left_box_count: finalLeft,
      box_count: totalBoxes,
      shipping_cents: shippingCents,
      subtotal_cents: subtotalCents,
      total_amount_cents: totalAmountCents,
    },
  });
}