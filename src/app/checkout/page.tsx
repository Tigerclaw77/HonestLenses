"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { supabase } from "@/lib/supabase-client";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
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
  orderId?: string;
  next?: "success" | "verification-details";
  mode?: "uploaded" | "passive";
  deadline?: string;
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

/* =========================
   Inner Checkout Form
========================= */

function CheckoutForm() {
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
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/checkout/success`,
        },
        redirect: "if_required",
      });

      if (result.error) {
        setError(result.error.message || "Payment failed.");
        setSubmitting(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("Session expired.");
        setSubmitting(false);
        return;
      }

      const markRes = await fetch("/api/checkout/authorized", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const markBody: AuthorizedResponse = await markRes.json().catch(() => ({}));

      const nextRoute = buildRouteFromAuthorizedResponse(markBody);

      router.replace(nextRoute || "/checkout/success");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unexpected checkout error.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ background: "#fff", padding: 24, borderRadius: 10 }}>
        <PaymentElement />
      </div>

      {error && (
        <p style={{ marginTop: 12, color: "#dc2626", fontWeight: 600 }}>
          {error}
        </p>
      )}

      <button disabled={!stripe || submitting} style={{ marginTop: 24 }}>
        {submitting ? "Processing…" : "Complete Checkout"}
      </button>
    </form>
  );
}

/* =========================
   INNER PAGE (moved logic)
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

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        if (!orderId) {
          throw new Error("Missing orderId.");
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          throw new Error("Not logged in.");
        }

        console.log("CHECKOUT USER:", session.user.id);
        console.log("ORDER ID:", orderId);

        const { data: orderData, error: orderError } = await supabase
          .from("orders")
          .select(
            `
            id,
            status,
            total_amount_cents,
            rx_upload_order_d,
            rx_mode,
            verification_mode,
            rx_source,
            mode
          `,
          )
          .eq("id", orderId)
          .single();

        if (orderError || !orderData) {
          throw new Error("Order not found.");
        }

        if (
          typeof orderData.total_amount_cents !== "number" ||
          orderData.total_amount_cents <= 0
        ) {
          throw new Error("Invalid order total.");
        }

        setOrder({
          id: orderData.id,
          status: orderData.status,
          total_amount_cents: orderData.total_amount_cents,
        });

        setMode(orderData.rx_upload_order_d ? "uploaded" : "passive");

        const res = await fetch("/api/checkout/pay", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ orderId }),
        });

        const body: CheckoutPayResponse = await res.json();

        if (!res.ok || !body.clientSecret) {
          throw new Error(body.error || "Payment init failed.");
        }

        if (!cancelled) {
          setClientSecret(body.clientSecret);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Checkout failed.");
        setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

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

  return (
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
              background: "#fff",
              color: "#0f172a",
              padding: 20,
              borderRadius: 10,
              marginBottom: 18,
            }}
          >
            <h2 style={{ marginBottom: 10, fontSize: 22 }}>Order Summary</h2>

            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ fontWeight: 800 }}>Total:</div>
              <div style={{ fontWeight: 900 }}>
                ${(order.total_amount_cents / 100).toFixed(2)}
              </div>
            </div>

            <p style={{ marginTop: 8, fontSize: 13, color: "#475569" }}>
              {mode === "uploaded"
                ? "Your prescription has already been received."
                : "You will only be charged after your prescription is verified."}
            </p>
          </div>

          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <CheckoutForm />
          </Elements>
        </div>
      </section>
    </main>
  );
}

/* =========================
   OUTER WRAPPER (fix)
========================= */

export default function CheckoutPage() {
  return (
    <Suspense fallback={<main className="content-shell">Loading…</main>}>
      <CheckoutInner />
    </Suspense>
  );
}