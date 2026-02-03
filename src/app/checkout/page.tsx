"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const LS_ORDER_ID = "hl_active_order_id";

type Order = {
  id: string;
  total_amount_cents: number;
  revised_total_amount_cents: number | null;
  verification_status: string;
  price_reason: string | null;
};

export default function CheckoutPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function append(msg: string) {
    setLog((l) => [...l, msg]);
  }

  const refreshOrder = useCallback(async (id: string) => {
    const res = await authFetch(`/api/orders/${id}`);
    const body = await res.json();
    if (res.ok) {
      setOrder(body.order);
    }
  }, []);

  /**
   * Auth + cart presence gate
   * - not logged in → /login
   * - logged in, empty cart → /shop
   */
  useEffect(() => {
    async function initCheckout() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.replace("/login");
          return;
        }

        // 1️⃣ Check cart first
        const cartRes = await fetch("/api/cart/has-items", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const cartBody = await cartRes.json();

        if (!cartBody.hasItems) {
          router.replace("/shop");
          return;
        }

        // 2️⃣ Use existing order if present (same order the Rx page used)
        let existing = localStorage.getItem(LS_ORDER_ID);

        if (!existing) {
          const orderRes = await authFetch("/api/orders", { method: "POST" });
          const orderBody = await orderRes.json();

          if (!orderRes.ok || !orderBody.orderId) {
            throw new Error("Failed to create order");
          }

          const newOrderId = orderBody.orderId as string;
          localStorage.setItem(LS_ORDER_ID, newOrderId);
          existing = newOrderId;
        }

        setOrderId(existing);
        await refreshOrder(existing);

        // 3️⃣ Done
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError(
          err instanceof Error ? err.message : "Checkout initialization failed",
        );
        setLoading(false);
      }
    }

    initCheckout();
  }, [router, refreshOrder]);

  async function authFetch(
    url: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) throw new Error("Not logged in");

    return fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${session.access_token}`,
      },
    });
  }

  // save in case needed later
  // async function createOrder() {
  //   setError(null);
  //   append("→ Creating order");

  //   try {
  //     const res = await authFetch("/api/orders", { method: "POST" });
  //     const body: { orderId?: string; error?: string } = await res.json();

  //     if (!res.ok) throw new Error(body.error || "Create failed");
  //     if (!body.orderId) throw new Error("Missing orderId");

  //     setOrderId(body.orderId);
  //     append(`✓ Order created: ${body.orderId}`);
  //     await refreshOrder(body.orderId);
  //   } catch (err: unknown) {
  //     setError(err instanceof Error ? err.message : "Create failed");
  //   }
  // }

  async function setPrice() {
    if (!orderId) return;
    append("→ Setting price");

    try {
      const res = await authFetch(`/api/orders/${orderId}/price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          total_amount_cents: 2499,
          currency: "USD",
        }),
      });

      if (!res.ok) throw new Error("Price failed");
      append("✓ Price set ($24.99)");
      await refreshOrder(orderId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Price failed");
    }
  }

  async function attachRx() {
    if (!orderId) return;
    append("→ Attaching Rx");

    try {
      const res = await authFetch(`/api/orders/${orderId}/rx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          right: { sphere: -2.25, cyl: -0.75, axis: 180 },
          left: { sphere: -2.0, cyl: -0.5, axis: 170 },
          expires: "2026-05-01",
        }),
      });

      if (!res.ok) throw new Error("Rx failed");
      append("✓ Rx attached (verification required)");
      await refreshOrder(orderId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Rx failed");
    }
  }

  async function authorizePayment() {
    if (!orderId) return;
    append("→ Authorizing payment (hold only)");

    try {
      const res = await authFetch(`/api/orders/${orderId}/pay`, {
        method: "POST",
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Authorize failed");

      append("✓ Payment authorized (Stripe hold)");
      await refreshOrder(orderId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authorize failed");
    }
  }

  async function verifyRx() {
    if (!orderId) return;
    append("→ Verifying Rx (admin)");

    try {
      const res = await authFetch(`/api/orders/${orderId}/verify`, {
        method: "POST",
      });

      if (!res.ok) throw new Error("Verify failed");
      append("✓ Rx verification complete");
      await refreshOrder(orderId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verify failed");
    }
  }

  async function capture() {
    if (!orderId || !order) return;

    append("→ Capturing payment");

    try {
      const res = await authFetch(`/api/orders/${orderId}/capture`, {
        method: "POST",
      });

      if (!res.ok) throw new Error("Capture failed");

      // ✅ CLEAR RX DRAFT HERE
      localStorage.removeItem("hl_rx_draft_v1");

      append("✓ Payment captured");
      router.push("/checkout/success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Capture failed");
    }
  }

  if (loading) return <div>Loading…</div>;

  const requiresReauth =
    order?.verification_status === "altered" &&
    order.revised_total_amount_cents !== null;

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1>Checkout (Order & Payment Gate)</h1>

      {requiresReauth && order && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            border: "1px solid #f5c26b",
            background: "#fff8eb",
            borderRadius: 6,
          }}
        >
          <strong>Prescription adjusted</strong>
          <p>Your order price has changed after verification.</p>

          {order.price_reason && (
            <p>
              <em>Reason:</em> {order.price_reason}
            </p>
          )}

          <p>
            Original: ${(order.total_amount_cents / 100).toFixed(2)} <br />
            Revised: ${(order.revised_total_amount_cents! / 100).toFixed(2)}
          </p>

          <p>Please re-authorize payment to continue.</p>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={setPrice} disabled={!orderId}>
          1. Set Price
        </button>
        <button onClick={attachRx} disabled={!orderId}>
          2. Attach Rx
        </button>
        <button onClick={authorizePayment} disabled={!orderId}>
          3. Authorize Payment
        </button>
        <button onClick={verifyRx} disabled={!orderId}>
          4. Verify Rx
        </button>
        <button onClick={capture} disabled={!orderId || requiresReauth}>
          5. Capture
        </button>
      </div>

      {/* <div style={{ marginTop: 24 }}>
        <p>
          <strong>Need to add more lenses?</strong>{" "}
          <a href="/shop">Continue shopping</a>
        </p>
      </div> */}

      {orderId && (
        <div style={{ marginTop: 16 }}>
          <strong>Order ID</strong>
          <pre>{orderId}</pre>
        </div>
      )}

      {error && <div style={{ color: "red", marginTop: 16 }}>{error}</div>}

      <pre
        style={{
          marginTop: 24,
          padding: 12,
          background: "#111",
          color: "#0f0",
          minHeight: 220,
        }}
      >
        {log.join("\n")}
      </pre>
    </div>
  );
}
