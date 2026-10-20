"use client";

import { useState } from "react";

export default function ReorderRequest({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit() {
    setBusy(true);
    try {
      const response = await fetch("/api/reorder/request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setMessage(response.ok
        ? "If this link is available, we’ve emailed a secure checkout link to the address on file."
        : "We couldn’t send a link right now. Please try again later.");
    } catch {
      setMessage("We couldn’t send a link right now. Please try again later.");
    } finally { setBusy(false); }
  }
  return <div className="resume-order-form">
    <button className="primary-btn" type="button" disabled={busy} onClick={submit}>
      {busy ? "Sending…" : "Email my secure reorder link"}
    </button>
    {message && <p role="status" className="resume-order-message">{message}</p>}
  </div>;
}
