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

async function resolveCartForUser(req: Request) {
  try {
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      new URL(req.url).origin;

    await fetch(`${origin}/api/cart/resolve`, {
      method: "POST",
      headers: {
        Authorization: req.headers.get("Authorization") ?? "",
      },
      cache: "no-store",
    });
  } catch {
    // Do not fail checkout if resolve attempt errors
  }
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
       2️⃣ Force Cart Resolution
    ========================= */

    await resolveCartForUser(req);

    /* =========================
       3️⃣ Load Draft Order
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
      .eq("user_id", user.id)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

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
       4️⃣ Handle Existing PaymentIntent
    ========================= */

    if (order.payment_intent_id) {
      try {
        const existing = await stripe.paymentIntents.retrieve(
          order.payment_intent_id
        );

        if (!existing || !existing.id) {
          throw new Error("Stripe intent not found");
        }

        // If intent not reusable → cancel
        if (!REUSABLE_STATUSES.includes(existing.status)) {
          try {
            await stripe.paymentIntents.cancel(order.payment_intent_id);
          } catch {
            // ignore cancel failure
          }

          await supabaseServer
            .from("orders")
            .update({ payment_intent_id: null })
            .eq("id", order.id)
            .eq("user_id", user.id);

        } else {
          /* ---------- Sync Amount ---------- */

          if (existing.amount !== order.total_amount_cents) {
            const updated = await stripe.paymentIntents.update(
              order.payment_intent_id,
              {
                amount: order.total_amount_cents,
              }
            );

            if (!updated.client_secret) {
              return NextResponse.json(
                { error: "Stripe intent missing client secret." },
                { status: 400 }
              );
            }

            return NextResponse.json({
              clientSecret: updated.client_secret,
            });
          }

          if (!existing.client_secret) {
            return NextResponse.json(
              { error: "Stripe intent missing client secret." },
              { status: 400 }
            );
          }

          return NextResponse.json({
            clientSecret: existing.client_secret,
          });
        }
      } catch {
        // Stripe intent invalid → reset
        await supabaseServer
          .from("orders")
          .update({ payment_intent_id: null })
          .eq("id", order.id)
          .eq("user_id", user.id);
      }
    }

    /* =========================
       5️⃣ Create Fresh PaymentIntent
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
       6️⃣ Persist PaymentIntent
    ========================= */

    const { error: updateError } = await supabaseServer
      .from("orders")
      .update({
        payment_intent_id: intent.id,
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

  } catch {
    return NextResponse.json(
      { error: "Checkout initialization failed." },
      { status: 500 }
    );
  }
}