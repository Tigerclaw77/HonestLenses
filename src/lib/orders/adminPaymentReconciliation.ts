export type ReconciliationOrder = {
  status?: string | null;
};

export type ReconciliationDecision = {
  targetStatus: "authorized" | "captured" | "cancelled" | null;
  changed: boolean;
};

function normalized(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

export function getPaymentReconciliationDecision(
  order: ReconciliationOrder,
  stripeStatus: string | null | undefined,
): ReconciliationDecision {
  const current = normalized(order.status);
  const stripe = normalized(stripeStatus);

  const targetStatus =
    stripe === "succeeded"
      ? "captured"
      : stripe === "requires_capture"
        ? "authorized"
        : stripe === "canceled"
          ? "cancelled"
          : null;

  if (!targetStatus) return { targetStatus: null, changed: false };
  if (targetStatus === "captured" && current === "completed") {
    return { targetStatus, changed: false };
  }

  return { targetStatus, changed: current !== targetStatus };
}
