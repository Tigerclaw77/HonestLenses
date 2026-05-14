"use client";

import { useEffect } from "react";
import { captureClientException } from "@/lib/posthog/client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureClientException(error, {
      source: "next_app_error",
      digest: error.digest ?? null,
    });
  }, [error]);

  return (
    <main className="content-shell">
      <h1 className="upper content-title">Something went wrong</h1>
      <p className="order-error">
        We hit an unexpected error. The team has been notified.
      </p>
      <button className="primary-btn" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
