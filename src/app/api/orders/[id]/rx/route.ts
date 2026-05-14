export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../../lib/get-user-from-request";
import { resolveDefaultSku } from "../../../../../lib/pricing/resolveDefaultSku";
import {
  lenses,
  resolveLensRxState,
  resolveParameterOption,
  validate as validateLensParams,
} from "@/LensCore";
import { getColorOptions } from "../../../../../data/lensColors";

/* =========================
   Types
========================= */

type VerificationStatus =
  | "auto_verified"
  | "flagged"
  | "requires_review"
  | "verified"
  | "pending";

type EyeRx = {
  coreId: string | null;
  sphere: number;
  cylinder?: number;
  axis?: number;
  add?: string;
  base_curve?: number;
  diameter?: number;
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
  verification_status?: VerificationStatus;
} & RxMeta;

/* =========================
   Helpers
========================= */

type SanitizedEyeResult = {
  eye?: EyeRx;
  errors: string[];
};

function applyResolvedParameters(
  eye: EyeRx,
  lens: (typeof lenses)[number],
): EyeRx {
  const clean: EyeRx = { ...eye };
  const resolved = resolveLensRxState(lens, {
    sphere: clean.sphere,
    cylinder: clean.cylinder ?? null,
    axis: clean.axis ?? null,
    add: clean.add ?? null,
    baseCurve: clean.base_curve ?? null,
    diameter: clean.diameter ?? null,
  });

  if (resolved.baseCurve.value != null) clean.base_curve = resolved.baseCurve.value;
  if (resolved.diameter.value != null) clean.diameter = resolved.diameter.value;

  if (lens.type.toric) {
    if (resolved.cylinder.value != null) clean.cylinder = resolved.cylinder.value;
    if (resolved.axis.value != null) clean.axis = resolved.axis.value;
  }

  if (lens.type.multifocal && resolved.add.value != null) {
    clean.add = resolved.add.value;
  }

  return clean;
}

function sanitizeAndValidateEyeRx(
  eye: EyeRx | undefined,
): SanitizedEyeResult {
  if (!eye) return { errors: [] };

  if (!eye.coreId) return { eye, errors: [] };

  const lens = lenses.find((l) => l.coreId === eye.coreId);
  if (!lens) {
    return {
      eye,
      errors: [`Lens not found for coreId ${eye.coreId}.`],
    };
  }

  const allowedColors = getColorOptions(lens.displayName);
  const clean = applyResolvedParameters(eye, lens);
  const errors: string[] = [];
  const colorState = resolveParameterOption(clean.color ?? null, allowedColors);

  if (!allowedColors.length) {
    delete clean.color;
  } else if (colorState.required) {
    errors.push("Color is required for this lens.");
  } else if (colorState.invalid) {
    errors.push("Invalid color for this lens.");
  } else if (colorState.value != null) {
    clean.color = colorState.value;
  }

  const validation = validateLensParams(lens.coreId, {
    sphere: clean.sphere,
    cylinder: clean.cylinder ?? null,
    axis: clean.axis ?? null,
    add: clean.add ?? null,
    baseCurve: clean.base_curve ?? null,
    diameter: clean.diameter ?? null,
  });

  return {
    eye: clean,
    errors: [...validation.errors, ...errors],
  };
}

function isVerifiedLike(v: unknown): boolean {
  if (typeof v !== "string") return false;
  return v === "verified" || v === "ocr_verified";
}

/* =========================
   POST /api/orders/:id/rx
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

  const incomingVerificationStatus: VerificationStatus | null =
    rx.verification_status ?? null;

  /* =========================
     3️⃣ Extract metadata
  ========================= */

  const patient_name =
    typeof rx.patient_name === "string" ? rx.patient_name.trim() : null;

  const prescriber_name =
    typeof rx.prescriber_name === "string" ? rx.prescriber_name.trim() : null;

  const prescriber_phone =
    typeof rx.prescriber_phone === "string" ? rx.prescriber_phone.trim() : null;

  /* =========================
     4️⃣ Extract coreId
  ========================= */

  const coreId = rx?.right?.coreId ?? rx?.left?.coreId ?? null;

  // 🔥 FIX: allow null ONLY for requires_review
  if (!coreId && incomingVerificationStatus !== "requires_review") {
    return NextResponse.json({ error: "RX missing coreId" }, { status: 400 });
  }

  /* =========================
     5️⃣ Resolve SKU (if applicable)
  ========================= */

  let sku: string | null = null;

  if (coreId) {
    sku = resolveDefaultSku(coreId);

    if (!sku) {
      return NextResponse.json(
        { error: `No default SKU configured for coreId ${coreId}` },
        { status: 400 },
      );
    }
  }

  /* =========================
     6️⃣ Verify order ownership
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
    return NextResponse.json(
      { error: "Order is not editable" },
      { status: 400 },
    );
  }

  /* =========================
     7️⃣ Sanitize RX
  ========================= */

  const rightResult = sanitizeAndValidateEyeRx(rx.right);
  const leftResult = sanitizeAndValidateEyeRx(rx.left);
  const validationErrors = [...rightResult.errors, ...leftResult.errors];

  if (validationErrors.length > 0) {
    return NextResponse.json(
      { error: "Invalid prescription parameters.", details: validationErrors },
      { status: 400 },
    );
  }

  const sanitizedRx = {
    expires: rx.expires,
    right: rightResult.eye,
    left: leftResult.eye,
  };

  /* =========================
     8️⃣ FINAL VERIFICATION STATUS
  ========================= */

  const existingVs = order.verification_status;

  const isUploadOrOcrOrder =
    order.rx_source === "upload" ||
    order.rx_source === "ocr" ||
    Boolean(order.rx_upload_path);

  let nextVerificationStatus: VerificationStatus;

  // ✅ TRUST FRONTEND IF PROVIDED
  if (
    incomingVerificationStatus === "auto_verified" ||
    incomingVerificationStatus === "flagged" ||
    incomingVerificationStatus === "requires_review"
  ) {
    nextVerificationStatus = incomingVerificationStatus;
  }

  // fallback logic
  else if (isVerifiedLike(existingVs)) {
    nextVerificationStatus = existingVs as VerificationStatus;
  } else if (isUploadOrOcrOrder) {
    nextVerificationStatus = "verified";
  } else {
    nextVerificationStatus = "pending";
  }

  /* =========================
     9️⃣ Persist
  ========================= */

  const { error: updateError } = await supabaseServer
    .from("orders")
    .update({
      rx: sanitizedRx,
      sku,
      verification_status: nextVerificationStatus,
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
