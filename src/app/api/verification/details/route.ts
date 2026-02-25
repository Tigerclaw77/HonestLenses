export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../lib/get-user-from-request";

type Body = {
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

  allow_lower_price_adjustment: boolean;
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    /* =========================
       2️⃣ Parse body
    ========================= */
    const raw = (await req.json().catch(() => null)) as unknown;
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const body = raw as Partial<Body>;

    /* =========================
       3️⃣ Validate required fields
    ========================= */

    const required: Array<keyof Body> = [
      "patient_first_name",
      "patient_last_name",
      "patient_dob",
      "patient_address1",
      "patient_city",
      "patient_state",
      "patient_zip",
      "allow_lower_price_adjustment",
    ];

    for (const key of required) {
      const val = body[key];

      if (key === "allow_lower_price_adjustment") {
        if (typeof val !== "boolean") {
          return NextResponse.json(
            { error: "Invalid allow_lower_price_adjustment" },
            { status: 400 }
          );
        }
        continue;
      }

      if (!isNonEmpty(val)) {
        return NextResponse.json(
          { error: `Missing ${String(key)}` },
          { status: 400 }
        );
      }
    }

    /* =========================
       4️⃣ Require doctor name OR practice
    ========================= */

    const hasName = isNonEmpty(body.prescriber_name);
    const hasPractice = isNonEmpty(body.prescriber_practice);

    if (!hasName && !hasPractice) {
      return NextResponse.json(
        { error: "Doctor name or practice name required" },
        { status: 400 }
      );
    }

    /* =========================
       5️⃣ Find latest AUTHORIZED order
       (pending no longer used in payment lifecycle)
    ========================= */

    const { data: order, error: orderError } = await supabaseServer
      .from("orders")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("status", "authorized")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "No authorized order found" },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();

    /* =========================
       6️⃣ Persist verification details
    ========================= */

    const { error: updateError } = await supabaseServer
      .from("orders")
      .update({
        patient_first_name: body.patient_first_name!.trim(),
        patient_middle_name:
          (body.patient_middle_name || "").trim() || null,
        patient_last_name: body.patient_last_name!.trim(),
        patient_dob: body.patient_dob,

        patient_address_line1: body.patient_address1!.trim(),
        patient_address_line2:
          (body.patient_address2 || "").trim() || null,
        patient_city: body.patient_city!.trim(),
        patient_state: body.patient_state!.trim(),
        patient_zip: body.patient_zip!.trim(),

        prescriber_name:
          (body.prescriber_name || "").trim() || null,
        prescriber_practice:
          (body.prescriber_practice || "").trim() || null,
        prescriber_phone:
          (body.prescriber_phone || "").trim() || null,
        prescriber_fax:
          (body.prescriber_fax || "").trim() || null,
        prescriber_email:
          (body.prescriber_email || "").trim() || null,
        prescriber_city:
          (body.prescriber_city || "").trim() || null,
        prescriber_state:
          (body.prescriber_state || "").trim() || null,

        allow_lower_price_adjustment:
          body.allow_lower_price_adjustment,

        verification_details_submitted_at: nowIso,
      })
      .eq("id", order.id)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    /* =========================
       7️⃣ Trigger verification email
    ========================= */

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL?.startsWith("http")
        ? process.env.VERCEL_URL
        : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");

    const sendRes = await fetch(`${baseUrl}/api/verification/send`, {
      method: "POST",
      headers: {
        Authorization: req.headers.get("authorization") || "",
      },
      cache: "no-store",
    });

    const sendBody = await sendRes.json().catch(() => ({}));

    if (!sendRes.ok) {
      return NextResponse.json(
        { error: sendBody?.error || "Verification send failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      passive_deadline_at: sendBody?.passive_deadline_at,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Unexpected server error",
      },
      { status: 500 }
    );
  }
}