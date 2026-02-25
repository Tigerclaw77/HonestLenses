export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";
import { resolveDefaultSku } from "../../../../../lib/pricing/resolveDefaultSku";
import { lenses } from "../../../../../data/lenses";
import { getColorOptions } from "../../../../../data/lensColors";

/* =========================
   Types
========================= */

type EyeRx = {
  lens_id: string;
  sphere: number;
  cylinder?: number;
  axis?: number;
  add?: string;
  base_curve?: number;
  color?: string;
};

type RxMeta = {
  patient_name?: string;
  prescriber_name?: string;
  prescriber_phone?: string;
};

type RxData = {
  expires: string;
  right?: EyeRx;
  left?: EyeRx;
} & RxMeta;

/* =========================
   Helpers
========================= */

function sanitizeEyeRx(eye: EyeRx | undefined): EyeRx | undefined {
  if (!eye) return undefined;

  const lens = lenses.find((l) => l.lens_id === eye.lens_id);
  if (!lens) return eye;

  const allowedColors = getColorOptions(lens.name);

  const clean: EyeRx = { ...eye };

  // Strip invalid color
  if (!allowedColors.length) {
    delete clean.color;
  } else if (clean.color && !allowedColors.includes(clean.color)) {
    delete clean.color;
  }

  return clean;
}

function isVerifiedLike(v: unknown): boolean {
  if (typeof v !== "string") return false;
  return (
    v === "verified" ||
    v === "ocr_verified" ||
    v === "uploaded" ||
    v === "upload_verified"
  );
}

/* =========================
   POST /api/orders/:id/rx
   RESPONSIBILITY:
   - Validate RX
   - Resolve SKU from RX
   - Persist RX + SKU ONLY
   - Persist OCR metadata (if present)
   - ✅ Set verification_status appropriately (manual=pending, upload/ocr=verified)
   - ❌ NO PRICING
   - ❌ NO BOX COUNTS
========================= */

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  /* =========================
     0️⃣ Params
  ========================= */
  const { id: orderId } = await context.params;
  console.log("🟣 [RX] ROUTE HIT", { orderId });

  /* =========================
     1️⃣ Auth
  ========================= */
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  /* =========================
     2️⃣ Parse RX payload
  ========================= */
  let rx: RxData;
  try {
    rx = (await req.json()) as RxData;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  /* =========================
     3️⃣ Extract & sanitize OCR metadata
  ========================= */

  const patient_name =
    typeof rx.patient_name === "string" ? rx.patient_name.trim() : null;

  const prescriber_name =
    typeof rx.prescriber_name === "string" ? rx.prescriber_name.trim() : null;

  const prescriber_phone =
    typeof rx.prescriber_phone === "string" ? rx.prescriber_phone.trim() : null;

  /* =========================
     4️⃣ Extract lens_id (AUTHORITATIVE)
  ========================= */
  const lens_id = rx?.right?.lens_id ?? rx?.left?.lens_id ?? null;

  if (!lens_id) {
    return NextResponse.json({ error: "RX missing lens_id" }, { status: 400 });
  }

  /* =========================
     5️⃣ Resolve SKU (RX → SKU)
  ========================= */
  const sku = resolveDefaultSku(lens_id);

  if (!sku) {
    return NextResponse.json(
      { error: `No default SKU configured for lens_id ${lens_id}` },
      { status: 400 },
    );
  }

  /* =========================
     6️⃣ Verify order ownership (and read source)
  ========================= */
  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("id, status, verification_status, rx_source, rx_upload_path")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();

  if (orderError || !order) {
    return NextResponse.json(
      { error: "Order not found or not owned by user" },
      { status: 400 },
    );
  }

  if (!["draft", "pending", "authorized"].includes(order.status)) {
    return NextResponse.json({ error: "Order is not editable" }, { status: 400 });
  }

  /* =========================
     7️⃣ Sanitize RX (SERVER AUTHORITATIVE)
  ========================= */
  const sanitizedRx = {
    expires: rx.expires,
    right: sanitizeEyeRx(rx.right),
    left: sanitizeEyeRx(rx.left),
  };

  /* =========================
     8️⃣ Determine verification_status (critical fix)
     - If order was created from upload/OCR, treat as verified so UI bypasses
     - Never downgrade a verified order to pending
  ========================= */

  const existingVs = order.verification_status;

  const isUploadOrOcrOrder =
    order.rx_source === "upload" ||
    order.rx_source === "ocr" ||
    Boolean(order.rx_upload_path);

  // If already verified-like, keep it.
  // Else if upload/ocr, set to verified.
  // Else manual => pending.
  const nextVerificationStatus = isVerifiedLike(existingVs)
    ? existingVs
    : isUploadOrOcrOrder
      ? "verified"
      : "pending";

  /* =========================
     9️⃣ Persist RX + SKU + META
     - ✅ Do NOT force status to draft
  ========================= */
  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      rx: sanitizedRx,
      sku,
      verification_status: nextVerificationStatus,

      // OCR metadata (null for manual entry)
      patient_name,
      prescriber_name,
      prescriber_phone,
    })
    .eq("id", orderId)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    orderId,
    sku,
    verification_status: nextVerificationStatus,
  });
}