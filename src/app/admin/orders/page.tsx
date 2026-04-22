"use client";

import { useState, useEffect, useCallback } from "react";

type Order = {
  id: string;
  status: string;
  total_amount_cents: number | null;
  created_at: string;

  rx_upload_path?: string | null;
  rx_ocr_raw?: unknown;
  verification_status?: string | null;
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

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  /* =========================
     AUTH + LOAD
  ========================= */

  const login = useCallback(
    async (pw?: string) => {
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
    },
    [password],
  );

  useEffect(() => {
    const saved = localStorage.getItem("admin_pw");
    if (saved) {
      setTimeout(() => login(saved), 0);
    }
  }, [login]);

  /* =========================
     HELPERS
  ========================= */

  function dollars(cents: number | null | undefined) {
    if (cents == null) return "$0.00";
    return `$${(cents / 100).toFixed(2)}`;
  }

  function ageMin(date: string) {
    return Math.floor(
      (new Date().getTime() - new Date(date).getTime()) / 60000,
    );
  }

  /* =========================
     FETCH SIGNED IMAGE
  ========================= */

  async function loadImage(order: Order) {
    if (!order.rx_upload_path) return;

    if (imageUrls[order.id]) return;

    const res = await fetch("/api/admin/orders/image-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("admin_pw")}`,
      },
      body: JSON.stringify({
        path: order.rx_upload_path,
      }),
    });

    const json = await res.json();

    if (json.url) {
      setImageUrls((prev) => ({
        ...prev,
        [order.id]: json.url,
      }));
    }
  }

  function toggle(order: Order) {
    const newId = expandedId === order.id ? null : order.id;
    setExpandedId(newId);

    if (newId) {
      loadImage(order);
    }
  }

  /* =========================
     LOGIN SCREEN
  ========================= */

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
    0,
  );

  /* =========================
     ROW COMPONENT
  ========================= */

  function Row(order: Order) {
    const expanded = expandedId === order.id;

    return (
      <div
        key={order.id}
        className="border border-gray-700 rounded p-3 cursor-pointer hover:bg-gray-800"
        onClick={() => toggle(order)}
      >
        <div className="flex justify-between">
          <div className="font-mono text-sm">{order.id.slice(0, 8)}</div>

          <div>{order.status}</div>

          <div>{dollars(order.total_amount_cents)}</div>

          <div className="text-gray-400">{ageMin(order.created_at)} min</div>
        </div>

        {expanded && (
          <div className="mt-4 grid grid-cols-2 gap-6">
            {/* IMAGE */}
            <div>
              <div className="text-sm mb-2 text-gray-400">Rx Image</div>
              {imageUrls[order.id] ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrls[order.id]}
                    alt="Prescription"
                    className="max-w-full border rounded"
                  />
                </>
              ) : (
                <div className="text-gray-500">Loading image...</div>
              )}
            </div>

            {/* INTERPRETATION */}
            <div>
              <div className="text-sm mb-2 text-gray-400">Interpretation</div>

              <div className="text-xs bg-black p-2 rounded overflow-auto max-h-[400px]">
                {JSON.stringify(order.rx_ocr_raw, null, 2)}
              </div>

              <div className="mt-2 text-xs text-gray-400">
                Verification: {order.verification_status || "unknown"}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* =========================
     UI
  ========================= */

  return (
    <div className="p-6 text-white space-y-10">
      <h1 className="text-2xl font-bold">Admin Orders</h1>

      <section>
        <h2 className="text-yellow-400 mb-2">
          🟡 Needs Action ({data.needsAction.length})
        </h2>
        <div className="space-y-2">{data.needsAction.map(Row)}</div>
      </section>

      <section>
        <h2 className="text-red-400 mb-2">
          🔴 Stalled (${(stalledValue / 100).toFixed(2)})
        </h2>
        <div className="space-y-2">{data.stalled.map(Row)}</div>
      </section>

      <section>
        <h2 className="text-green-400 mb-2">
          🟢 Pipeline ({data.pipeline.length})
        </h2>
        <div className="space-y-2">{data.pipeline.map(Row)}</div>
      </section>
    </div>
  );
}
