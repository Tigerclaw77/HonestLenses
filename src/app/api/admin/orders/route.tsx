"use client";

import { useState, useEffect, useCallback } from "react";

// =========================
// TYPES
// =========================
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

// =========================
// COMPONENT
// =========================
export default function AdminOrdersPage() {
  const [password, setPassword] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(false);

  // =========================
  // LOGIN (stable)
  // =========================
  const login = useCallback(
    async (pw?: string) => {
      const usePw = pw || password;
      if (!usePw) return;

      setLoading(true);

      try {
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

        if (!res.ok) {
          alert("Server error");
          setLoading(false);
          return;
        }

        const json: AdminData = await res.json();

        setData(json);
        setAuthorized(true);

        localStorage.setItem("admin_pw", usePw);
      } catch (err) {
        console.error("LOGIN ERROR:", err);
        alert("Network error");
      }

      setLoading(false);
    },
    [password],
  );

  // =========================
  // AUTO-LOGIN
  // =========================
  useEffect(() => {
    const saved = localStorage.getItem("admin_pw");
    if (!saved) return;

    setTimeout(() => {
      login(saved);
    }, 0);
  }, [login]);

  // =========================
  // HELPERS
  // =========================
  function dollars(cents: number | null | undefined): string {
    if (cents == null) return "$0.00";
    return `$${(cents / 100).toFixed(2)}`;
  }

  function ageMin(date: string | null | undefined): number {
    if (!date) return 0;
    return Math.floor(
      (new Date().getTime() - new Date(date).getTime()) / 60000,
    );
  }

  // =========================
  // LOGIN SCREEN
  // =========================
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
          disabled={loading}
          className="ml-2 bg-blue-600 px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? "Loading..." : "Enter"}
        </button>
      </div>
    );
  }

  // =========================
  // DATA GUARD
  // =========================
  if (!data) return null;

  // =========================
  // METRICS
  // =========================
  const stalledValue = data.stalled.reduce(
    (sum, o) => sum + (o.total_amount_cents || 0),
    0,
  );

  // =========================
  // DASHBOARD
  // =========================
  return (
    <div className="p-6 text-white space-y-10">
      <h1 className="text-2xl font-bold">Admin Orders</h1>

      {/* 🟡 NEEDS ACTION */}
      <section>
        <h2 className="text-xl text-yellow-400 mb-3">
          🟡 Needs Action ({data.needsAction.length})
        </h2>

        {data.needsAction.map((o) => (
          <div key={o.id} className="border p-3 rounded mb-2">
            <div>ID: {o.id}</div>
            <div>Status: {o.status}</div>
            <div>{dollars(o.total_amount_cents)}</div>
          </div>
        ))}
      </section>

      {/* 🔴 STALLED */}
      <section>
        <h2 className="text-xl text-red-400 mb-3">
          🔴 Stalled (${(stalledValue / 100).toFixed(2)}) ({data.stalled.length}
          )
        </h2>

        {data.stalled.map((o) => (
          <div key={o.id} className="border p-3 rounded mb-2">
            <div>ID: {o.id}</div>
            <div>Age: {ageMin(o.created_at)} min</div>
            <div>{dollars(o.total_amount_cents)}</div>
          </div>
        ))}
      </section>

      {/* 🟢 PIPELINE */}
      <section>
        <h2 className="text-xl text-green-400 mb-3">
          🟢 Pipeline ({data.pipeline.length})
        </h2>

        {data.pipeline.map((o) => (
          <div key={o.id} className="border p-3 rounded mb-2">
            <div>ID: {o.id}</div>
            <div>Status: {o.status}</div>
            <div>{dollars(o.total_amount_cents)}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
