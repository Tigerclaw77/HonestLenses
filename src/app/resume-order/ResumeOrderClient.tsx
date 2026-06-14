"use client";

import { useState } from "react";

type ResumeOrderClientProps = {
  initialStatus?: "expired" | "invalid" | null;
};

function statusMessage(status?: "expired" | "invalid" | null): string | null {
  if (status === "expired") {
    return "That resume link has expired or was already used.";
  }
  if (status === "invalid") {
    return "That resume link could not be used.";
  }
  return null;
}

export default function ResumeOrderClient({
  initialStatus,
}: ResumeOrderClientProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(
    statusMessage(initialStatus),
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/order-recovery/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        found?: boolean;
        error?: string;
      };

      if (!res.ok) {
        setError(body.error ?? "Unable to send a resume link right now.");
        return;
      }

      setMessage(
        body.found
          ? "Check your email for a secure resume link."
          : "No unfinished orders were found for that email.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="resume-order-form" onSubmit={handleSubmit}>
      <label htmlFor="resume-email">Email address</label>
      <input
        id="resume-email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <button type="submit" className="primary-btn" disabled={loading}>
        {loading ? "Sending..." : "Send Resume Link"}
      </button>

      {message && <p className="resume-order-message">{message}</p>}
      {error && <p className="resume-order-error">{error}</p>}
    </form>
  );
}
