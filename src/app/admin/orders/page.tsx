"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase-client";

/* =========================
   Types
========================= */

type RxEye = {
  coreId?: string;
  sphere?: number;
  cylinder?: number;
  axis?: number;
  add?: string;
  base_curve?: number;
  color?: string;
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
  archived?: boolean;

  total_amount_cents?: number;
  sku?: string;
  box_count?: number;
  total_box_count?: number;
  od_box_count?: number;
  os_box_count?: number;

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

    const formatEye = (eye?: RxEye) => {
      if (!eye) return "—";
      const parts = [eye.coreId ?? "", `SPH ${eye.sphere ?? ""}`];
      if (eye.cylinder) parts.push(`CYL ${eye.cylinder}`);
      if (eye.axis) parts.push(`AX ${eye.axis}`);
      if (eye.add) parts.push(`ADD ${eye.add}`);
      if (eye.base_curve) parts.push(`BC ${eye.base_curve}`);
      if (eye.color) parts.push(`Color: ${eye.color}`);
      return parts.filter(Boolean).join(" | ");
    };

    return {
      od: formatEye(od),
      os: formatEye(os),
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
  const knownOrderIds = useRef<Set<string>>(new Set());
  const isInitialLoad = useRef(true);

  /* =========================
     Fetch (FIXED — no password)
  ========================= */

  async function fetchData() {
    const res = await fetch("/api/admin/orders");

    const json = await res.json();

    const combined: Order[] = [
      ...(json.needsAction ?? []),
      ...(json.stalled ?? []),
      ...(json.pipeline ?? []),
    ];

    // Detect new orders (skip notification on initial load)
    if (!isInitialLoad.current) {
      const newOrders = combined.filter((o) => !knownOrderIds.current.has(o.id));
      for (const order of newOrders) {
        const name = order.patient_name || order.patient_full_name || `${order.shipping_first_name ?? ""} ${order.shipping_last_name ?? ""}`.trim();
        const amount = formatMoney(order.total_amount_cents);
        if (Notification.permission === "granted") {
          new Notification("New Order", {
            body: `${name} - ${amount}`,
          });
        }
      }
    }

    // Update known IDs and mark initial load complete
    combined.forEach((o) => knownOrderIds.current.add(o.id));
    isInitialLoad.current = false;

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
     Notifications (request on click)
  ========================= */

  function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  /* =========================
     Order Actions
  ========================= */

  async function updateOrderStatus(orderId: string, newStatus: string) {
    await fetch(`/api/orders/${orderId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    await fetchData();
  }

  async function softDeleteOrder(orderId: string) {
    if (!confirm("Archive this order?")) return;
    await fetch(`/api/orders/${orderId}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    await fetchData();
  }

  function copyOrderText(order: Order, rx: ReturnType<typeof parseRx>): void {
    const patientName = order.patient_name || order.patient_full_name ||
      `${order.shipping_first_name ?? ""} ${order.shipping_last_name ?? ""}`.trim();
    const text = [
      `Order: ${order.id}`,
      `Customer: ${patientName}`,
      `Status: ${order.status} | Verify: ${order.verification_status}`,
      `Amount: ${formatMoney(order.total_amount_cents)}`,
      `SKU: ${order.sku ?? "—"}`,
      `Boxes: OD ${order.od_box_count ?? order.box_count ?? "—"} | OS ${order.os_box_count ?? order.box_count ?? "—"} | Total ${order.total_box_count ?? order.box_count ?? "—"}`,
      `RX OD: ${rx.od}`,
      `RX OS: ${rx.os}`,
      `Expires: ${rx.exp ?? "—"}`,
      `Dr: ${order.prescriber_name ?? "—"}`,
      `Ship to: ${order.shipping_first_name ?? ""} ${order.shipping_last_name ?? ""}`,
      order.shipping_address1,
      order.shipping_address2,
      `${order.shipping_city}, ${order.shipping_state} ${order.shipping_zip}`,
      `Phone: ${order.shipping_phone ?? "—"}`,
      `Email: ${order.shipping_email ?? "—"}`,
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(text);
  }

  /* =========================
     Render
  ========================= */

  return (
    <main style={{ padding: 20 }} onClick={requestNotificationPermission}>
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

          const flags: string[] = [];

          if (!sameName) flags.push("⚠ NAME");
          if (!o.prescriber_name && o.status === "authorized")
            flags.push("⚠ NO DR");
          if (!o.rx_upload_path && !o.prescriber_name)
            flags.push("🚨 NO VERIFY");

          const isOpen = expanded === o.id;

          // Box counts
          const odBoxes = o.od_box_count ?? o.box_count ?? "—";
          const osBoxes = o.os_box_count ?? o.box_count ?? "—";
          const totalBoxes = o.total_box_count ?? o.box_count ?? "—";
          const boxDisplay = odBoxes === osBoxes
            ? `${odBoxes} bx`
            : `OD ${odBoxes} / OS ${osBoxes} (${totalBoxes} total)`;

          return (
            <div
              key={o.id}
              style={{
                border: "1px solid rgba(148,163,184,0.2)",
                borderRadius: 12,
                padding: 14,
                background: isOpen ? "rgba(30,41,59,0.6)" : "transparent",
                opacity: o.archived ? 0.5 : 1,
              }}
            >
              {/* Summary Row - click to expand */}
              <div
                onClick={() => setExpanded(isOpen ? null : o.id)}
                style={{ cursor: "pointer" }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{patientName}</div>
                    <div>{rx.od}</div>
                    <div>{rx.os}</div>
                  </div>

                  <div>
                    {!sameName && (
                      <div style={{ fontWeight: 600 }}>{shippingName}</div>
                    )}
                    {addressLines.map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>

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
                      {o.sku ?? "—"} • {boxDisplay}
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded Content */}
              {isOpen && (
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 13,
                    opacity: 0.85,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Contact Info - selectable */}
                  <div style={{ marginBottom: 8 }}>
                    {o.shipping_phone && (
                      <div>Phone: {o.shipping_phone}</div>
                    )}
                    {o.shipping_email && (
                      <div>Email: {o.shipping_email}</div>
                    )}
                    {rx.exp && <div>Exp: {rx.exp}</div>}
                    {o.payment_intent_id && <div>PI: {o.payment_intent_id}</div>}
                  </div>

                  {/* Controls */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <select
                      value={o.status}
                      onChange={(e) => {
                        e.stopPropagation();
                        updateOrderStatus(o.id, e.target.value);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ padding: "4px 8px", borderRadius: 4 }}
                    >
                      <option value="draft">draft</option>
                      <option value="authorized">authorized</option>
                      <option value="pending">pending</option>
                      <option value="shipped">shipped</option>
                      <option value="captured">captured</option>
                      <option value="cancelled">cancelled</option>
                    </select>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyOrderText(o, rx);
                      }}
                      onClickCapture={(e) => e.stopPropagation()}
                      style={{ padding: "4px 8px", borderRadius: 4 }}
                    >
                      Copy Order
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        softDeleteOrder(o.id);
                      }}
                      onClickCapture={(e) => e.stopPropagation()}
                      style={{ padding: "4px 8px", borderRadius: 4, color: "#ef4444" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}