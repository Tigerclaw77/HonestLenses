"use client";

import { useState } from "react";
import type { ReminderAction } from "@/lib/reorder/tokens";

const labels: Record<ReminderAction, string> = {
  postpone_30: "Remind me in 30 days", postpone_60: "Remind me in 60 days",
  postpone_90: "Remind me in 90 days", custom: "Save reminder date",
  stop: "Stop reminders",
};

export default function ReminderControl({ action, token }: { action: ReminderAction; token: string }) {
  const [date, setDate] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const response = await fetch("/api/reminders/control", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, token, date }),
      });
      const result = await response.json();
      setMessage(result.message ?? result.error ?? "Unable to update reminders.");
    } catch { setMessage("Unable to update reminders."); }
    finally { setBusy(false); }
  }
  return <div className="resume-order-form">
    {action === "custom" && <label>Reminder date
      <input type="date" value={date} onChange={event => setDate(event.target.value)} />
    </label>}
    <button className="primary-btn" type="button" onClick={save} disabled={busy || (action === "custom" && !date)}>
      {busy ? "Saving…" : labels[action]}
    </button>
    {message && <p role="status">{message}</p>}
  </div>;
}
