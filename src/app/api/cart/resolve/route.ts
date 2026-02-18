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

const MIN_DAYS_FOR_ANNUAL = 150; // ~5 months
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/* =========================
   Types
========================= */

type EyeRx = {
  lens_id: string;
};

type RxData = {
  expires: string;
  right?: EyeRx;
  left?: EyeRx;
};

type ResolveBody = {
  right_box_count?: number;
  left_box_count?: number;
  box_count?: number;
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
    typeof n === "number" && Number.isFinite(n) && Number.isInteger(n) && n >= 0
  );
}

function isResolveBody(value: unknown): value is ResolveBody {
  if (!isObject(value)) return false;

  const r = value.right_box_count;
  const l = value.left_box_count;
  const b = value.box_count;

  if (r !== undefined && r !== null && !isFiniteNonNegativeInt(r)) return false;
  if (l !== undefined && l !== null && !isFiniteNonNegativeInt(l)) return false;
  if (b !== undefined && b !== null && !isFiniteNonNegativeInt(b)) return false;

  return true;
}

/* =========================
   Helpers
========================= */

function daysUntil(expires: string): number {
  const exp = new Date(expires);
  if (Number.isNaN(exp.getTime())) {
    throw new Error("Invalid RX expiration date");
  }
  return Math.floor((exp.getTime() - Date.now()) / MS_PER_DAY);
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

function wasPreviouslyExplicit(price_reason: unknown): boolean {
  if (typeof price_reason !== "string") return false;
  return price_reason.includes("explicitQty=true");
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

  const hasExplicitQty =
    body !== null &&
    (isFiniteNonNegativeInt(body.right_box_count) ||
      isFiniteNonNegativeInt(body.left_box_count));

  /* ---------- Load active order ---------- */

  const { data: initialOrder, error } = await supabaseServer
    .from("orders")
    .select(
      `
    id,
    user_id,
    status,
    rx,
    sku,
    box_count,
    right_box_count,
    left_box_count,
    price_reason,
    created_at
    `,
    )
    .eq("user_id", user.id)
    .in("status", ["draft", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let order = initialOrder;

  /* ---------- If no active order → create draft ---------- */
  if (!order?.id) {
    const { data: created, error: createErr } = await supabaseServer
      .from("orders")
      .insert({
        user_id: user.id,
        status: "draft",
        rx: null,
        sku: null,
        box_count: null,
        right_box_count: null,
        left_box_count: null,
        total_amount_cents: null,
        price_reason: "created_by_cart_resolve: awaiting_rx",
      })
      .select(
        `
        id,
        user_id,
        status,
        rx,
        sku,
        box_count,
        right_box_count,
        left_box_count,
        price_reason,
        created_at
        `,
      )
      .single();

    if (createErr || !created?.id) {
      return NextResponse.json(
        { error: createErr?.message ?? "Failed to create order" },
        { status: 500 },
      );
    }

    order = created;
  }

  /* ---------- RX validation ---------- */
  if (!isRxData(order.rx)) {
    return NextResponse.json(
      { error: "Order is missing RX. Save prescription first." },
      { status: 400 },
    );
  }

  const rx = order.rx;
  const hasRight = Boolean(rx.right);
  const hasLeft = Boolean(rx.left);

  if (!hasRight && !hasLeft) {
    return NextResponse.json(
      { error: "Order missing RX eyes" },
      { status: 400 },
    );
  }

  /* ---------- Resolve SKU ---------- */
  const lens_id = rx.right?.lens_id ?? rx.left?.lens_id ?? null;
  if (!lens_id) {
    return NextResponse.json(
      { error: "Order missing lens_id" },
      { status: 400 },
    );
  }

  const resolvedSku = resolveDefaultSku(lens_id);
  if (!resolvedSku) {
    return NextResponse.json(
      { error: `No default SKU for lens_id ${lens_id}` },
      { status: 400 },
    );
  }

  const previousSku =
    typeof order.sku === "string" && order.sku.length > 0 ? order.sku : null;

  const skuChanged = previousSku !== null && previousSku !== resolvedSku;

  /* ---------- RX expiration ---------- */
  let targetMonths: 6 | 12;
  try {
    const remainingDays = daysUntil(rx.expires);
    targetMonths = remainingDays >= MIN_DAYS_FOR_ANNUAL ? 12 : 6;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid RX expiration" },
      { status: 400 },
    );
  }

  /* ---------- SKU duration ---------- */
  const durationMonths = SKU_BOX_DURATION_MONTHS[resolvedSku];
  if (!durationMonths) {
    return NextResponse.json(
      { error: `No duration defined for SKU ${resolvedSku}` },
      { status: 500 },
    );
  }

  const defaultPerEye = Math.ceil(targetMonths / durationMonths);
  const maxPerEye = defaultPerEye * 2;

  const storedRight =
    typeof order.right_box_count === "number" ? order.right_box_count : null;
  const storedLeft =
    typeof order.left_box_count === "number" ? order.left_box_count : null;

  const bodyRight = body?.right_box_count;
  const bodyLeft = body?.left_box_count;

  const previouslyExplicit = wasPreviouslyExplicit(order.price_reason);

  /* ---------- Final per-eye quantities ---------- */

  const finalRight = hasRight
    ? hasExplicitQty && typeof bodyRight === "number"
      ? clamp(bodyRight ?? defaultPerEye, 1, maxPerEye)
      : skuChanged
        ? defaultPerEye
        : previouslyExplicit &&
            typeof storedRight === "number" &&
            storedRight > 0
          ? clamp(storedRight, 1, maxPerEye)
          : defaultPerEye
    : null;

  const finalLeft = hasLeft
    ? hasExplicitQty && typeof bodyLeft === "number"
      ? clamp(bodyLeft ?? defaultPerEye, 1, maxPerEye)
      : skuChanged
        ? defaultPerEye
        : previouslyExplicit && typeof storedLeft === "number" && storedLeft > 0
          ? clamp(storedLeft, 1, maxPerEye)
          : defaultPerEye
    : null;

  const totalBoxes =
    (typeof finalRight === "number" ? finalRight : 0) +
    (typeof finalLeft === "number" ? finalLeft : 0);

  if (totalBoxes <= 0) {
    return NextResponse.json(
      { error: "Computed total box_count is invalid" },
      { status: 400 },
    );
  }

  /* ---------- Pricing ---------- */
  const pricing = getPrice({ sku: resolvedSku, box_count: totalBoxes });

  const price_reason =
    `cart_resolve: sku=${resolvedSku}, skuChanged=${skuChanged}, ` +
    `targetMonths=${targetMonths}, durationMonths=${durationMonths}, ` +
    `defaultPerEye=${defaultPerEye}, maxPerEye=${maxPerEye}, ` +
    `right=${finalRight ?? 0}, left=${finalLeft ?? 0}, total=${totalBoxes}, ` +
    `explicitQty=${hasExplicitQty}`;

  /* ---------- Persist ---------- */
  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      sku: resolvedSku,
      right_box_count: finalRight,
      left_box_count: finalLeft,
      box_count: totalBoxes,
      total_amount_cents: pricing.total_amount_cents,
      price_reason,
      status: "pending",
    })
    .eq("id", order.id)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    order: {
      id: order.id,
      sku: resolvedSku,
      right_box_count: finalRight,
      left_box_count: finalLeft,
      box_count: totalBoxes,
      total_amount_cents: pricing.total_amount_cents,
    },
  });
}
