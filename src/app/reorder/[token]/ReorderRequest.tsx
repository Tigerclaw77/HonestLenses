"use client";

import { useEffect, useState } from "react";
import { reorderRequestFeedback } from "@/lib/reorder/requestFeedback";

type RequestState = "idle" | "sent" | "rate-limited" | "failed";

export default function ReorderRequest({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<RequestState>("idle");
  const [retryAt, setRetryAt] = useState(0);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!retryAt) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [retryAt]);

  async function submit() {
    if (busy || remaining > 0) return;
    setBusy(true);
    try {
      const response = await fetch("/api/reorder/request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      // Provider rejection and service failure must never be presented as sent.
      const feedback = reorderRequestFeedback(response.status, response.headers.get("Retry-After"));
      setState(feedback.state);
      setRetryAt(feedback.retrySeconds ? Date.now() + feedback.retrySeconds * 1000 : 0);
    } catch {
      setState("failed");
    } finally { setBusy(false); }
  }

  return <div className="resume-order-form">
    {state === "sent" ? <div role="status" aria-live="polite" className="resume-order-message">
      <h2>Check your email</h2>
      <p>If we found a matching order, we&apos;ve sent a secure link to the email address on file.</p>
      <p>Please check your inbox and spam folder.</p>
    </div> : state === "rate-limited" ? <p role="alert" className="resume-order-error">
      Too many requests. Please wait before trying again.
    </p> : state === "failed" ? <p role="alert" className="resume-order-error">
      We couldn&apos;t request a secure link right now. Please try again.
    </p> : null}
    <button className="primary-btn reorder-request-button" type="button"
      disabled={busy || remaining > 0} onClick={submit}>
      {busy ? "Sending…" : remaining > 0 ? `Try again in ${remaining}s` :
        state === "idle" ? "Email my secure reorder link" : "Send another secure link"}
    </button>
    <style jsx>{`.reorder-request-button:disabled{opacity:1}`}</style>
  </div>;
}
