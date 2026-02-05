"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "../../../../components/Header";

export default function CheckoutSuccessPage() {
  const router = useRouter();

  // Optional: auto-redirect after a short pause
  useEffect(() => {
    const t = setTimeout(() => {
      router.replace("/dashboard"); // or /orders later
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
              Your prescription is on file and will be verified before lenses
              ship. You’ll receive an email confirmation shortly.
            </p>

            <p style={{ marginTop: 16, opacity: 0.8 }}>
              You’ll be redirected automatically…
            </p>

            <button
              className="primary-btn"
              style={{ marginTop: 16 }}
              onClick={() => router.push("/dashboard")}
            >
              Go to my account
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
