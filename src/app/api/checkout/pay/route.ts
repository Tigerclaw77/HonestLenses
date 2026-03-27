export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "../../../../lib/supabase-server";
import { getUserFromRequest } from "../../../../lib/get-user-from-request";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const REUSABLE_STATUSES = [
  "requires_payment_method",
  "requires_confirmation",
  "requires_capture",
];

/* =========================
   Resolve Cart (PASS ORDER ID)
========================= */

async function resolveCartForUser(req: Request, orderId: string) {
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(req.url).origin;

  const res = await fetch(`${origin}/api/cart/resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: req.headers.get("Authorization") ?? "",
      Cookie: req.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({ order_id: orderId }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("RESOLVE FAILED:", text);
    throw new Error("Cart resolve failed");
  }
}

/* =========================
   POST /api/checkout/pay
========================= */

export async function POST(req: Request) {
  try {
    /* =========================
       1️⃣ Auth
    ========================= */

    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("CHECKOUT USER ID:", user.id);

    /* =========================
       2️⃣ Parse body (GET order_id)
    ========================= */

    const body = await req.json().catch(() => null);
    const orderId = body?.orderId ?? body?.order_id ?? null;

    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json(
        { error: "Missing orderId" },
        { status: 400 }
      );
    }

    console.log("CHECKOUT ORDER ID:", orderId);

    /* =========================
       3️⃣ Resolve THIS order
    ========================= */

    await resolveCartForUser(req, orderId);

    /* =========================
       4️⃣ Load EXACT order (NO GUESSING)
    ========================= */

    const { data: order, error } = await supabaseServer
      .from("orders")
      .select(`
        id,
        user_id,
        status,
        total_amount_cents,
        payment_intent_id
      `)
      .eq("id", orderId)
      .eq("user_id", user.id)
      .eq("status", "draft")
      .maybeSingle();

    console.log("ORDER FOUND:", order, error);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!order) {
      return NextResponse.json(
        { error: "No draft order found." },
        { status: 400 }
      );
    }

    if (
      typeof order.total_amount_cents !== "number" ||
      order.total_amount_cents <= 0
    ) {
      return NextResponse.json(
        { error: "Order missing valid price." },
        { status: 400 }
      );
    }

    /* =========================
       5️⃣ Existing PaymentIntent
    ========================= */

    if (order.payment_intent_id) {
      try {
        const existing = await stripe.paymentIntents.retrieve(
          order.payment_intent_id
        );

        if (!existing || !existing.id) {
          throw new Error("Stripe intent not found");
        }

        if (!REUSABLE_STATUSES.includes(existing.status)) {
          try {
            await stripe.paymentIntents.cancel(order.payment_intent_id);
          } catch (err) {
            console.warn("Cancel failed:", err);
          }

          await supabaseServer
            .from("orders")
            .update({ payment_intent_id: null })
            .eq("id", order.id)
            .eq("user_id", user.id);

        } else {
          if (existing.amount !== order.total_amount_cents) {
            const updated = await stripe.paymentIntents.update(
              order.payment_intent_id,
              {
                amount: order.total_amount_cents,
              }
            );

            return NextResponse.json({
              clientSecret: updated.client_secret,
            });
          }

          return NextResponse.json({
            clientSecret: existing.client_secret,
          });
        }
      } catch (err) {
        console.warn("Existing intent invalid → resetting:", err);

        await supabaseServer
          .from("orders")
          .update({ payment_intent_id: null })
          .eq("id", order.id)
          .eq("user_id", user.id);
      }
    }

    /* =========================
       6️⃣ Create PaymentIntent
    ========================= */

    const intent = await stripe.paymentIntents.create({
      amount: order.total_amount_cents,
      currency: "usd",
      capture_method: "manual",
      automatic_payment_methods: { enabled: true },
      metadata: {
        order_id: order.id,
        user_id: user.id,
      },
    });

    if (!intent.client_secret) {
      return NextResponse.json(
        { error: "Stripe intent missing client secret." },
        { status: 400 }
      );
    }

    /* =========================
       7️⃣ Save PaymentIntent
    ========================= */

    const { error: updateError } = await supabaseServer
      .from("orders")
      .update({
        payment_intent_id: intent.id,
        status: "authorized",
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
      clientSecret: intent.client_secret,
    });

  } catch (err) {
    console.error("CHECKOUT ERROR:", err);

    return NextResponse.json(
      { error: "Checkout initialization failed." },
      { status: 500 }
    );
  }
}