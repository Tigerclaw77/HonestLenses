"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

export default function RxEntryForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rightSphere, setRightSphere] = useState("");
  const [leftSphere, setLeftSphere] = useState("");
  const [expires, setExpires] = useState("");

  async function submit() {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        const next = window.location.pathname + window.location.search;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }

      // Create / reuse order (idempotent)
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const orderBody = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderBody.error);
      const orderId = orderBody.orderId;

      // Attach Rx
      const rxRes = await fetch(`/api/orders/${orderId}/rx`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          right: { sphere: Number(rightSphere) },
          left: { sphere: Number(leftSphere) },
          expires,
        }),
      });

      if (!rxRes.ok) {
        const body = await rxRes.json();
        throw new Error(body.error);
      }

      router.push("/checkout");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="order-card">
      <label>
        Right eye (OD) – Sphere
        <input
          type="number"
          step="0.25"
          value={rightSphere}
          onChange={(e) => setRightSphere(e.target.value)}
        />
      </label>

      <label>
        Left eye (OS) – Sphere
        <input
          type="number"
          step="0.25"
          value={leftSphere}
          onChange={(e) => setLeftSphere(e.target.value)}
        />
      </label>

      <label>
        Prescription expiration date
        <input
          type="date"
          value={expires}
          onChange={(e) => setExpires(e.target.value)}
        />
      </label>

      <button onClick={submit} disabled={loading}>
        {loading ? "Processing…" : "Continue to checkout"}
      </button>

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
