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
  orphaned_orders: "Orders missing from work queues",
  impossible_states: "Orders with conflicting status",
  stripe_database_mismatches: "Payment records needing review",
  missing_action_required_reasons: "Needs Attention orders missing a reason",
  webhook_failures: "Webhook processing failures",
  reconciliation_failures: "Payment reconciliation failures",
};

function OperationalHealthy() {
  return <p role="status">No operational issues detected.</p>;
}

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

  if (state.kind === "loading") return <p>Checking operational health…</p>;
  if (state.kind === "disabled") return <OperationalHealthy />;
  if (state.kind === "error") {
    return <p role="alert">Operational health is unavailable.</p>;
  }

  const issues = Object.entries(state.metrics).filter(([, count]) => count > 0);
  if (issues.length === 0) return <OperationalHealthy />;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
      }}
    >
      {issues.map(([metric, count]) => (
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
