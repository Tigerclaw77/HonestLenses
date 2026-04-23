"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";

/* =========================
   Types
========================= */

type RxEye = {
  coreId?: string;
  sphere?: number;
  base_curve?: number;
};

type RxData = {
  left?: RxEye;
  right?: RxEye;
  expires?: string;
};

type Order = {
  id: string;
  status: string;
  verification_status: string;

  total_amount_cents?: number;
  sku?: string;
  box_count?: number;
  total_box_count?: number;

  created_at?: string;

  rx: string | RxData;

  rx_upload_path?: string | null;

  prescriber_name?: string | null;

  shipping_first_name?: string | null;
  shipping_last_name?: string | null;
  shipping_phone?: string | null;
  shipping_email?: string | null;

  shipping_address1?: string | null;
  shipping_address2?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_zip?: string | null;

  patient_name?: string | null;
  patient_full_name?: string | null;

  payment_intent_id?: string | null;
};

/* =========================
   Helpers
========================= */

function formatMoney(cents?: number): string {
  if (typeof cents !== "number") return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function shortStatus(status: string): string {
  if (status === "authorized") return "AUTH";
  if (status === "captured") return "PROC";
  return status.toUpperCase();
}

function shortVerification(v: string): string {
  if (v === "auto_verified") return "AUTO";
  if (v === "pending") return "PEND";
  return v?.toUpperCase?.() ?? "";
}

function parseRx(rxRaw: string | RxData): {
  od: string;
  os: string;
  exp: string | null;
} {
  try {
    const rx: RxData = typeof rxRaw === "string" ? JSON.parse(rxRaw) : rxRaw;

    const od = rx?.right;
    const os = rx?.left;

    return {
      od: od
        ? `OD: ${od.coreId ?? ""} ${od.sphere ?? ""} | ${od.base_curve ?? ""}`
        : "OD: —",
      os: os
        ? `OS: ${os.coreId ?? ""} ${os.sphere ?? ""} | ${os.base_curve ?? ""}`
        : "OS: —",
      exp: rx?.expires ?? null,
    };
  } catch {
    return { od: "OD: —", os: "OS: —", exp: null };
  }
}

/* =========================
   Component
========================= */

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  /* =========================
     Fetch
  ========================= */

  async function fetchData() {
    const res = await fetch("/api/admin/orders", {
      headers: {
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_PASSWORD}`,
      },
    });

    const json = await res.json();

    const combined: Order[] = [
      ...(json.needsAction ?? []),
      ...(json.stalled ?? []),
      ...(json.pipeline ?? []),
    ];

    setOrders(combined);
  }

  /* =========================
     Initial Load + Realtime
  ========================= */

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!mounted) return;
      await fetchData();
    }

    init();

    const channel = supabase
      .channel("orders-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        () => {
          if (!mounted) return;
          fetchData();
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  /* =========================
     Notifications (request)
  ========================= */

  useEffect(() => {
    if (Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  }, []);

  /* =========================
     Render
  ========================= */

  return (
    <main style={{ padding: 20 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 20 }}>
        Orders
      </h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {orders.map((o) => {
          const rx = parseRx(o.rx);

          const patientName =
            o.patient_name ||
            o.patient_full_name ||
            `${o.shipping_first_name ?? ""} ${
              o.shipping_last_name ?? ""
            }`.trim();

          const shippingName = `${o.shipping_first_name ?? ""} ${
            o.shipping_last_name ?? ""
          }`.trim();

          const sameName = patientName === shippingName;

          const addressLines = [
            o.shipping_address1,
            o.shipping_address2,
            `${o.shipping_city}, ${o.shipping_state} ${o.shipping_zip}`,
          ].filter((v): v is string => Boolean(v));

          /* =========================
             Flags
          ========================= */

          const flags: string[] = [];

          if (!sameName) flags.push("⚠ NAME");
          if (!o.prescriber_name && o.status === "authorized")
            flags.push("⚠ NO DR");
          if (!o.rx_upload_path && !o.prescriber_name)
            flags.push("🚨 NO VERIFY");

          const isOpen = expanded === o.id;

          return (
            <div
              key={o.id}
              onClick={() => setExpanded(isOpen ? null : o.id)}
              style={{
                border: "1px solid rgba(148,163,184,0.2)",
                borderRadius: 12,
                padding: 14,
                cursor: "pointer",
                background: isOpen ? "rgba(30,41,59,0.6)" : "transparent",
              }}
            >
              {/* GRID ROW */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 12,
                }}
              >
                {/* COLUMN 1 */}
                <div>
                  <div style={{ fontWeight: 700 }}>{patientName}</div>
                  <div>{rx.od}</div>
                  <div>{rx.os}</div>
                </div>

                {/* COLUMN 2 */}
                <div>
                  {!sameName && (
                    <div style={{ fontWeight: 600 }}>{shippingName}</div>
                  )}
                  {addressLines.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>

                {/* COLUMN 3 */}
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {formatMoney(o.total_amount_cents)}
                  </div>

                  <div>
                    {shortStatus(o.status)} •{" "}
                    {shortVerification(o.verification_status)}{" "}
                    {flags.length > 0 && "• " + flags.join(" ")}
                  </div>

                  <div>
                    {o.sku ?? "—"} • {o.box_count ?? o.total_box_count ?? "—"}
                    bx
                  </div>
                </div>
              </div>

              {/* EXPANDED */}
              {isOpen && (
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 13,
                    opacity: 0.85,
                  }}
                >
                  {o.shipping_phone && <div>Phone: {o.shipping_phone}</div>}
                  {o.shipping_email && <div>Email: {o.shipping_email}</div>}

                  {rx.exp && <div>Exp: {rx.exp}</div>}

                  {o.payment_intent_id && <div>PI: {o.payment_intent_id}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
