"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { supabase } from "@/lib/supabase-client";
import AuthGate from "@/components/AuthGate";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

/* =========================
   Types
========================= */

type Order = {
  id: string;
  status: "draft" | "pending" | "authorized" | "captured";
  total_amount_cents: number;
};

type CheckoutPayResponse = {
  clientSecret?: string;
  error?: string;
};

type AuthorizedResponse = {
  ok?: boolean;
  error?: string;
};

/* =========================
   Inner Checkout Form
========================= */

function CheckoutForm({
  onAuthorized,
}: {
  onAuthorized: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!stripe || !elements) return;
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/success`,
      },
      redirect: "if_required",
    });

    if (result.error) {
      setError(result.error.message || "Payment failed");
      setSubmitting(false);
      return;
    }

    if (!result.paymentIntent) {
      setError("Missing payment intent");
      setSubmitting(false);
      return;
    }

    if (result.paymentIntent.status !== "requires_capture") {
      setError(
        `Authorization not complete (status: ${result.paymentIntent.status})`
      );
      setSubmitting(false);
      return;
    }

    // Get fresh session for API call
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setError("Session expired. Please log in again.");
      setSubmitting(false);
      return;
    }

    const markRes = await fetch("/api/checkout/authorized", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      cache: "no-store",
    });

    const markBody: AuthorizedResponse = await markRes
      .json()
      .catch(() => ({}));

    if (!markRes.ok) {
      setError(markBody?.error || "Failed to finalize authorization");
      setSubmitting(false);
      return;
    }

    onAuthorized();
  }

  return (
    <form onSubmit={handleSubmit}>
      <div
        style={{
          background: "#ffffff",
          padding: 24,
          borderRadius: 10,
        }}
      >
        <PaymentElement options={{ layout: "tabs" }} />
      </div>

      {error && (
        <p style={{ marginTop: 12, color: "#dc2626", fontWeight: 600 }}>
          {error}
        </p>
      )}

      <button
        disabled={!stripe || submitting}
        style={{
          marginTop: 24,
          width: "100%",
          padding: "18px",
          background: submitting
            ? "#94a3b8"
            : "linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%)",
          color: "#ffffff",
          borderRadius: 12,
          fontWeight: 800,
          fontSize: 16,
          border: "none",
          cursor: !stripe || submitting ? "not-allowed" : "pointer",
        }}
      >
        {submitting ? "Processing…" : "Authorize Secure Payment"}
      </button>
    </form>
  );
}

/* =========================
   Page
========================= */

export default function CheckoutPage() {
  const router = useRouter();

  const [order, setOrder] = useState<Order | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setLoading(true);
        setError(null);

        const {
          data: { session },
        } = await supabase.auth.getSession();

        // AuthGate protects this page — no redirect needed
        if (!session) return;

        const { data: orderData, error: orderError } = await supabase
          .from("orders")
          .select("id, status, total_amount_cents")
          .eq("user_id", session.user.id)
          .eq("status", "draft")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (orderError || !orderData) {
          throw new Error("No draft order");
        }

        if (
          typeof orderData.total_amount_cents !== "number" ||
          orderData.total_amount_cents <= 0
        ) {
          throw new Error("Order missing valid total");
        }

        if (cancelled) return;
        setOrder(orderData as Order);

        const res = await fetch("/api/checkout/pay", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        });

        const body: CheckoutPayResponse = await res
          .json()
          .catch(() => ({}));

        if (!res.ok || !body?.clientSecret) {
          throw new Error(body?.error || "Payment initialization failed");
        }

        if (cancelled) return;
        setClientSecret(body.clientSecret);
        setLoading(false);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Checkout failed");
        setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []);

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
    return (
      <main className="content-shell">
        <p className="order-error">Unable to initialize payment.</p>
      </main>
    );
  }

  return (
    <AuthGate>
      <main>
        <section className="content-shell">
          <h1 className="upper content-title">Secure Checkout</h1>

          <div
            className="order-card"
            style={{
              background: "#0f172a",
              padding: 32,
              borderRadius: 12,
              boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
            }}
          >
            <div
              style={{
                background: "#ffffff",
                color: "#0f172a",
                padding: 20,
                borderRadius: 10,
                marginBottom: 18,
              }}
            >
              <h2 style={{ marginBottom: 10, fontSize: 22 }}>
                Order Summary
              </h2>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Total:</div>
                <div style={{ fontWeight: 900, fontSize: 20 }}>
                  ${(order.total_amount_cents / 100).toFixed(2)}
                </div>
              </div>
              <p style={{ marginTop: 8, fontSize: 13, color: "#475569" }}>
                Authorization only. Your card will not be charged until
                prescription verification is complete.
              </p>
            </div>

            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <CheckoutForm
                onAuthorized={() =>
                  router.replace(
                    `/checkout/verification-details?orderId=${order.id}`
                  )
                }
              />
            </Elements>
          </div>
        </section>
      </main>
    </AuthGate>
  );
}