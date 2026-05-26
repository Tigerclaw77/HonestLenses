"use client";

import { useEffect } from "react";
import { captureClientError } from "@/lib/telemetry/clientErrors";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void captureClientError(error, {
      source: "next_global_error",
      component: "app/global-error",
      digest: error.digest ?? null,
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="content-shell">
          <h1 className="upper content-title">Something went wrong</h1>
          <p className="order-error">
            We hit an unexpected error. The team has been notified.
          </p>
          <button className="primary-btn" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
