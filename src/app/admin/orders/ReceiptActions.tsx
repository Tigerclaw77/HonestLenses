"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import { formatAdminDateTime } from "@/lib/admin/time";
import type { AdminReceiptType } from "@/lib/receipts/adminReceipt";

async function headers() {
  const { data: { session } } = await supabase.auth.getSession();
  return { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) };
}

export default function ReceiptActions({ orderId, email, paid }: { orderId: string; email?: string | null; paid: boolean }) {
  const [lastSent, setLastSent] = useState<Partial<Record<AdminReceiptType, string | null>>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/admin/orders/${orderId}/receipts`, { headers: await headers(), cache: "no-store" });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (active) setLastSent(data);
      } catch { if (active) setMessage("Receipt history unavailable."); }
    })();
    return () => { active = false; };
  }, [orderId]);

  async function send(type: AdminReceiptType) {
    if (sending.current) return;
    sending.current = true;
    if (!window.confirm(`Send ${type === "itemized" ? "an itemized receipt (including stored lens details)" : "a receipt"} to ${email}?`)) {
      sending.current = false;
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/receipts`, {
        method: "POST", headers: await headers(), credentials: "same-origin",
        body: JSON.stringify({ type, requestId: crypto.randomUUID(), confirmed: true }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Receipt could not be sent.");
      setLastSent(previous => ({ ...previous, [type]: result.sentAt }));
      setMessage(result.warning || `Receipt sent to ${email} (accepted by the email provider).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Send outcome unavailable. Refresh history before retrying.");
    } finally { sending.current = false; setBusy(false); }
  }

  return <section aria-label="Customer receipts" style={{ padding: 12, border: "1px solid #64748b", borderRadius: 8 }}>
    <strong>Customer receipts</strong>
    {!paid || !email ? <p>Receipts require a captured payment and customer email.</p> : <p>Send to {email}</p>}
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      {(["receipt", "itemized"] as const).map(type => <div key={type}>
        <button type="button" disabled={busy || !paid || !email} onClick={() => void send(type)}
          style={{ padding: "8px 12px", borderRadius: 6, cursor: "pointer" }}>
          {type === "receipt" ? "Send Receipt" : "Send Itemized Receipt"}
        </button>
        <div style={{ fontSize: 12, marginTop: 6 }}>Last sent: {lastSent[type] ? formatAdminDateTime(lastSent[type]!) : lastSent[type] === null ? "Never" : "Unavailable"}</div>
      </div>)}
    </div>
    <p role="status" aria-live="polite">{busy ? "Sending…" : message}</p>
  </section>;
}
