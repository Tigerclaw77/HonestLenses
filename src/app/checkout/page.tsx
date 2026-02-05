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

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

/* =========================
   Inner Checkout Form
========================= */

function CheckoutForm({
  accessToken,
  disabled,
  onAuthorized,
}: {
  accessToken: string;
  disabled: boolean;
  onAuthorized: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    if (!stripe || !elements) return;

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

    // ✅ Payment authorized locally. Now mark the order pending server-side.
    const markRes = await fetch("/api/checkout/authorized", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const markBody = await markRes.json();

    if (!markRes.ok) {
      setError(markBody.error || "Failed to finalize authorization");
      setSubmitting(false);
      return;
    }

    onAuthorized();
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {error && <p style={{ marginTop: 12 }}>{error}</p>}
      <button disabled={!stripe || submitting || disabled}>
        {submitting ? "Processing…" : "Authorize Payment"}
      </button>
    </form>
  );
}

/* =========================
   Page Wrapper
========================= */

type Order = {
  id: string;
  status: "draft" | "pending" | "paid";
};

export default function CheckoutPage() {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.replace("/login");
          return;
        }

        setAccessToken(session.access_token);

        // Load current order status (authoritative)
        const { data: orderData, error: orderError } = await supabase
          .from("orders")
          .select("id, status")
          .single();

        if (orderError || !orderData) {
          throw new Error("Order not found");
        }

        setOrder(orderData);

        // Paid → success
        if (orderData.status === "paid") {
          router.replace("/checkout/success");
          return;
        }

        // Pending → read-only
        if (orderData.status === "pending") {
          setLoading(false);
          return;
        }

        // Draft → create/reuse PI (but do NOT change status)
        const res = await fetch("/api/checkout/pay", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const body = await res.json();

        if (!res.ok || !body.clientSecret) {
          throw new Error(body.error || "Payment initialization failed");
        }

        setClientSecret(body.clientSecret);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Checkout failed");
        setLoading(false);
      }
    }

    init();
  }, [router]);

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

  if (!order) return null;

  if (order.status === "pending") {
    return (
      <main className="content-shell">
        <h1 className="upper content-title">Order Submitted</h1>
        <p>Awaiting prescription verification.</p>
      </main>
    );
  }

  // Draft state:
  if (!accessToken || !clientSecret) {
    return (
      <main className="content-shell">
        <p className="order-error">Unable to initialize payment.</p>
      </main>
    );
  }

  return (
    <main>
      <section className="content-shell">
        <h1 className="upper content-title">Secure Checkout</h1>

        <div className="order-card">
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <CheckoutForm
              accessToken={accessToken}
              disabled={order.status !== "draft"}
              onAuthorized={() => router.replace("/checkout/success")}
            />
          </Elements>
        </div>
      </section>
    </main>
  );
}
