"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "../../../../components/Header";

type SuccessMode = "uploaded" | "passive" | "unknown";

function parseMode(raw: string | null): SuccessMode {
  if (raw === "uploaded") return "uploaded";
  if (raw === "passive") return "passive";
  return "unknown";
}

export default function CheckoutSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const orderId = searchParams.get("orderId");
  const mode = parseMode(searchParams.get("mode"));

  const isUploaded = mode === "uploaded";
  const isPassive = mode === "passive";

  /* =========================
     Auto Redirect (only if orderId exists)
  ========================= */

  useEffect(() => {
    if (!orderId) return;

    const t = setTimeout(() => {
      router.replace(`/order/${orderId}`);
    }, 5000);

    return () => clearTimeout(t);
  }, [router, orderId]);

  /* =========================
     Dynamic Messaging
  ========================= */

  const title = "Order Received";
  let message =
    "Your order has been received and is now being processed.";

  if (isUploaded) {
    message =
      "Your prescription has been received and verified. Your order is being prepared for shipment.";
  }

  if (isPassive) {
    message =
      "Your order has been received. We are verifying your prescription before shipment.";
  }

  return (
    <>
      <Header variant="shop" />

      <main>
        <section className="content-shell">
          <h1 className="upper content-title">{title}</h1>

          <div className="order-card">
            <p>
              <strong>Thank you.</strong> Your order has been successfully
              placed.
            </p>

            <p>{message}</p>

            {orderId && (
              <p style={{ marginTop: 12, opacity: 0.7 }}>
                Order ID: {orderId}
              </p>
            )}

            <p style={{ marginTop: 16, opacity: 0.8 }}>
              You’ll be redirected automatically…
            </p>

            {orderId && (
              <button
                className="primary-btn"
                style={{ marginTop: 16 }}
                onClick={() => router.push(`/order/${orderId}`)}
              >
                View Your Order
              </button>
            )}

            {!orderId && (
              <button
                className="primary-btn"
                style={{ marginTop: 16 }}
                onClick={() => router.push("/")}
              >
                Return to Home
              </button>
            )}
          </div>
        </section>
      </main>
    </>
  );
}