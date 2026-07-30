"use client";

import { useEffect, useState } from "react";

type Metrics = Record<
  | "orphaned_orders"
  | "impossible_states"
  | "stripe_database_mismatches"
  | "missing_action_required_reasons"
  | "webhook_failures"
  | "reconciliation_failures",
  number
>;

const LABELS: Record<keyof Metrics, string> = {
  orphaned_orders: "Orphaned orders",
  impossible_states: "Impossible states",
  stripe_database_mismatches: "Stripe/database mismatches",
  missing_action_required_reasons: "Missing Resolve Exception reasons",
  webhook_failures: "Webhook failures",
  reconciliation_failures: "Reconciliation failures",
};

export default function SystemHealthClient() {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "disabled" }
    | { kind: "ready"; metrics: Metrics }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let active = true;
    fetch("/api/admin/system-health", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as {
          enabled?: boolean;
          metrics?: Metrics;
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? "Health query failed");
        if (!body.enabled || !body.metrics) return { kind: "disabled" } as const;
        return { kind: "ready", metrics: body.metrics } as const;
      })
      .then((next) => {
        if (active) setState(next);
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            kind: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (state.kind === "loading") return <p>Loading system health…</p>;
  if (state.kind === "disabled") {
    return (
      <p>
        Commerce v2 is staged but disabled. Apply the reviewed migration before
        setting <code>COMMERCE_V2_ENABLED=true</code>.
      </p>
    );
  }
  if (state.kind === "error") {
    return <p role="alert">{state.message}</p>;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
      }}
    >
      {Object.entries(state.metrics).map(([metric, count]) => (
        <article
          key={metric}
          style={{
            border: "1px solid rgba(148,163,184,0.22)",
            borderRadius: 10,
            padding: 16,
            background: "rgba(15,23,42,0.72)",
          }}
        >
          <div style={{ color: "#94a3b8", fontSize: 13 }}>
            {LABELS[metric as keyof Metrics]}
          </div>
          <strong style={{ display: "block", fontSize: 30, marginTop: 8 }}>
            {count}
          </strong>
        </article>
      ))}
    </div>
  );
}
