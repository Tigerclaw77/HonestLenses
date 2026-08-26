"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { buildCheckoutSuccessPath } from "@/lib/orders/checkoutSuccess";
import { supabase } from "@/lib/supabase-client";

type ReturnResponse = {
  ok?: boolean;
  error?: string;
  orderId?: string;
  next?: "success" | "verification-details";
  mode?: "uploaded_auto_verified" | "uploaded_review" | "passive" | "information_needed";
};

const PAYMENT_INTENT_PATTERN = /^pi_[A-Za-z0-9]+$/;

/**
 * Stripe redirects off-site methods here. The only value read from the URL is
 * a PaymentIntent identifier; the server retrieves and validates the object,
 * its metadata, its amount, and the current order access before changing state.
 */
export default function ReturnClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paymentIntentId = searchParams.get("payment_intent");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function reconcile() {
      if (!paymentIntentId || !PAYMENT_INTENT_PATTERN.test(paymentIntentId)) {
        setError("Payment return information is missing. Please use your secure resume-order link.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch("/api/checkout/return", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ paymentIntentId }),
      });
      const body: ReturnResponse = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (!response.ok || !body.ok || !body.orderId || !body.next) {
        setError(body.error || "We could not finish checkout. Please use your secure resume-order link.");
        return;
      }

      if (body.next === "verification-details") {
        router.replace(`/checkout/verification-details?orderId=${encodeURIComponent(body.orderId)}`);
        return;
      }

      router.replace(
        buildCheckoutSuccessPath({
          orderId: body.orderId,
          mode: body.mode?.startsWith("uploaded") ? "uploaded" : "passive",
        }),
      );
    }

    reconcile().catch(() => {
      if (!cancelled) {
        setError("We could not finish checkout. Please use your secure resume-order link.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [paymentIntentId, router]);

  return (
    <main>
      <section className="content-shell">
        <h1>Finishing checkout</h1>
        <p>{error || "Confirming your payment authorization and next step…"}</p>
        {error && (
          <button onClick={() => router.replace("/resume-order")}>
            Resume an Order
          </button>
        )}
      </section>
    </main>
  );
}
