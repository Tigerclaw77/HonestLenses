"use client";

import { useEffect, useState, useRef } from "react";
import type { CSSProperties } from "react";
import { supabase } from "@/lib/supabase-client";

/* =========================
   Types
========================= */

type RxValue = string | number | null | undefined;

type RxEye = {
  coreId?: string | null;
  sphere?: RxValue;
  cylinder?: RxValue;
  cyl?: RxValue;
  axis?: RxValue;
  add?: RxValue;
  base_curve?: RxValue;
  baseCurve?: RxValue;
  diameter?: RxValue;
  dia?: RxValue;
  brand_raw?: string | null;
  brand?: string | null;
  color?: string | null;
};

type RxData = {
  left?: RxEye | null;
  right?: RxEye | null;
  expires?: string | null;
  expirationDate?: string | null;
  expiration_date?: string | null;
  brand_raw?: string | null;
  brand?: string | null;
  lens_brand?: string | null;
  raw_text?: string | null;
  text?: string | null;
  notes?: string | null;

  // Root-level fallbacks, if OCR/AI stores them globally
  base_curve?: RxValue;
  baseCurve?: RxValue;
  diameter?: RxValue;
  dia?: RxValue;
};

type Order = {
  id: string;
  status: string;
  verification_status: string;
  rx_status?: string | null;
  archived?: boolean;

  total_amount_cents?: number;
  sku?: string;
  box_count?: number;
  total_box_count?: number;
  od_box_count?: number;
  os_box_count?: number;

  created_at?: string;

  rx: string | RxData | null;
  rx_ocr_raw?: unknown;

  rx_upload_path?: string | null;
  rx_lens_brand?: string | null;
  rx_expiration_date?: string | null;

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

type BadgeTone = "good" | "warning" | "blocked";

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

function isVerified(status?: string | null): boolean {
  return ["verified", "auto_verified", "manual_verified"].includes(
    status ?? "",
  );
}

function compareOperationalPriority(a: Order, b: Order): number {
  const aNeedsVerification = !isVerified(a.verification_status);
  const bNeedsVerification = !isVerified(b.verification_status);

  if (aNeedsVerification !== bNeedsVerification) {
    return aNeedsVerification ? -1 : 1;
  }

  const aTime = Date.parse(a.created_at ?? "") || 0;
  const bTime = Date.parse(b.created_at ?? "") || 0;
  return bTime - aTime;
}

function normalizedRxStatus(order: Order): string {
  return order.rx_status ?? (order.rx_upload_path ? "uploaded" : "none");
}

function orderHasRx(order: Order): boolean {
  const rxStatus = normalizedRxStatus(order);
  return (
    Boolean(order.rx_upload_path) ||
    rxStatus === "uploaded" ||
    rxStatus === "ocr_complete"
  );
}

function verificationPath(order: Order): { label: string; tone: BadgeTone } {
  if (orderHasRx(order)) return { label: "AUTO (Rx uploaded)", tone: "good" };
  if (order.prescriber_name)
    return { label: "DOCTOR REQUIRED", tone: "warning" };
  return { label: "BLOCKED", tone: "blocked" };
}

function paymentStatus(order: Order): { label: string; tone: BadgeTone } {
  if (order.payment_intent_id) return { label: "AUTHORIZED", tone: "good" };
  return { label: "MISSING PI", tone: "blocked" };
}

function rxTone(order: Order): BadgeTone {
  return normalizedRxStatus(order) === "none" ? "warning" : "good";
}

function verificationTone(status?: string | null): BadgeTone {
  if (isVerified(status)) return "good";
  if (status === "pending") return "warning";
  return "blocked";
}

function badgeStyle(tone: BadgeTone): CSSProperties {
  const colors = {
    good: { background: "#dcfce7", color: "#166534", border: "#86efac" },
    warning: { background: "#fef9c3", color: "#854d0e", border: "#fde68a" },
    blocked: { background: "#fee2e2", color: "#991b1b", border: "#fecaca" },
  }[tone];

  return {
    display: "inline-flex",
    alignItems: "center",
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    background: colors.background,
    color: colors.color,
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
    padding: "5px 7px",
    whiteSpace: "nowrap",
  };
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function valueText(value: unknown): string {
  return hasValue(value) ? String(value) : "-";
}

function parseRxObject(value: unknown): RxData | null {
  if (!value) return null;

  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as RxData) : null;
    } catch {
      return null;
    }
  }

  return typeof value === "object" ? (value as RxData) : null;
}

function rawRxText(value: unknown): string | null {
  if (!hasValue(value)) return null;
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function eyeValue(
  eye: RxEye | null | undefined,
  keys: (keyof RxEye)[],
): string {
  const value = keys
    .map((key) => eye?.[key])
    .find((v) => v !== null && v !== undefined && v !== "");
  return valueText(value);
}

function rootValue(rx: RxData | null, keys: (keyof RxData)[]): string {
  const value = keys
    .map((key) => rx?.[key])
    .find((v) => v !== null && v !== undefined && v !== "");
  return valueText(value);
}

function eyeValueWithRootFallback(
  eye: RxEye | null | undefined,
  eyeKeys: (keyof RxEye)[],
  rx: RxData | null,
  rootKeys: (keyof RxData)[],
): string {
  const eyeVal = eyeValue(eye, eyeKeys);
  if (eyeVal !== "-") return eyeVal;
  return rootValue(rx, rootKeys);
}

function hasEyeDetails(eye: RxEye | null | undefined): boolean {
  return [
    "sphere",
    "cylinder",
    "cyl",
    "axis",
    "add",
    "base_curve",
    "baseCurve",
    "diameter",
    "dia",
    "brand_raw",
    "brand",
  ].some((key) => hasValue(eye?.[key as keyof RxEye]));
}

function fullRxDetails(order: Order): {
  rx: RxData | null;
  hasStructured: boolean;
  raw: string | null;
  expires: string | null;
  brand: string | null;
} {
  const rx = parseRxObject(order.rx) ?? parseRxObject(order.rx_ocr_raw);
  const right = rx?.right ?? null;
  const left = rx?.left ?? null;

  const brand =
    rx?.brand ??
    rx?.brand_raw ??
    rx?.lens_brand ??
    order.rx_lens_brand ??
    right?.brand ??
    right?.brand_raw ??
    left?.brand ??
    left?.brand_raw ??
    null;

  return {
    rx,
    hasStructured: hasEyeDetails(right) || hasEyeDetails(left),
    raw: rawRxText(order.rx_ocr_raw) ?? rawRxText(order.rx),
    expires:
      rx?.expires ??
      rx?.expirationDate ??
      rx?.expiration_date ??
      order.rx_expiration_date ??
      null,
    brand,
  };
}

function parseRx(rxRaw: string | RxData | null): {
  od: string;
  os: string;
  exp: string | null;
} {
  try {
    const rx = parseRxObject(rxRaw);

    const od = rx?.right;
    const os = rx?.left;

    const formatEye = (eye?: RxEye | null) => {
      if (!eye) return "—";
      const parts = [eye.coreId ?? "", `SPH ${eye.sphere ?? ""}`];
      if (hasValue(eye.cylinder)) parts.push(`CYL ${eye.cylinder}`);
      if (hasValue(eye.cyl)) parts.push(`CYL ${eye.cyl}`);
      if (hasValue(eye.axis)) parts.push(`AX ${eye.axis}`);
      if (hasValue(eye.add)) parts.push(`ADD ${eye.add}`);
      if (hasValue(eye.base_curve)) parts.push(`BC ${eye.base_curve}`);
      if (hasValue(eye.baseCurve)) parts.push(`BC ${eye.baseCurve}`);
      if (hasValue(eye.diameter)) parts.push(`DIA ${eye.diameter}`);
      if (hasValue(eye.dia)) parts.push(`DIA ${eye.dia}`);
      if (eye.color) parts.push(`Color: ${eye.color}`);
      return parts.filter(Boolean).join(" | ");
    };

    return {
      od: formatEye(od),
      os: formatEye(os),
      exp: rx?.expires ?? rx?.expirationDate ?? rx?.expiration_date ?? null,
    };
  } catch {
    return { od: "OD: —", os: "OS: —", exp: null };
  }
}

function RxDetailsPanel({ order }: { order: Order }) {
  const details = fullRxDetails(order);
  const rows = [
    { label: "OD", eye: details.rx?.right ?? null },
    { label: "OS", eye: details.rx?.left ?? null },
  ];

  const cellStyle: CSSProperties = {
    borderBottom: "1px solid rgba(148,163,184,0.2)",
    padding: "6px 8px",
    textAlign: "left",
  };

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        border: "1px solid rgba(148,163,184,0.25)",
        borderRadius: 8,
        background: "rgba(15,23,42,0.35)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Full Rx</div>

      {details.hasStructured ? (
        <>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr>
                <th style={cellStyle}>Eye</th>
                <th style={cellStyle}>Sphere</th>
                <th style={cellStyle}>Cyl</th>
                <th style={cellStyle}>Axis</th>
                <th style={cellStyle}>Add</th>
                <th style={cellStyle}>BC</th>
                <th style={cellStyle}>DIA</th>
                <th style={cellStyle}>Brand</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ label, eye }) => (
                <tr key={label}>
                  <td style={cellStyle}>{label}</td>
                  <td style={cellStyle}>{eyeValue(eye, ["sphere"])}</td>
                  <td style={cellStyle}>
                    {eyeValue(eye, ["cylinder", "cyl"])}
                  </td>
                  <td style={cellStyle}>{eyeValue(eye, ["axis"])}</td>
                  <td style={cellStyle}>{eyeValue(eye, ["add"])}</td>
                  <td style={cellStyle}>
                    {eyeValueWithRootFallback(
                      eye,
                      ["base_curve", "baseCurve"],
                      details.rx,
                      ["base_curve", "baseCurve"],
                    )}
                  </td>
                  <td style={cellStyle}>
                    {eyeValueWithRootFallback(
                      eye,
                      ["diameter", "dia"],
                      details.rx,
                      ["diameter", "dia"],
                    )}
                  </td>
                  <td style={cellStyle}>
                    {valueText(eye?.brand ?? eye?.brand_raw ?? details.brand)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 8 }}>
            Expiration date: {valueText(details.expires)}
          </div>
          {details.brand && <div>Brand: {details.brand}</div>}
        </>
      ) : details.raw ? (
        <>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>Raw Rx (OCR)</div>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              overflowX: "auto",
              fontFamily: "monospace",
            }}
          >
            {details.raw}
          </pre>
        </>
      ) : (
        <div>No Rx details available.</div>
      )}
    </div>
  );
}

/* =========================
   Component
========================= */

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rxExpanded, setRxExpanded] = useState<string | null>(null);
  const knownOrderIds = useRef<Set<string>>(new Set());
  const isInitialLoad = useRef(true);

  async function fetchData() {
    const res = await fetch("/api/admin/orders");
    const json = await res.json();

    const combined: Order[] = [
      ...(json.needsAction ?? []),
      ...(json.stalled ?? []),
      ...(json.pipeline ?? []),
    ];

    if (!isInitialLoad.current) {
      const newOrders = combined.filter(
        (o) => !knownOrderIds.current.has(o.id),
      );

      for (const order of newOrders) {
        const name =
          order.patient_name ||
          order.patient_full_name ||
          `${order.shipping_first_name ?? ""} ${order.shipping_last_name ?? ""}`.trim();

        const amount = formatMoney(order.total_amount_cents);

        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("New Order", {
            body: `${name} - ${amount}`,
          });
        }
      }
    }

    combined.forEach((o) => knownOrderIds.current.add(o.id));
    isInitialLoad.current = false;

    setOrders(combined.sort(compareOperationalPriority));
  }

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

  function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

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
    const patientName =
      order.patient_name ||
      order.patient_full_name ||
      `${order.shipping_first_name ?? ""} ${order.shipping_last_name ?? ""}`.trim();

    const text = [
      `Order: ${order.id}`,
      `Customer: ${patientName}`,
      `Status: ${order.status} | Verify: ${order.verification_status}`,
      `Amount: ${formatMoney(order.total_amount_cents)}`,
      `SKU: ${order.sku ?? "—"}`,
      `Boxes: OD ${order.od_box_count ?? order.box_count ?? "—"} | OS ${
        order.os_box_count ?? order.box_count ?? "—"
      } | Total ${order.total_box_count ?? order.box_count ?? "—"}`,
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
    ]
      .filter(Boolean)
      .join("\n");

    navigator.clipboard.writeText(text);
  }

  return (
    <main style={{ padding: 20 }} onClick={requestNotificationPermission}>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 20 }}>
        Orders
      </h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {orders.map((o) => {
          const rx = parseRx(o.rx);
          const rxStatus = normalizedRxStatus(o);
          const payment = paymentStatus(o);
          const path = verificationPath(o);

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
          const isRxOpen = rxExpanded === o.id;

          const readyToOrder =
            Boolean(o.payment_intent_id) &&
            isVerified(o.verification_status) &&
            orderHasRx(o);

          const odBoxes = o.od_box_count ?? o.box_count ?? "—";
          const osBoxes = o.os_box_count ?? o.box_count ?? "—";
          const totalBoxes = o.total_box_count ?? o.box_count ?? "—";
          const boxDisplay =
            odBoxes === osBoxes
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

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                        margin: "8px 0",
                      }}
                    >
                      <span style={badgeStyle(payment.tone)}>
                        Payment: {payment.label}
                      </span>
                      <span style={badgeStyle(rxTone(o))}>Rx: {rxStatus}</span>
                      <span style={badgeStyle(path.tone)}>
                        Path: {path.label}
                      </span>
                      <span
                        style={badgeStyle(
                          verificationTone(o.verification_status),
                        )}
                      >
                        Verification: {o.verification_status ?? "pending"}
                      </span>
                    </div>

                    {readyToOrder && (
                      <div style={{ color: "#22c55e", fontWeight: 700 }}>
                        READY TO ORDER
                      </div>
                    )}

                    <div>
                      Order: {shortStatus(o.status)}{" "}
                      {flags.length > 0 && "| " + flags.join(" ")}
                    </div>

                    <div>
                      {o.sku ?? "—"} • {boxDisplay}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRxExpanded(isRxOpen ? null : o.id);
                      }}
                      style={{
                        marginTop: 8,
                        padding: "4px 8px",
                        borderRadius: 4,
                        border: "1px solid rgba(148,163,184,0.45)",
                        background: "transparent",
                        color: "inherit",
                        cursor: "pointer",
                      }}
                    >
                      {isRxOpen ? "Hide Rx" : "View Rx"}
                    </button>
                  </div>
                </div>
              </div>

              {isRxOpen && <RxDetailsPanel order={o} />}

              {isOpen && (
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 13,
                    opacity: 0.85,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ marginBottom: 8 }}>
                    {o.shipping_phone && <div>Phone: {o.shipping_phone}</div>}
                    {o.shipping_email && <div>Email: {o.shipping_email}</div>}
                    {rx.exp && <div>Exp: {rx.exp}</div>}
                    {o.payment_intent_id && (
                      <div>PI: {o.payment_intent_id}</div>
                    )}
                  </div>

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
                      style={{
                        padding: "4px 8px",
                        borderRadius: 4,
                        color: "#ef4444",
                      }}
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