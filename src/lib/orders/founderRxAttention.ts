import { type FounderAlertType } from "@/lib/founderAlertConfig";
import {
  classifyOperationalQueue,
  type OperationalQueueOrder,
} from "@/lib/orders/operationalQueue";

export type FounderRxAttention = {
  type: FounderAlertType;
  headline: string;
  detail: string;
  dedupeSuffix?: string;
};

function priorAutomationAlertSuffix(
  order: OperationalQueueOrder,
): string | undefined {
  const status = order.rx_status?.trim() ?? "";
  const prefix = "automation_review_";
  return status.startsWith(prefix) ? status.slice(prefix.length) || undefined : undefined;
}

/**
 * Produces a safe, non-PHI founder notification from the canonical queue
 * classification.  The dashboard can retry this reconciliation without
 * changing an order, payment, supplier, or verification record.
 */
export function getFounderRxAttention(
  order: OperationalQueueOrder,
): FounderRxAttention | null {
  const queue = classifyOperationalQueue(order);
  if (queue.bucket === "founder_review") {
    return {
      type: "rx_review_required",
      headline: "Prescription needs founder review",
      detail: "An uploaded prescription is awaiting review in the secure Order Work Queue.",
      dedupeSuffix: priorAutomationAlertSuffix(order),
    };
  }

  if (queue.bucket !== "awaiting_verification") return null;

  const waitingOnPrescriber = queue.reasons.some((reason) =>
    /prescriber|doctor/i.test(reason),
  );
  if (waitingOnPrescriber) {
    return {
      type: "prescriber_verification_required",
      headline: "Prescriber verification requires attention",
      detail: "An order is awaiting prescriber verification in the secure Order Work Queue.",
      dedupeSuffix: priorAutomationAlertSuffix(order),
    };
  }

  return {
    type: "verification_attention_required",
    headline: "Prescription verification requires attention",
    detail: "An order requires prescription or verification follow-up in the secure Order Work Queue.",
  };
}
