"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase-client";

export default function RxDebugPage() {
  const [orderId, setOrderId] = useState("");
  const [rxJson, setRxJson] = useState(`{
  "right": { "sphere": -2.25, "cyl": -0.75, "axis": 180 },
  "left": { "sphere": -2.00, "cyl": -0.50, "axis": 170 },
  "expires": "2026-05-01"
}`);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitRx() {
    setLoading(true);
    setResult(null);

    try {
      // 1️⃣ Get active session
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Not logged in");
      }

      // 2️⃣ Authenticated request
      const res = await fetch(`/api/orders/${orderId}/rx`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: rxJson,
      });

      const text = await res.text();

      if (!res.ok) {
        throw new Error(text || "Request failed");
      }

      setResult(text);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setResult(err.message);
      } else {
        setResult("Request failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <h1>Rx Upload (Debug)</h1>

      <div style={{ marginBottom: 12 }}>
        <label>
          Order ID
          <input
            style={{ width: "100%", marginTop: 4 }}
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="UUID"
          />
        </label>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>
          Rx JSON
          <textarea
            style={{ width: "100%", height: 200, marginTop: 4 }}
            value={rxJson}
            onChange={(e) => setRxJson(e.target.value)}
          />
        </label>
      </div>

      <button onClick={submitRx} disabled={loading || !orderId}>
        {loading ? "Submitting..." : "Attach Rx"}
      </button>

      {result && (
        <pre
          style={{
            marginTop: 16,
            padding: 12,
            background: "#111",
            color: "#0f0",
            whiteSpace: "pre-wrap",
          }}
        >
          {result}
        </pre>
      )}
    </div>
  );
}
