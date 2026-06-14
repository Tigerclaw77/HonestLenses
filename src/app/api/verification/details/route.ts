export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabase-server";
import { POSTHOG_EVENTS } from "../../../../lib/posthog/events";
import { captureServerException } from "../../../../lib/posthog/server";
import {
  canAccessOrder,
  getOrderAccess,
  hasOrderAccessContext,
} from "@/lib/order-access";

type Body = {
  orderId?: string;
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
  let userId: string | null = null;
  let orderIdForTelemetry: string | null = null;

  try {
    /* =========================
       1️⃣ Auth
    ========================= */
    const access = await getOrderAccess(req);
    if (!hasOrderAccessContext(access)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    userId = access.distinctId;

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
            { status: 400 },
          );
        }
        continue;
      }

      if (!isNonEmpty(val)) {
        return NextResponse.json(
          { error: `Missing ${String(key)}` },
          { status: 400 },
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
        { status: 400 },
      );
    }

    /* =========================
       5️⃣ Find latest AUTHORIZED order
       (pending no longer used in payment lifecycle)
    ========================= */

    let orderQuery = supabaseServer
      .from("orders")
      .select("id, user_id, status")
      .eq("status", "authorized")
      .order("created_at", { ascending: false });

    if (typeof body.orderId === "string" && body.orderId) {
      orderQuery = orderQuery.eq("id", body.orderId);
    } else if (access.guestOrderId) {
      orderQuery = orderQuery.eq("id", access.guestOrderId);
    } else if (access.userId) {
      orderQuery = orderQuery.eq("user_id", access.userId);
    }

    const { data: order, error: orderError } = await orderQuery
      .limit(1)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "No authorized order found" },
        { status: 400 },
      );
    }

    if (!canAccessOrder(access, order)) {
      return NextResponse.json({ error: "Order not authorized" }, { status: 403 });
    }

    orderIdForTelemetry = order.id;
    const nowIso = new Date().toISOString();

    /* =========================
       6️⃣ Persist verification details
    ========================= */

    const { error: updateError } = await supabaseServer
      .from("orders")
      .update({
        patient_first_name: body.patient_first_name!.trim(),
        patient_middle_name: (body.patient_middle_name || "").trim() || null,
        patient_last_name: body.patient_last_name!.trim(),
        patient_dob: body.patient_dob,

        patient_address_line1: body.patient_address1!.trim(),
        patient_address_line2: (body.patient_address2 || "").trim() || null,
        patient_city: body.patient_city!.trim(),
        patient_state: body.patient_state!.trim(),
        patient_zip: body.patient_zip!.trim(),

        prescriber_name: (body.prescriber_name || "").trim() || null,
        prescriber_practice: (body.prescriber_practice || "").trim() || null,
        prescriber_phone: (body.prescriber_phone || "").trim() || null,
        prescriber_fax: (body.prescriber_fax || "").trim() || null,
        prescriber_email: (body.prescriber_email || "").trim() || null,
        prescriber_city: (body.prescriber_city || "").trim() || null,
        prescriber_state: (body.prescriber_state || "").trim() || null,

        allow_lower_price_adjustment: body.allow_lower_price_adjustment,

        verification_details_submitted_at: nowIso,
      })
      .eq("id", order.id)
      .eq("status", "authorized");

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    /* =========================
       7️⃣ Trigger verification email
    ========================= */
    const baseUrl =
      process.env.SITE_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");

    const sendRes = await fetch(`${baseUrl}/api/verification/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: req.headers.get("authorization") || "",
        Cookie: req.headers.get("cookie") || "",
      },
      body: JSON.stringify({ orderId: order.id }),
      cache: "no-store",
    });

    const sendBody = await sendRes.json().catch(() => ({}));

    if (!sendRes.ok) {
      await captureServerException({
        event: POSTHOG_EVENTS.API_ROUTE_FAILED,
        error: new Error(sendBody?.error || "Verification send failed"),
        distinctId: access.distinctId,
        request: req,
        properties: {
          route: "/api/verification/details",
          downstream_route: "/api/verification/send",
          order_id: order.id,
        },
      });

      return NextResponse.json(
        { error: sendBody?.error || "Verification send failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      passive_deadline_at: sendBody?.passive_deadline_at,
    });
  } catch (err: unknown) {
    await captureServerException({
      event: POSTHOG_EVENTS.API_ROUTE_FAILED,
      error: err,
      distinctId: userId,
      request: req,
      properties: {
        route: "/api/verification/details",
        order_id: orderIdForTelemetry,
      },
    });

    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unexpected server error",
      },
      { status: 500 },
    );
  }
}
