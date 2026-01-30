"use client";

import { useEffect, useState } from "react";

type Order = {
  id: string;
  status: string;
  total_amount_cents: number | null;
  currency: string | null;
  verification_required: boolean;
  rx_data: unknown | null;
  created_at: string;
};

export default function OrdersDebugPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/orders/list")
      .then((res) => res.json())
      .then((data) => {
        setOrders(data.orders || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load orders");
        setLoading(false);
      });
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
              <td>{o.verification_required ? "⚠️" : "—"}</td>
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
