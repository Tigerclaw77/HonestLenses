"use client";

import { useState, useEffect, useCallback } from "react";

type Order = {
  id: string;
  status: string;
  total_amount_cents: number | null;
  created_at: string;
};

type AdminData = {
  needsAction: Order[];
  stalled: Order[];
  pipeline: Order[];
};

export default function AdminOrdersPage() {
  const [password, setPassword] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (pw?: string) => {
  const usePw = pw || password;
  if (!usePw) return;

  setLoading(true);

  const res = await fetch("/api/admin/orders", {
    headers: {
      Authorization: `Bearer ${usePw}`,
    },
  });

  if (res.status === 401) {
    alert("Wrong password");
    setLoading(false);
    return;
  }

  const json: AdminData = await res.json();

  setData(json);
  setAuthorized(true);
  localStorage.setItem("admin_pw", usePw);

  setLoading(false);
}, [password]);

  useEffect(() => {
    const saved = localStorage.getItem("admin_pw");
    if (saved) {
      setTimeout(() => login(saved), 0);
    }
  }, [login]);

  function dollars(cents: number | null | undefined) {
    if (cents == null) return "$0.00";
    return `$${(cents / 100).toFixed(2)}`;
  }

  function ageMin(date: string) {
    return Math.floor(
      (new Date().getTime() - new Date(date).getTime()) / 60000
    );
  }

  if (!authorized) {
    return (
      <div className="p-10 text-white">
        <h1 className="text-xl mb-4">Admin Login</h1>
        <input
          type="password"
          className="border p-2 text-black"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          onClick={() => login()}
          className="ml-2 bg-blue-600 px-4 py-2 rounded"
        >
          {loading ? "Loading..." : "Enter"}
        </button>
      </div>
    );
  }

  if (!data) return null;

  const stalledValue = data.stalled.reduce(
    (sum, o) => sum + (o.total_amount_cents || 0),
    0
  );

  return (
    <div className="p-6 text-white space-y-10">
      <h1 className="text-2xl font-bold">Admin Orders</h1>

      <section>
        <h2 className="text-yellow-400">
          🟡 Needs Action ({data.needsAction.length})
        </h2>
        {data.needsAction.map((o) => (
          <div key={o.id}>
            {o.id} — {o.status} — {dollars(o.total_amount_cents)}
          </div>
        ))}
      </section>

      <section>
        <h2 className="text-red-400">
          🔴 Stalled (${(stalledValue / 100).toFixed(2)})
        </h2>
        {data.stalled.map((o) => (
          <div key={o.id}>
            {o.id} — {ageMin(o.created_at)} min — {dollars(o.total_amount_cents)}
          </div>
        ))}
      </section>

      <section>
        <h2 className="text-green-400">
          🟢 Pipeline ({data.pipeline.length})
        </h2>
        {data.pipeline.map((o) => (
          <div key={o.id}>
            {o.id} — {o.status} — {dollars(o.total_amount_cents)}
          </div>
        ))}
      </section>
    </div>
  );
}