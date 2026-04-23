"use client";

import { useEffect, useState } from "react";

type Order = {
  id: string;
  status: string;
  verification_status: string;
  sku?: string;
  total_amount_cents?: number;
  created_at?: string;
};

export default function AdminOrdersPage() {
  const [data, setData] = useState<{
    needsAction: Order[];
    stalled: Order[];
    pipeline: Order[];
  } | null>(null);

  useEffect(() => {
    fetch("/api/admin/orders", {
      headers: {
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_PASSWORD}`,
      },
    })
      .then((res) => res.json())
      .then(setData);
  }, []);

  if (!data) return <p style={{ padding: 20 }}>Loading...</p>;

  function renderSection(title: string, orders: Order[]) {
    return (
      <div style={{ marginBottom: 40 }}>
        <h2 style={{ marginBottom: 10 }}>{title}</h2>

        {orders.length === 0 && <p>None</p>}

        {orders.map((o) => (
          <div
            key={o.id}
            style={{
              padding: 12,
              border: "1px solid rgba(148,163,184,0.2)",
              borderRadius: 10,
              marginBottom: 10,
            }}
          >
            <p><strong>{o.id}</strong></p>
            <p>{o.sku}</p>
            <p>
              {typeof o.total_amount_cents === "number"
                ? `$${(o.total_amount_cents / 100).toFixed(2)}`
                : "—"}
            </p>
            <p>
              {o.status} / {o.verification_status}
            </p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <main style={{ padding: 20 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>
        Admin Orders
      </h1>

      {renderSection("Needs Action", data.needsAction)}
      {renderSection("Stalled", data.stalled)}
      {renderSection("Pipeline", data.pipeline)}
    </main>
  );
}