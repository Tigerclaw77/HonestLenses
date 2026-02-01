"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function UploadPrescriptionPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitRx() {
    setLoading(true);
    setError(null);

    try {
      const rxData = {
        right: { sphere: -2.25, cyl: -0.75, axis: 180 },
        left: { sphere: -2.0, cyl: -0.5, axis: 170 },
        expires: "2026-05-01",
      };

      // 1️⃣ Create or reuse draft order
      const orderRes = await fetch("/api/orders", {
        method: "POST",
      });

      const orderBody = await orderRes.json();
      if (!orderRes.ok || !orderBody.orderId) {
        throw new Error(orderBody.error || "Order creation failed");
      }

      const orderId = orderBody.orderId;

      // 2️⃣ Attach Rx to that order
      const rxRes = await fetch(`/api/orders/${orderId}/rx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rxData),
      });

      if (!rxRes.ok) {
        const body = await rxRes.json();
        throw new Error(body.error || "Rx attach failed");
      }

      // 3️⃣ Go to checkout
      router.push("/checkout");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 600 }}>
      <h1>Upload prescription</h1>

      <p>This will automatically select the correct lenses.</p>

      <button onClick={submitRx} disabled={loading}>
        {loading ? "Processing…" : "Continue to checkout"}
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}
    </main>
  );
}
