"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import type { StripePaymentElementOptions } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import AbandonmentFeedbackExperiment from "@/components/AbandonmentFeedbackExperiment";
import { supabase } from "@/lib/supabase-client";
import {
  POSTHOG_EVENTS,
  captureClientException,
  consumeStepDurationMs,
  getStepDurationMs,
  incrementRetryCount,
  markStepStart,
  track,
} from "@/lib/posthog/client";
import {
  getFeedbackAmountDueCents,
  normalizeFeedbackCreditCents,
} from "@/lib/abandonmentFeedback";
import {
  getCheckoutRecoveryPath,
  getCurrentOrderRecovery,
  isOrderId,
} from "@/lib/orderRecoveryClient";

let stripePromise: ReturnType<typeof loadStripe> | null = null;

function getStripePromise() {
  stripePromise ??= loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  return stripePromise;
}

const stripeAppearance = {
  theme: "stripe",
  variables: {
    colorPrimary: "#6d28d9",
    colorText: "#0f172a",
    colorDanger: "#dc2626",
    borderRadius: "10px",
    spacingUnit: "4px",
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  },
} as const;

const paymentElementOptions: StripePaymentElementOptions = {
  business: { name: "Honest Lenses" },
  layout: {
    type: "accordion",
    defaultCollapsed: false,
    radios: true,
    spacedAccordionItems: true,
  },
  paymentMethodOrder: ["card", "link", "affirm", "cashapp", "amazon_pay"],
};

/* =========================
   Types
========================= */

type Order = {
  id: string;
  status: "draft" | "pending" | "authorized" | "captured";
  total_amount_cents: number;
  amount_due_cents: number;
  manufacturer?: string | null;
  sku?: string | null;
  shipping_method?: "standard" | "express" | null;
  shipping_cents?: number | null;
  payment_intent_id?: string | null;
  has_payment_intent: boolean;
  feedback_credit_cents?: number | null;
  feedback_credit_applied_at?: string | null;
  feedback_survey_completed_at?: string | null;
  rx?: unknown;
  rx_upload_path?: string | null;
  rx_source?: string | null;
  verification_status?: string | null;
};

type CheckoutPayResponse = {
  clientSecret?: string;
  payment_intent_id?: string;
  total_amount_cents?: number;
  amount_due_cents?: number;
  feedback_credit_cents?: number;
  shipping_cents?: number;
  shipping_method?: "standard" | "express";
  manufacturer?: string | null;
  sku?: string | null;
  code?: string;
  error?: string;
};

type AuthorizedResponse = {
  ok?: boolean;
  error?: string;
  orderId?: string;
  next?: "success" | "verification-details";
  mode?: "uploaded" | "passive" | "information_needed";
  deadline?: string;
};

type CheckoutFormProps = {
  order: Order;
  clientSecret: string;
  mode: "uploaded" | "passive";
  onQuoteChanged: (quote: CheckoutPayResponse) => void;
  onPaymentComplete: () => void;
};

/* =========================
   Helpers
========================= */

function buildRouteFromAuthorizedResponse(
  body: AuthorizedResponse,
): string | null {
  if (!body.next) return null;

  const params = new URLSearchParams();

  if (body.orderId) params.set("orderId", body.orderId);
  if (body.mode) params.set("mode", body.mode);
  if (body.deadline) params.set("deadline", body.deadline);

  const suffix = params.toString() ? `?${params}` : "";

  if (body.next === "success") return `/checkout/success${suffix}`;
  if (body.next === "verification-details")
    return `/checkout/verification-details${suffix}`;

  return null;
}

function isUploadedVerificationOrder(orderData: {
  rx_upload_path?: string | null;
  rx_source?: string | null;
}): boolean {
  return Boolean(
    orderData.rx_upload_path ||
      orderData.rx_source === "upload" ||
      orderData.rx_source === "ocr",
  );
}

/* =========================
   Checkout Form
========================= */

function CheckoutForm({
  order,
  clientSecret,
  mode,
  onQuoteChanged,
  onPaymentComplete,
}: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!stripe || !elements || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const retryCount = incrementRetryCount(`payment_submit:${order.id}`);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const quoteRes = await fetch("/api/checkout/pay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ orderId: order.id }),
      });
      const quote: CheckoutPayResponse = await quoteRes.json().catch(() => ({}));

      if (
        quote.code === "PAYMENT_ALREADY_AUTHORIZED" &&
        quote.payment_intent_id
      ) {
        router.replace(
          `/checkout/return?payment_intent=${encodeURIComponent(quote.payment_intent_id)}`,
        );
        return;
      }

      if (
        !quoteRes.ok ||
        !quote.clientSecret ||
        !quote.payment_intent_id ||
        typeof quote.amount_due_cents !== "number" ||
        typeof quote.total_amount_cents !== "number"
      ) {
        throw new Error(quote.error || "Unable to verify the checkout total.");
      }

      const quoteChanged =
        quote.amount_due_cents !== order.amount_due_cents ||
        quote.total_amount_cents !== order.total_amount_cents ||
        quote.payment_intent_id !== order.payment_intent_id ||
        quote.clientSecret !== clientSecret;

      if (quoteChanged) {
        if (quote.clientSecret === clientSecret) {
          await elements.fetchUpdates();
        }
        onQuoteChanged(quote);
        setError(
          "Your order total was refreshed. Please review the updated total and submit again.",
        );
        setSubmitting(false);
        return;
      }

      const amountDueCents = order.amount_due_cents;
      markStepStart(`payment_submit:${order.id}`);
      track(POSTHOG_EVENTS.PAYMENT_STARTED, {
        order_id: order.id,
        order_status: order.status,
        verification_mode: mode,
        order_value_cents: amountDueCents,
        total_cart_value_cents: order.total_amount_cents,
        amount_due_cents: amountDueCents,
        feedback_credit_cents: order.feedback_credit_cents ?? 0,
        shipping_cents: order.shipping_cents ?? null,
        shipping_method: order.shipping_method ?? "standard",
        manufacturer: order.manufacturer ?? null,
        sku: order.sku ?? null,
        has_payment_intent: order.has_payment_intent,
        retry_count: retryCount,
      });

      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/checkout/return`,
        },
        redirect: "if_required",
      });

      if (result.error) {
        track(POSTHOG_EVENTS.PAYMENT_FAILED, {
          order_id: order.id,
          order_status: order.status,
          verification_mode: mode,
          stage: "stripe_confirm",
          error_message: result.error.message ?? "Payment failed.",
          has_payment_intent: order.has_payment_intent,
          payment_duration_ms: consumeStepDurationMs(
            `payment_submit:${order.id}`,
          ),
          retry_count: retryCount,
        });
        setError(result.error.message || "Payment failed.");
        setSubmitting(false);
        return;
      }

      const markRes = await fetch("/api/checkout/authorized", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ orderId: order.id }),
      });

      const markBody: AuthorizedResponse = await markRes
        .json()
        .catch(() => ({}));

      const paymentDurationMs = consumeStepDurationMs(
        `payment_submit:${order.id}`,
      );

      if (!markRes.ok) {
        track(POSTHOG_EVENTS.PAYMENT_FAILED, {
          order_id: order.id,
          order_status: order.status,
          verification_mode: mode,
          stage: "authorize_order",
          error_message: markBody.error ?? "Authorization update failed.",
          has_payment_intent: order.has_payment_intent,
          payment_duration_ms: paymentDurationMs,
          retry_count: retryCount,
        });
        setError(
          markBody.error ||
            "Payment was authorized, but order finalization failed. Please contact support.",
        );
        setSubmitting(false);
        return;
      }

      onPaymentComplete();
      track(POSTHOG_EVENTS.PAYMENT_SUCCEEDED, {
        order_id: order.id,
        order_status: order.status,
        verification_mode: mode,
        order_value_cents: amountDueCents,
        total_cart_value_cents: order.total_amount_cents,
        amount_due_cents: amountDueCents,
        feedback_credit_cents: order.feedback_credit_cents ?? 0,
        shipping_cents: order.shipping_cents ?? null,
        shipping_method: order.shipping_method ?? "standard",
        manufacturer: order.manufacturer ?? null,
        sku: order.sku ?? null,
        has_payment_intent: order.has_payment_intent,
        authorization_confirmed: true,
        next_step: markBody.next ?? null,
        payment_duration_ms: paymentDurationMs,
        checkout_duration_ms: getStepDurationMs(
          `checkout_duration:${order.id}`,
        ),
        retry_count: retryCount,
      });

      const nextRoute = buildRouteFromAuthorizedResponse(markBody);

      router.replace(nextRoute || "/checkout/success");
    } catch (err: unknown) {
      captureClientException(err, {
        source: "checkout_payment_submit",
        order_id: order.id,
      });
      track(POSTHOG_EVENTS.PAYMENT_FAILED, {
        order_id: order.id,
        order_status: order.status,
        verification_mode: mode,
        stage: "unexpected",
        has_payment_intent: order.has_payment_intent,
        error_message:
          err instanceof Error ? err.message : "Unexpected checkout error.",
        payment_duration_ms: consumeStepDurationMs(
          `payment_submit:${order.id}`,
        ),
      });
      setError(
        err instanceof Error ? err.message : "Unexpected checkout error.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div
        style={{
          background: "#ffffff",
          padding: 24,
          borderRadius: 12,
        }}
      >
        <PaymentElement options={paymentElementOptions} />
        <div
          aria-label="Payments powered by Stripe"
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: 18,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              minHeight: 30,
              padding: "5px 10px",
              border: "1px solid #d8dee9",
              borderRadius: 6,
              background: "#ffffff",
              color: "#475569",
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1,
            }}
          >
            Powered by{" "}
            <span style={{ color: "#635bff", fontWeight: 800 }}>Stripe</span>
          </span>
        </div>
      </div>

      {error && (
        <p
          style={{
            marginTop: 12,
            color: "#dc2626",
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          {error}
        </p>
      )}

      <button
        disabled={!stripe || submitting}
        className="primary-btn checkout-pay-cta"
      >
        {submitting ? "Processing..." : "Place order securely"}
      </button>

      <p
        style={{
          marginTop: 16,
          fontSize: 12,
          color: "#94a3b8",
          textAlign: "center",
        }}
      >
        Honest Lenses does not store full card numbers.
      </p>
    </form>
  );
}

/* =========================
   Inner Page
========================= */

function CheckoutInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const orderId = searchParams.get("orderId");

  const [order, setOrder] = useState<Order | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [mode, setMode] = useState<"uploaded" | "passive">("passive");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const checkoutStartTracked = useRef(false);
  const clientSecretReady = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        if (!isOrderId(orderId)) {
          const recovery = await getCurrentOrderRecovery();
          if (cancelled) return;

          router.replace(getCheckoutRecoveryPath(recovery.recovery));
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        const orderRes = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
          cache: "no-store",
          headers: {
            ...(session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {}),
          },
        });

        const orderJson = await orderRes.json().catch(() => ({}));
        const orderData = orderJson.order;

        if (!orderRes.ok || !orderData) {
          throw new Error("Order not found.");
        }

        if (
          typeof orderData.total_amount_cents !== "number" ||
          orderData.total_amount_cents <= 0
        ) {
          throw new Error("Invalid order total.");
        }

        if (orderData.status === "captured") {
          router.replace(
            `/checkout/success?${new URLSearchParams({
              orderId,
              mode: isUploadedVerificationOrder(orderData) ? "uploaded" : "passive",
            }).toString()}`,
          );
          return;
        }

        if (
          orderData.status === "authorized" &&
          typeof orderData.payment_intent_id === "string" &&
          orderData.payment_intent_id
        ) {
          router.replace(
            `/checkout/return?payment_intent=${encodeURIComponent(orderData.payment_intent_id)}`,
          );
          return;
        }

        setOrder({
          id: orderData.id,
          status: orderData.status,
          total_amount_cents: orderData.total_amount_cents,
          amount_due_cents: getFeedbackAmountDueCents({
            total_amount_cents: orderData.total_amount_cents,
            feedback_credit_cents: orderData.feedback_credit_cents ?? null,
          }),
          manufacturer: orderData.manufacturer ?? null,
          sku: orderData.sku ?? null,
          shipping_cents: orderData.shipping_cents ?? null,
          shipping_method: orderData.shipping_method ?? "standard",
          payment_intent_id: orderData.payment_intent_id ?? null,
          has_payment_intent: Boolean(orderData.payment_intent_id),
          feedback_credit_cents: orderData.feedback_credit_cents ?? null,
          feedback_credit_applied_at:
            orderData.feedback_credit_applied_at ?? null,
          feedback_survey_completed_at:
            orderData.feedback_survey_completed_at ?? null,
          rx: orderData.rx ?? null,
          rx_upload_path: orderData.rx_upload_path ?? null,
          rx_source: orderData.rx_source ?? null,
          verification_status: orderData.verification_status ?? null,
        });

        setMode(isUploadedVerificationOrder(orderData) ? "uploaded" : "passive");

        markStepStart(`payment_init:${orderId}`);

        const res = await fetch("/api/checkout/pay", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {}),
          },
          body: JSON.stringify({ orderId }),
        });

        const body: CheckoutPayResponse = await res.json().catch(() => ({}));

        if (
          body.code === "PAYMENT_ALREADY_AUTHORIZED" &&
          body.payment_intent_id
        ) {
          router.replace(
            `/checkout/return?payment_intent=${encodeURIComponent(body.payment_intent_id)}`,
          );
          return;
        }

        if (
          !res.ok ||
          !body.clientSecret ||
          !body.payment_intent_id ||
          typeof body.total_amount_cents !== "number" ||
          typeof body.amount_due_cents !== "number"
        ) {
          throw new Error(body.error || "Payment init failed.");
        }

        if (!cancelled) {
          clientSecretReady.current = true;
          setOrder((current) =>
            current
              ? {
                  ...current,
                  total_amount_cents: body.total_amount_cents!,
                  amount_due_cents: body.amount_due_cents!,
                  manufacturer: body.manufacturer ?? current.manufacturer,
                  sku: body.sku ?? current.sku,
                  shipping_cents:
                    body.shipping_cents ?? current.shipping_cents,
                  shipping_method:
                    body.shipping_method ?? current.shipping_method,
                  feedback_credit_cents:
                    body.feedback_credit_cents ??
                    current.feedback_credit_cents,
                  payment_intent_id: body.payment_intent_id,
                  has_payment_intent: true,
                }
              : current,
          );
          setClientSecret(body.clientSecret);
          track(POSTHOG_EVENTS.CHECKOUT_STEP_TIMED, {
            step: "payment_intent_ready",
            order_id: orderId,
            order_value_cents: body.total_amount_cents,
            total_cart_value_cents: body.total_amount_cents,
            amount_due_cents: body.amount_due_cents,
            feedback_credit_cents: body.feedback_credit_cents ?? 0,
            manufacturer: body.manufacturer ?? null,
            sku: body.sku ?? null,
            shipping_cents: body.shipping_cents ?? null,
            shipping_method: body.shipping_method ?? "standard",
            has_payment_intent: true,
            duration_ms: consumeStepDurationMs(`payment_init:${orderId}`),
          });
          setLoading(false);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        captureClientException(err, {
          source: "checkout_init",
          order_id: orderId,
        });
        setError(err instanceof Error ? err.message : "Checkout failed.");
        setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [orderId, router]);

  useEffect(() => {
    if (!order || checkoutStartTracked.current) return;

    const activeOrder = order;
    const shippingCents = activeOrder.shipping_cents ?? 0;
    const subtotalCents = Math.max(
      0,
      activeOrder.total_amount_cents - shippingCents,
    );
    const completionKey = `hl_checkout_completed:${activeOrder.id}`;
    sessionStorage.removeItem(completionKey);
    checkoutStartTracked.current = true;

    if (!getStepDurationMs(`checkout_duration:${activeOrder.id}`)) {
      markStepStart(`checkout_duration:${activeOrder.id}`);
    }

    function captureAbandonment() {
      if (sessionStorage.getItem(completionKey)) return;
      const amountDueCents = activeOrder.amount_due_cents;

      track(POSTHOG_EVENTS.ABANDONED_CHECKOUT, {
        order_id: activeOrder.id,
        order_status: activeOrder.status,
        verification_mode: mode,
        order_value_cents: amountDueCents,
        total_cart_value_cents: activeOrder.total_amount_cents,
        amount_due_cents: amountDueCents,
        feedback_credit_cents: activeOrder.feedback_credit_cents ?? 0,
        subtotal_cents: subtotalCents,
        shipping_cents: shippingCents,
        shipping_method: activeOrder.shipping_method ?? "standard",
        manufacturer: activeOrder.manufacturer ?? null,
        sku: activeOrder.sku ?? null,
        has_payment_intent: activeOrder.has_payment_intent,
        payment_intent_ready: clientSecretReady.current,
        checkout_stage: "payment_page",
        checkout_duration_ms: getStepDurationMs(
          `checkout_duration:${activeOrder.id}`,
        ),
      });
    }

    window.addEventListener("pagehide", captureAbandonment);

    return () => {
      captureAbandonment();
      window.removeEventListener("pagehide", captureAbandonment);
    };
  }, [mode, order]);

  if (loading) {
    return <main className="content-shell">Loading checkout…</main>;
  }

  if (error) {
    return (
      <main className="content-shell">
        <p className="order-error">{error}</p>
      </main>
    );
  }

  if (!order || !clientSecret) {
    router.replace("/cart");
    return null;
  }

  const shippingCents = order.shipping_cents ?? 0;
  const subtotalCents = Math.max(0, order.total_amount_cents - shippingCents);
  const shippingMethod = order.shipping_method ?? "standard";
  const feedbackCreditCents = Math.min(
    normalizeFeedbackCreditCents(order.feedback_credit_cents),
    order.total_amount_cents,
  );
  const amountDueCents = order.amount_due_cents;

  return (
    <main>
      <section className="content-shell">
        <h1 className="upper content-title">Secure Checkout</h1>

        <p
          style={{
            color: "#cbd5e1",
            maxWidth: 720,
            lineHeight: 1.6,
            marginTop: -6,
            marginBottom: 18,
          }}
        >
          Contact lenses require a valid prescription before fulfillment. Your
          card is handled through Stripe; authorization and capture follow the
          verification status of your order.
        </p>

        <div
          className="order-card"
          style={{
            background: "#0f172a",
            padding: 36,
            borderRadius: 16,
            boxShadow: "0 10px 50px rgba(0,0,0,0.5)",
          }}
        >
          <div
            style={{
              background: "linear-gradient(180deg,#ffffff,#f8fafc)",
              color: "#0f172a",
              padding: 20,
              borderRadius: 12,
              marginBottom: 20,
            }}
          >
            <h2 style={{ marginBottom: 10, fontSize: 22 }}>
              Order Summary
            </h2>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 700 }}>Subtotal</div>
                <div style={{ fontWeight: 800 }}>
                  ${(subtotalCents / 100).toFixed(2)}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 700 }}>
                  {shippingMethod === "express"
                    ? "Express Shipping"
                    : "Standard Shipping"}
                </div>
                <div style={{ fontWeight: 800 }}>
                  {shippingCents === 0
                    ? "Free"
                    : `$${(shippingCents / 100).toFixed(2)}`}
                </div>
              </div>
              {feedbackCreditCents > 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    color: "#5b21b6",
                  }}
                >
                  <div style={{ fontWeight: 800 }}>Feedback credit</div>
                  <div style={{ fontWeight: 900 }}>
                    -${(feedbackCreditCents / 100).toFixed(2)}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 800 }}>Total</div>
                <div style={{ fontWeight: 900 }}>
                  ${(amountDueCents / 100).toFixed(2)}
                </div>
              </div>
            </div>

            <p style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
              Secure checkout. Payment information is encrypted by Stripe.
            </p>

            <p style={{ marginTop: 8, fontSize: 13, color: "#475569" }}>
              {mode === "uploaded"
                ? "Your uploaded prescription has been received. If anything needs review, we will contact you before fulfillment."
                : "Your card will be authorized now. Payment is captured after prescription verification is complete."}
            </p>

            <p style={{ marginTop: 8, fontSize: 13, color: "#475569" }}>
              {shippingMethod === "express"
                ? "Priority processing and expedited shipping where available. Delivery timing may vary based on manufacturer fulfillment and prescription verification."
                : "Most orders arrive within 7-10 business days. Annual supply orders may qualify for free standard shipping."}
            </p>
          </div>

          <Elements
            key={clientSecret}
            stripe={getStripePromise()}
            options={{ clientSecret, appearance: stripeAppearance }}
          >
            <CheckoutForm
              order={order}
              clientSecret={clientSecret}
              mode={mode}
              onQuoteChanged={(quote) => {
                if (
                  !quote.clientSecret ||
                  !quote.payment_intent_id ||
                  typeof quote.total_amount_cents !== "number" ||
                  typeof quote.amount_due_cents !== "number"
                ) {
                  return;
                }

                setOrder((current) =>
                  current
                    ? {
                        ...current,
                        total_amount_cents: quote.total_amount_cents!,
                        amount_due_cents: quote.amount_due_cents!,
                        feedback_credit_cents:
                          quote.feedback_credit_cents ??
                          current.feedback_credit_cents,
                        shipping_cents:
                          quote.shipping_cents ?? current.shipping_cents,
                        shipping_method:
                          quote.shipping_method ?? current.shipping_method,
                        manufacturer:
                          quote.manufacturer ?? current.manufacturer,
                        sku: quote.sku ?? current.sku,
                        payment_intent_id: quote.payment_intent_id,
                        has_payment_intent: true,
                      }
                    : current,
                );
                setClientSecret(quote.clientSecret);
              }}
              onPaymentComplete={() => {
                sessionStorage.setItem(
                  `hl_checkout_completed:${order.id}`,
                  "1",
                );
              }}
            />
          </Elements>
        </div>
        <AbandonmentFeedbackExperiment
          orderId={order.id}
          cartValueCents={order.total_amount_cents}
          orderStatus={order.status}
          hasPrescription={Boolean(
            order.rx || order.rx_upload_path || order.rx_source,
          )}
          feedbackCreditCents={order.feedback_credit_cents ?? null}
          feedbackSurveyCompletedAt={
            order.feedback_survey_completed_at ?? null
          }
          onCreditApplied={(creditCents) => {
            setOrder((current) =>
              current
                ? {
                    ...current,
                    feedback_credit_cents: creditCents,
                    amount_due_cents: getFeedbackAmountDueCents({
                      total_amount_cents: current.total_amount_cents,
                      feedback_credit_cents: creditCents,
                    }),
                    feedback_credit_applied_at: new Date().toISOString(),
                    feedback_survey_completed_at: new Date().toISOString(),
                  }
                : current,
            );
          }}
        />
      </section>
    </main>
  );
}

/* =========================
   Wrapper
========================= */

export default function CheckoutPage() {
  return (
    <Suspense fallback={<main className="content-shell">Loading…</main>}>
      <CheckoutInner />
    </Suspense>
  );
}
