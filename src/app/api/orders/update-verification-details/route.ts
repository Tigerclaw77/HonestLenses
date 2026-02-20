export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getUserFromRequest } from "@/lib/get-user-from-request";

type UpdatePayload = {
  orderId: string;

  patient_first_name: string;
  patient_middle_name?: string;
  patient_last_name: string;
  patient_dob: string;

  patient_address1: string;
  patient_address2?: string;
  patient_city: string;
  patient_state: string;
  patient_zip: string;

  prescriber_name?: string;
  prescriber_practice?: string;
  prescriber_phone?: string;
  prescriber_fax?: string;
  prescriber_email?: string;
  prescriber_city?: string;
  prescriber_state?: string;
};

function isNonEmpty(s: unknown): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

export async function POST(req: Request) {
  try {
    /* =========================
       1️⃣ Auth
    ========================= */
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    /* =========================
       2️⃣ Parse Body
    ========================= */
    const body = (await req.json()) as Partial<UpdatePayload>;

    if (!body.orderId) {
      return NextResponse.json(
        { error: "Missing order ID" },
        { status: 400 }
      );
    }

    /* =========================
       3️⃣ Load Order (Must Be Pending)
    ========================= */
    const { data: order, error: orderError } = await supabaseServer
      .from("orders")
      .select("id, user_id, status")
      .eq("id", body.orderId)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "Order not found or not eligible for update" },
        { status: 400 }
      );
    }

    /* =========================
       4️⃣ Validation
    ========================= */

    if (!isNonEmpty(body.patient_first_name))
      return NextResponse.json({ error: "Missing first name" }, { status: 400 });

    if (!isNonEmpty(body.patient_last_name))
      return NextResponse.json({ error: "Missing last name" }, { status: 400 });

    if (!isNonEmpty(body.patient_dob))
      return NextResponse.json({ error: "Missing date of birth" }, { status: 400 });

    if (!isNonEmpty(body.patient_address1) ||
        !isNonEmpty(body.patient_city) ||
        !isNonEmpty(body.patient_state) ||
        !isNonEmpty(body.patient_zip)) {
      return NextResponse.json(
        { error: "Missing required address fields" },
        { status: 400 }
      );
    }

    const hasName = isNonEmpty(body.prescriber_name);
    const hasPractice = isNonEmpty(body.prescriber_practice);

    if (!hasName && !hasPractice) {
      return NextResponse.json(
        { error: "Doctor name or practice name required" },
        { status: 400 }
      );
    }

    /* =========================
       5️⃣ Update Order Fields
    ========================= */
    const { error: updateError } = await supabaseServer
      .from("orders")
      .update({
        patient_first_name: body.patient_first_name.trim(),
        patient_middle_name: body.patient_middle_name?.trim() || null,
        patient_last_name: body.patient_last_name.trim(),
        patient_dob: body.patient_dob,

        patient_address_line1: body.patient_address1.trim(),
        patient_address_line2: body.patient_address2?.trim() || null,
        patient_city: body.patient_city.trim(),
        patient_state: body.patient_state.trim(),
        patient_zip: body.patient_zip.trim(),

        prescriber_name: body.prescriber_name?.trim() || null,
        prescriber_practice: body.prescriber_practice?.trim() || null,
        prescriber_phone: body.prescriber_phone?.trim() || null,
        prescriber_fax: body.prescriber_fax?.trim() || null,
        prescriber_email: body.prescriber_email?.trim() || null,
        prescriber_city: body.prescriber_city?.trim() || null,
        prescriber_state: body.prescriber_state?.trim() || null,
      })
      .eq("id", order.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });

  } catch (err: unknown) {
    if (err instanceof Error) {
      return NextResponse.json(
        { error: err.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
