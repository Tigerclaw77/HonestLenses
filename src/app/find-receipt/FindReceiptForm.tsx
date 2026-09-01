"use client";

import { useState } from "react";

const NEUTRAL_MESSAGE =
  "If the order details match our records, we’ll send a secure receipt link to the checkout email.";

export default function FindReceiptForm() {
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/receipts/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber, email }),
      });
      const body = await response.json().catch(() => null);
      setMessage(response.ok ? NEUTRAL_MESSAGE : body?.error || "Please try again later.");
    } catch {
      setMessage("Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="find-receipt-form">
      <label>
        Honest Lenses order number
        <input value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} autoComplete="off" required />
      </label>
      <label>
        Checkout email address
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
      </label>
      <button type="submit" disabled={busy}>{busy ? "Sending…" : "Email my secure receipt link"}</button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
