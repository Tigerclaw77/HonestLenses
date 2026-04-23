export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { Resend } from "resend";
import { sendEmail } from "../../../../lib/email";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../lib/get-user-from-request";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const resend = new Resend(process.env.RESEND_API_KEY!);

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getString(o: UnknownRecord, key: string): string | null {
  const v = o[key];
  return typeof v === "string" ? v : null;
}

/* =========================
   MAIN HANDLER
========================= */

export async function POST(req: Request) {
  /* =========================
     1️⃣ Auth
  ========================= */

  const user = await getUserFromRequest(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  /* =========================
     2️⃣ Load Draft Order
  ========================= */

  const { data: orderRaw, error } = await supabaseServer
    .from("orders")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!orderRaw || !isRecord(orderRaw)) {
    return NextResponse.json({ error: "No draft order" }, { status: 400 });
  }

  const orderId = getString(orderRaw, "id");
  const paymentIntentId = getString(orderRaw, "payment_intent_id");

  if (!orderId) {
    return NextResponse.json({ error: "Order missing id" }, { status: 500 });
  }

  if (!paymentIntentId) {
    return NextResponse.json(
      { error: "Missing Stripe PaymentIntent" },
      { status: 400 },
    );
  }

  /* =========================
     3️⃣ Verify Stripe Authorization
  ========================= */

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

  const metaOrderId =
    typeof intent.metadata?.order_id === "string"
      ? intent.metadata.order_id
      : null;

  if (metaOrderId && metaOrderId !== orderId) {
    return NextResponse.json(
      { error: "PaymentIntent does not match this order" },
      { status: 400 },
    );
  }

  if (intent.status !== "requires_capture") {
    return NextResponse.json(
      { error: `Payment not authorized (status: ${intent.status})` },
      { status: 400 },
    );
  }

  /* =========================
     4️⃣ Determine Upload Truth (FIXED)
  ========================= */

  const isUploaded = !!orderRaw.rx_upload_path;

  console.log("UPLOAD CHECK", {
    orderId,
    rx_upload_path: orderRaw.rx_upload_path,
    isUploaded,
  });

  /* =========================
     5️⃣ Capture if Upload Flow
  ========================= */

  if (isUploaded && intent.status === "requires_capture") {
    try {
      const capturedIntent = await stripe.paymentIntents.capture(intent.id);

      console.log("Stripe capture success", {
        orderId,
        paymentIntentId: capturedIntent.id,
        status: capturedIntent.status,
        amount: capturedIntent.amount_received,
      });
    } catch (err) {
      console.error("Stripe capture failed", {
        orderId,
        paymentIntentId,
        error: err,
      });
    }
  }

  /* =========================
     6️⃣ Update Order
  ========================= */

  const updatePayload: Record<string, unknown> = {
    status: isUploaded ? "captured" : "authorized",
    verification_status: isUploaded ? "auto_verified" : "pending",
  };

  const { error: updateError } = await supabaseServer
    .from("orders")
    .update(updatePayload)
    .eq("id", orderId)
    .eq("user_id", user.id)
    .eq("status", "draft")
    .select("id");

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  /* =========================
     7️⃣ Email Admin
  ========================= */

  try {
    const total =
      typeof orderRaw.total_amount_cents === "number"
        ? `$${(orderRaw.total_amount_cents / 100).toFixed(2)}`
        : "Unknown";

    const prescriber =
      typeof orderRaw.prescriber_name === "string"
        ? orderRaw.prescriber_name
        : "Not provided";

    const prescriberPhone =
      typeof orderRaw.prescriber_phone === "string"
        ? orderRaw.prescriber_phone
        : "Not provided";

    const rx = isRecord(orderRaw.rx) ? orderRaw.rx : null;

    const left = isRecord(rx?.left) ? rx.left : null;
    const right = isRecord(rx?.right) ? rx.right : null;

    await resend.emails.send({
      from: "Honest Lenses <orders@honestlenses.com>",
      to: "pauldriggers@aol.com",
      subject: `New Honest Lenses Order ${orderId}`,
      html: `
        <h2>New Order Authorized</h2>

        <p><strong>Order ID:</strong> ${orderId}</p>
        <p><strong>User ID:</strong> ${user.id}</p>
        <p><strong>Total:</strong> ${total}</p>

        <hr/>

        <h3>Prescription</h3>

        <p><strong>Left:</strong>
        ${left?.sphere ?? "?"} /
        BC ${left?.base_curve ?? "?"}
        (${left?.coreId ?? ""})
        </p>

        <p><strong>Right:</strong>
        ${right?.sphere ?? "?"} /
        BC ${right?.base_curve ?? "?"}
        (${right?.coreId ?? ""})
        </p>

        <p><strong>Expires:</strong> ${rx?.expires ?? "Unknown"}</p>

        <hr/>

        <h3>Doctor</h3>

        <p><strong>Name:</strong> ${prescriber}</p>
        <p><strong>Phone:</strong> ${prescriberPhone}</p>

        <hr/>

        <p><strong>Mode:</strong>
        ${isUploaded ? "Upload (Verified)" : "Passive (Verification Pending)"}
        </p>

        <p><strong>Stripe Intent:</strong> ${paymentIntentId}</p>
      `,
    });
  } catch (err) {
    console.error("Order alert email failed:", err);
  }

  /* =========================
     8️⃣ Email Customer
  ========================= */

  if (user.email) {
    try {
      await sendEmail({
        to: user.email,
        subject: "Order received — Honest Lenses",
        html: `
        <h2>Thank you for your order</h2>

        <p>Your order has been received and is now being processed.</p>

        <p><strong>Order ID:</strong> ${orderId}</p>

        <p>
        ${
          isUploaded
            ? "Your prescription has been received and verified. Your order is moving into fulfillment."
            : "We will contact your doctor to verify your prescription before shipping."
        }
        </p>

        <p>
            View your order:
            <a href="https://www.honestlenses.com/order/${orderId}">
              View Order
            </a>
        </p>

        <p>You’ll receive updates as your order progresses.</p>

        <p>— Honest Lenses</p>
      `,
      });
    } catch (err) {
      console.error("Customer confirmation email failed:", err);
    }
  }

  /* =========================
     9️⃣ Return Next Step
  ========================= */

  return NextResponse.json({
    ok: true,
    orderId,
    next: isUploaded ? "success" : "verification-details",
    mode: isUploaded ? "uploaded" : "passive",
  });
}
