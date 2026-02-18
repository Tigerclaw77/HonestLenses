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
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
);

/* =========================
   Types
========================= */

type Order = {
  id: string;
  status: "pending" | "authorized" | "captured";
  total_amount_cents: number;
};

type CheckoutPayResponse = {
  clientSecret?: string;
  error?: string;
};

type AuthorizedResponse = {
  success?: boolean;
  error?: string;
};

/* =========================
   Inner Checkout Form
========================= */

function CheckoutForm({
  accessToken,
  onAuthorized,
}: {
  accessToken: string;
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

    const markRes = await fetch("/api/checkout/authorized", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    let markBody: AuthorizedResponse | null = null;

    try {
      markBody = (await markRes.json()) as AuthorizedResponse;
    } catch {
      markBody = null;
    }

    if (!markRes.ok) {
      setError(markBody?.error || "Failed to finalize authorization");
      setSubmitting(false);
      return;
    }

    // 2️⃣ Send verification request (starts 8 business hour clock)
    const verificationRes = await fetch("/api/verification/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (!verificationRes.ok) {
      const verificationBody = await verificationRes.json().catch(() => null);
      setError(verificationBody?.error || "Failed to initiate verification");
      setSubmitting(false);
      return;
    }

    // 3️⃣ Success → go to success page
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
          boxShadow: submitting ? "none" : "0 8px 24px rgba(37, 99, 235, 0.35)",
          transition: "all 0.2s ease",
        }}
        onMouseOver={(e) => {
          if (!submitting) {
            e.currentTarget.style.background =
              "linear-gradient(90deg, #1d4ed8 0%, #1e40af 100%)";
            e.currentTarget.style.transform = "translateY(-2px)";
          }
        }}
        onMouseOut={(e) => {
          if (!submitting) {
            e.currentTarget.style.background =
              "linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%)";
            e.currentTarget.style.transform = "translateY(0px)";
          }
        }}
      >
        {submitting ? "Processing…" : "Authorize Secure Payment"}
      </button>

      <p
        style={{
          fontSize: 13,
          color: "#94a3b8",
          marginTop: 12,
          textAlign: "center",
        }}
      >
        Authorization only. Your card will not be charged until prescription
        verification is complete.
      </p>

      <p
        style={{
          fontSize: 12,
          color: "#64748b",
          marginTop: 8,
          textAlign: "center",
        }}
      >
        Secure SSL encryption · PCI compliant · Powered by Stripe
      </p>
    </form>
  );
}

/* =========================
   Page
========================= */

export default function CheckoutPage() {
  const router = useRouter();

  const [order, setOrder] = useState<Order | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
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

        if (!session) {
          router.replace("/login");
          return;
        }

        if (cancelled) return;
        setAccessToken(session.access_token);

        const { data: orderData, error: orderError } = await supabase
          .from("orders")
          .select("id, status, total_amount_cents")
          .eq("user_id", session.user.id)
          .in("status", ["pending", "authorized", "captured"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (orderError || !orderData) {
          throw new Error("No pending order");
        }

        if (
          orderData.status === "authorized" ||
          orderData.status === "captured"
        ) {
          router.replace("/checkout/success");
          return;
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

        let body: CheckoutPayResponse | null = null;

        try {
          body = (await res.json()) as CheckoutPayResponse;
        } catch {
          body = null;
        }

        if (!res.ok || !body?.clientSecret) {
          throw new Error(body?.error || "Payment initialization failed");
        }

        if (cancelled) return;
        setClientSecret(body.clientSecret);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Checkout failed");
        setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
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

  if (!order || !accessToken || !clientSecret) {
    return (
      <main className="content-shell">
        <p className="order-error">Unable to initialize payment.</p>
      </main>
    );
  }

  const orderTotal = order.total_amount_cents;

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
              background: "#ffffff",
              color: "#0f172a",
              padding: 20,
              borderRadius: 10,
              marginBottom: 18,
            }}
          >
            <h2 style={{ marginBottom: 10, fontSize: 22 }}>Order Summary</h2>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Total:</div>
              <div style={{ fontWeight: 900, fontSize: 20 }}>
                ${(orderTotal / 100).toFixed(2)}
              </div>
            </div>
            <p style={{ marginTop: 8, fontSize: 13, color: "#475569" }}>
              Authorization only. Your card will not be charged until
              prescription verification is complete.
            </p>
          </div>

          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              locale: "en",
              appearance: {
                theme: "stripe",
                variables: {
                  colorPrimary: "#0f172a",
                  colorBackground: "#ffffff",
                  colorText: "#0b1220",
                  colorDanger: "#b91c1c",
                  fontFamily: "Inter, system-ui, sans-serif",
                  borderRadius: "10px",
                },
              },
            }}
          >
            <CheckoutForm
              accessToken={accessToken}
              onAuthorized={() => router.replace("/checkout/success")}
            />
          </Elements>
        </div>
      </section>
    </main>
  );
}
