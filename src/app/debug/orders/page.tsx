"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";

type VerificationStatus = "pending" | "verified" | "altered" | "rejected";

type Order = {
  id: string;
  status: string;
  total_amount_cents: number | null;
  currency: string | null;
  verification_status: VerificationStatus;
  rx_data: unknown | null;
  created_at: string;
};

type OrdersListResponse = {
  orders: Order[];
};

export default function OrdersDebugPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOrders() {
      try {
        // 1️⃣ Get active session
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          throw new Error("Not logged in");
        }

        // 2️⃣ Authenticated request
        const res = await fetch("/api/orders/list", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!res.ok) {
          const body: { error?: string } = await res.json();
          throw new Error(body.error ?? "Failed to load orders");
        }

        const data: OrdersListResponse = await res.json();
        setOrders(data.orders);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load orders");
        }
      } finally {
        setLoading(false);
      }
    }

    loadOrders();
  }, []);

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (error) return <div style={{ padding: 24, color: "red" }}>{error}</div>;

  return (
    <div style={{ padding: 24 }}>
      <h1>Orders (Debug)</h1>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginTop: 16,
        }}
      >
        <thead>
          <tr>
            <th align="left">ID</th>
            <th>Status</th>
            <th>Total</th>
            <th>Rx</th>
            <th>Verification</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} style={{ borderTop: "1px solid #333" }}>
              <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                {o.id}
              </td>
              <td>{o.status}</td>
              <td>
                {o.total_amount_cents
                  ? `${(o.total_amount_cents / 100).toFixed(2)} ${o.currency}`
                  : "—"}
              </td>
              <td>{o.rx_data ? "✅" : "—"}</td>
              <td>
                {o.verification_status === "pending" && "⏳"}
                {o.verification_status === "verified" && "✅"}
                {o.verification_status === "altered" && "✏️"}
                {o.verification_status === "rejected" && "❌"}
              </td>
              <td style={{ fontSize: 12 }}>
                {new Date(o.created_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
