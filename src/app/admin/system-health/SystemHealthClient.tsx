"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";

type Metrics = Record<
  | "orphaned_orders"
  | "impossible_states"
  | "stripe_database_mismatches"
  | "missing_action_required_reasons"
  | "webhook_failures"
  | "reconciliation_failures",
  number
>;

type OrderIntegrityIssue = {
  orderId: string;
  customerName: string;
  message: string;
};

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
    | {
        kind: "ready";
        metrics: Metrics | null;
        orderIssues: OrderIntegrityIssue[];
        checksUnavailable: boolean;
      }
    | { kind: "error" }
  >({ kind: "loading" });

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        const headers: HeadersInit = data.session?.access_token
          ? { Authorization: `Bearer ${data.session.access_token}` }
          : {};
        const [healthResponse, ordersResponse] = await Promise.all([
          fetch("/api/admin/system-health", {
            cache: "no-store",
            credentials: "same-origin",
            headers,
          }),
          fetch("/api/admin/orders", {
            cache: "no-store",
            credentials: "same-origin",
            headers,
          }),
        ]);
        const healthBody = (await healthResponse.json()) as {
          enabled?: boolean;
          metrics?: Metrics;
        };
        const ordersBody = (await ordersResponse.json()) as {
          integrity_issues?: OrderIntegrityIssue[];
        };

        if (!healthResponse.ok && !ordersResponse.ok) {
          throw new Error("Operational health is unavailable");
        }

        return {
          kind: "ready",
          metrics:
            healthResponse.ok && healthBody.enabled && healthBody.metrics
              ? healthBody.metrics
              : null,
          orderIssues: ordersResponse.ok
            ? (ordersBody.integrity_issues ?? [])
            : [],
          checksUnavailable: !healthResponse.ok || !ordersResponse.ok,
        } as const;
      })
      .then((next) => {
        if (active) setState(next);
      })
      .catch((error: unknown) => {
        if (active) {
          void error;
          setState({ kind: "error" });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (state.kind === "loading") return <p>Checking operational health…</p>;
  if (state.kind === "error") {
    return <p role="alert">Operational health is unavailable.</p>;
  }

  const metricIssues = state.metrics
    ? Object.entries(state.metrics).filter(([, count]) => count > 0)
    : [];
  if (
    metricIssues.length === 0 &&
    state.orderIssues.length === 0 &&
    !state.checksUnavailable
  ) {
    return <OperationalHealthy />;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
      }}
    >
      {state.checksUnavailable && (
        <p role="alert" style={{ gridColumn: "1 / -1" }}>
          Some operational checks are unavailable.
        </p>
      )}
      {state.orderIssues.map((issue) => (
        <article
          key={`${issue.orderId}:${issue.message}`}
          style={{
            border: "1px solid rgba(251,191,36,0.34)",
            borderRadius: 10,
            padding: 16,
            background: "rgba(120,53,15,0.2)",
          }}
        >
          <strong>{issue.customerName}</strong>
          <div style={{ color: "#fde68a", fontSize: 13, marginTop: 8 }}>
            {issue.message}
          </div>
        </article>
      ))}
      {metricIssues.map(([metric, count]) => (
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
