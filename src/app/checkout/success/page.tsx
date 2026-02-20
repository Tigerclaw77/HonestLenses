"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "../../../components/Header";

export default function CheckoutSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const deadline = searchParams.get("deadline");

  function formatDeadline(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return null;
    }
  }

  const formattedDeadline = deadline ? formatDeadline(deadline) : null;

  // Auto-redirect after short pause
  useEffect(() => {
    const t = setTimeout(() => {
      router.replace("/shop"); // or /orders later
    }, 5000);

    return () => clearTimeout(t);
  }, [router]);

  return (
    <>
      <Header variant="shop" />

      <main>
        <section className="content-shell">
          <h1 className="upper content-title">Order Complete</h1>

          <div className="order-card">
            <p>
              <strong>Thank you.</strong> Your order has been successfully
              placed.
            </p>

            <p>
              We will begin prescription verification shortly.
            </p>

            {formattedDeadline && (
              <div
                style={{
                  marginTop: 16,
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: "1px solid rgba(37, 99, 235, 0.35)",
                  background: "rgba(37, 99, 235, 0.08)",
                  fontSize: 14,
                }}
              >
                If we do not hear back by <strong>{formattedDeadline}</strong>,
                your order will automatically proceed under federal passive
                verification rules.
              </div>
            )}

            <p style={{ marginTop: 16 }}>
              We’ll email you once verification is complete.
            </p>

            <p style={{ marginTop: 16, opacity: 0.8 }}>
              You’ll be redirected automatically…
            </p>

            <button
              className="primary-btn"
              style={{ marginTop: 16 }}
              onClick={() => router.push("/shop")}
            >
              Go to my account
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
