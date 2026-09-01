export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createHash } from "node:crypto";
import { supabaseServer } from "../../../../lib/supabase-server";
import { POSTHOG_EVENTS } from "../../../../lib/posthog/events";
import {
  captureServerEvent,
  captureServerException,
} from "../../../../lib/posthog/server";
import {
  canAccessOrder,
  getOrderAccess,
  hasOrderAccessContext,
} from "@/lib/order-access";
import { getCheckoutAmountCents } from "@/lib/payments/checkoutAmount";
import { getTrustedSiteOrigin } from "@/lib/security/siteOrigin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const REUSABLE_STATUSES = [
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "requires_capture",
];

type CheckoutPaymentOrder = {
  id: string;
  total_amount_cents: number;
  feedback_credit_cents: number | null;
  shipping_cents: number | null;
  shipping_method: string | null;
  manufacturer: string | null;
  sku: string | null;
  payment_attempt_generation: number;
  shipping_email: string | null;
};

function verifiedCheckoutEmail(value: string | null): string {
  const email = value?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid checkout email is required before payment.");
  }
  return email;
}

function paymentResponse(
  order: CheckoutPaymentOrder,
  intent: Stripe.PaymentIntent,
) {
  return {
    clientSecret: intent.client_secret,
    payment_intent_id: intent.id,
    total_amount_cents: order.total_amount_cents,
    amount_due_cents: intent.amount,
    feedback_credit_cents: order.feedback_credit_cents ?? 0,
    shipping_cents: order.shipping_cents ?? 0,
    shipping_method: order.shipping_method ?? "standard",
    manufacturer: order.manufacturer,
    sku: order.sku,
  };
}

/* =========================
   Resolve Cart (PASS ORDER ID)
========================= */

async function resolveCartForUser(
  req: Request,
  orderId: string,
  source: "bearer" | "cookie" | "guest" | null,
) {
  const origin = getTrustedSiteOrigin();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (source === "bearer") {
    headers.Authorization = req.headers.get("authorization") ?? "";
  } else if (source === "cookie" || source === "guest") {
    headers.Cookie = req.headers.get("cookie") ?? "";
    const requestOrigin = req.headers.get("origin");
    if (requestOrigin) headers.Origin = requestOrigin;
  }

  const res = await fetch(`${origin}/api/cart/resolve`, {
    method: "POST",
    headers,
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

    orderIdForTelemetry = orderId;

    /* =========================
       3️⃣ Resolve THIS order
    ========================= */

    await resolveCartForUser(req, orderId, access.source);

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
        feedback_credit_cents,
        shipping_cents,
        shipping_method,
        manufacturer,
        sku,
        payment_intent_id,
        payment_attempt_generation,
        shipping_email
      `)
      .eq("id", orderId)
      .eq("status", "draft")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Unable to load checkout." }, { status: 500 });
    }

    if (!order) {
      return NextResponse.json(
        { error: "No draft order found." },
        { status: 400 }
      );
    }

    let amountDueCents: number;
    let receiptEmail: string;
    try {
      amountDueCents = getCheckoutAmountCents(order);
      receiptEmail = verifiedCheckoutEmail(order.shipping_email);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Order amount due must be greater than 0.",
        },
        { status: 400 }
      );
    }

    if (!canAccessOrder(access, order)) {
      return NextResponse.json(
        { error: "Order not authorized." },
        { status: 403 }
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
          if (existing.status === "succeeded") {
            return NextResponse.json(
              { error: "This order has already been paid." },
              { status: 409 },
            );
          }
          if (existing.status !== "canceled") {
            return NextResponse.json(
              { error: "The existing payment is still processing." },
              { status: 409 },
            );
          }

          const { data: advanced, error: advanceError } = await supabaseServer
            .from("orders")
            .update({
              payment_intent_id: null,
              payment_attempt_generation:
                order.payment_attempt_generation + 1,
            })
            .eq("id", order.id)
            .eq("payment_intent_id", existing.id)
            .select("payment_attempt_generation")
            .maybeSingle();

          if (advanceError || !advanced) {
            return NextResponse.json(
              { error: "Unable to advance the payment attempt." },
              { status: 409 },
            );
          }
          order.payment_attempt_generation =
            advanced.payment_attempt_generation;
          order.payment_intent_id = null;
        } else {
          const amountChanged = existing.amount !== amountDueCents;
          const receiptChanged =
            existing.receipt_email?.trim().toLowerCase() !== receiptEmail;
          if (amountChanged || receiptChanged) {
            if (amountChanged && existing.status === "requires_capture") {
              await stripe.paymentIntents.cancel(
                existing.id,
                undefined,
                {
                  idempotencyKey:
                    `legacy:${order.id}:cancel:${existing.id}`,
                },
              );
              const { data: advanced, error: advanceError } =
                await supabaseServer
                .from("orders")
                .update({
                  payment_intent_id: null,
                  payment_attempt_generation:
                    order.payment_attempt_generation + 1,
                })
                .eq("id", order.id)
                .eq("payment_intent_id", existing.id)
                .select("payment_attempt_generation")
                .maybeSingle();

              if (advanceError || !advanced) {
                return NextResponse.json(
                  { error: "Unable to advance the payment attempt." },
                  { status: 409 },
                );
              }
              order.payment_attempt_generation =
                advanced.payment_attempt_generation;
              order.payment_intent_id = null;
            } else {
              const updated = await stripe.paymentIntents.update(
                order.payment_intent_id,
                {
                  ...(amountChanged ? { amount: amountDueCents } : {}),
                  receipt_email: receiptEmail,
                  metadata: {
                    order_id: order.id,
                    user_id: access.userId ?? "",
                    checkout_actor: access.userId ? "user" : "guest",
                    shipping_method: order.shipping_method ?? "standard",
                    shipping_cents: String(order.shipping_cents ?? 0),
                    feedback_credit_cents: String(
                      order.feedback_credit_cents ?? 0,
                    ),
                    amount_due_cents: String(amountDueCents),
                  },
                },
                {
                  idempotencyKey:
                    `legacy:${order.id}:update:${existing.id}:${amountDueCents}:` +
                    createHash("sha256")
                      .update(receiptEmail)
                      .digest("hex")
                      .slice(0, 24),
                },
              );

              return NextResponse.json(paymentResponse(order, updated));
            }
          } else {
            return NextResponse.json(paymentResponse(order, existing));
          }
        }
      } catch {
        return NextResponse.json(
          { error: "Unable to verify the existing payment right now." },
          { status: 503 },
        );
      }
    }

    /* =========================
       6️⃣ Create PaymentIntent
    ========================= */

    const intent = await stripe.paymentIntents.create(
      {
        amount: amountDueCents,
        currency: "usd",
        capture_method: "manual",
        automatic_payment_methods: { enabled: true },
        receipt_email: receiptEmail,
        metadata: {
          order_id: order.id,
          user_id: access.userId ?? "",
          checkout_actor: access.userId ? "user" : "guest",
          shipping_method: order.shipping_method ?? "standard",
          shipping_cents: String(order.shipping_cents ?? 0),
          feedback_credit_cents: String(order.feedback_credit_cents ?? 0),
          amount_due_cents: String(amountDueCents),
          payment_attempt_generation: String(
            order.payment_attempt_generation,
          ),
        },
      },
      {
        idempotencyKey:
          `legacy:${order.id}:create:${order.payment_attempt_generation}`,
      },
    );

    if (!intent.client_secret) {
      return NextResponse.json(
        { error: "Stripe intent missing client secret." },
        { status: 400 }
      );
    }

    /* =========================
       7️⃣ Save PaymentIntent
    ========================= */

    // PaymentIntent creation is not payment authorization; keep status draft
    // until /api/checkout/authorized confirms Stripe reached requires_capture.
    const { error: updateError } = await supabaseServer
      .from("orders")
      .update({
        payment_intent_id: intent.id,
      })
      .eq("id", order.id)
      .eq("status", "draft");

    if (updateError) {
      return NextResponse.json(
        { error: "Unable to save payment initialization." },
        { status: 500 }
      );
    }

    await captureServerEvent({
      event: POSTHOG_EVENTS.PAYMENT_INTENT_CREATED,
      distinctId: access.distinctId,
      request: req,
      properties: {
        order_id: order.id,
        order_value_cents: order.total_amount_cents,
        amount_due_cents: amountDueCents,
        feedback_credit_cents: order.feedback_credit_cents ?? 0,
        shipping_cents: order.shipping_cents ?? null,
        shipping_method: order.shipping_method ?? "standard",
        has_payment_intent: true,
        stripe_intent_status: intent.status,
      },
    });

    return NextResponse.json(paymentResponse(order, intent));

  } catch (err) {
    console.error("CHECKOUT ERROR:", err);
    await captureServerException({
      event: POSTHOG_EVENTS.API_ROUTE_FAILED,
      error: err,
      distinctId: userId,
      request: req,
      properties: {
        route: "/api/checkout/pay",
        order_id: orderIdForTelemetry,
      },
    });

    return NextResponse.json(
      { error: "Checkout initialization failed." },
      { status: 500 }
    );
  }
}
