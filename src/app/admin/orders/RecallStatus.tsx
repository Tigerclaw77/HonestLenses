"use client";

import { useCallback, useEffect, useState } from "react";

type Preview = {
  enabled: boolean; canResume: boolean; eligible: number; scheduled: number;
  suppressed: number; sent: number; failures: number; conversions: number;
  estimatedVolume: number; reasons: Record<string, number>;
  upcoming: { orderId: string; kind: string; scheduledFor: string }[];
};

export default function RecallStatus({ authHeaders }: {
  authHeaders: () => Promise<HeadersInit>;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState("");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/recall", { headers: await authHeaders(), cache: "no-store" });
      if (!response.ok) throw new Error("Recall preview unavailable.");
      setPreview(await response.json());
      setError("");
    } catch { setError("Recall preview unavailable."); }
  }, [authHeaders]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function act(action: "pause" | "resume" | "suppress") {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/recall", {
        method: "POST", headers: { ...await authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ action, orderId, confirm: action === "resume" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update recall controls.");
      setOrderId("");
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update recall controls."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Customer recall" style={{ border: "1px solid #334155", borderRadius: 10,
    padding: 14, marginBottom: 18, maxWidth: 920 }}>
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <strong>Customer recall</strong>
      <span>{preview?.enabled ? "Live sending on" : "Live sending paused"}</span>
      <button type="button" onClick={() => void refresh()} disabled={busy}>Dry-run preview</button>
      {preview?.enabled
        ? <button type="button" onClick={() => void act("pause")} disabled={busy}>Pause</button>
        : <button type="button" onClick={() => void act("resume")}
            disabled={busy || !preview?.canResume} title={!preview?.canResume ? "Compliance review is pending" : undefined}>Resume</button>}
    </div>
    {preview && <>
      <p style={{ margin: "10px 0" }}>Eligible recipients: {preview.eligible} · Scheduled: {preview.scheduled} ·
        Suppressed: {preview.suppressed} · Emails sent: {preview.sent} · Delivery failures: {preview.failures} ·
        Reminder conversions: {preview.conversions} · Estimated next 30 days: {preview.estimatedVolume}</p>
      {Object.keys(preview.reasons).length > 0 && <p>Suppression reasons: {Object.entries(preview.reasons)
        .map(([reason, count]) => `${reason.replaceAll("_", " ")}: ${count}`).join(" · ")}</p>}
      <details><summary>Upcoming reminders</summary>
        {preview.upcoming.length ? <ul>{preview.upcoming.map(item => <li key={item.orderId}>
          <a href={`/admin/orders?orderId=${encodeURIComponent(item.orderId)}`}>{item.orderId}</a>
          {` · ${item.kind} · ${new Date(item.scheduledFor).toLocaleDateString()}`}
        </li>)}</ul> : <p>None in the next 30 days.</p>}
      </details>
    </>}
    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      <input aria-label="Order ID to suppress" placeholder="Order ID to suppress" value={orderId}
        onChange={event => setOrderId(event.target.value)} style={{ minWidth: 260 }} />
      <button type="button" onClick={() => void act("suppress")} disabled={busy || !orderId.trim()}>
        Suppress customer
      </button>
    </div>
    {!preview?.canResume && <p style={{ margin: "8px 0 0" }}>Live sending awaits compliance and deliverability approval.</p>}
    {error && <p role="alert" style={{ color: "#fecaca" }}>{error}</p>}
  </section>;
}
