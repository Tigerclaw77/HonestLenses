"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function ReorderAccept() {
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function continueOrder() {
    setBusy(true);
    try {
      const response = await fetch("/api/reorder/accept", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: params.get("token") }),
      });
      const body = await response.json();
      if (!response.ok || typeof body.destination !== "string") {
        throw new Error("This link has expired or was already used. Request a fresh link from your receipt.");
      }
      window.location.assign(body.destination);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to continue reorder.");
      setBusy(false);
    }
  }
  return <div className="resume-order-form">
    <button className="primary-btn" type="button" disabled={busy} onClick={continueOrder}>
      {busy ? "Preparing your cart…" : "Review my reorder"}
    </button>
    {error && <p role="alert" className="resume-order-error">{error}</p>}
  </div>;
}
