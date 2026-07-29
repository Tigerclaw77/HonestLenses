import { projectStripePaymentIntent } from "./paymentProjection";
import type { CommerceRepository } from "./repository";
import type { StripeGateway } from "./stripeGateway";
import type { PaymentProjection, PaymentRecord } from "./types";

const COMPARABLE_FIELDS = [
  "lifecycle_status",
  "currency",
  "authorized_amount_cents",
  "capturable_amount_cents",
  "captured_amount_cents",
  "refunded_amount_cents",
  "disputed_amount_cents",
  "latest_charge_id",
] as const;

function differences(
  payment: PaymentRecord,
  projection: PaymentProjection,
): string[] {
  return COMPARABLE_FIELDS.filter(
    (field) => payment[field] !== projection[field],
  );
}

export type ReconciliationResult = {
  runId: string;
  scannedCount: number;
  mismatchCount: number;
  errorCount: number;
};

export async function reconcilePayments(
  dependencies: {
    repository: CommerceRepository;
    stripe: StripeGateway;
    now?: () => Date;
  },
  options: { limit?: number; source?: string } = {},
): Promise<ReconciliationResult> {
  const now = dependencies.now ?? (() => new Date());
  const runId = await dependencies.repository.startReconciliationRun(
    options.source ?? "scheduled",
  );
  let scannedCount = 0;
  let mismatchCount = 0;
  let errorCount = 0;

  try {
    const payments = await dependencies.repository.listPaymentsForReconciliation(
      Math.min(Math.max(options.limit ?? 100, 1), 500),
    );

    for (const payment of payments) {
      scannedCount += 1;
      try {
        const intent = await dependencies.stripe.retrievePaymentIntent(
          payment.stripe_payment_intent_id,
        );
        const projection = projectStripePaymentIntent(intent, payment);
        const changedFields = differences(payment, projection);
        if (changedFields.length === 0) continue;

        mismatchCount += 1;
        await dependencies.repository.addReconciliationFinding(runId, {
          orderId: payment.order_id,
          paymentId: payment.id,
          findingType: "stripe_database_mismatch",
          severity: "warning",
          humanReason: `Stripe differs from the payment projection: ${changedFields.join(", ")}.`,
          databaseSnapshot: payment as unknown as Record<string, unknown>,
          stripeSnapshot: projection.stripe_snapshot,
        });
        const projectionObservedAt = now().toISOString();
        await dependencies.repository.applyPaymentProjection({
          orderId: payment.order_id,
          projection,
          stripeEventId: `reconciliation:${runId}:${payment.id}`,
          stripeEventCreatedAt: projectionObservedAt,
          projectionObservedAt,
        });
        await dependencies.repository.recordOrderEvent({
          orderId: payment.order_id,
          eventType: "payment_reconciled",
          actorType: "reconciliation",
          actorId: runId,
          reason: "Stripe payment truth differed from the local projection",
          eventData: { changedFields, paymentId: payment.id },
        });
      } catch {
        errorCount += 1;
        await dependencies.repository.addReconciliationFinding(runId, {
          orderId: payment.order_id,
          paymentId: payment.id,
          findingType: "stripe_retrieval_failed",
          severity: "error",
          humanReason:
            "Stripe could not be queried; the existing PaymentIntent reference was retained.",
          databaseSnapshot: payment as unknown as Record<string, unknown>,
          stripeSnapshot: null,
        });
      }
    }

    await dependencies.repository.finishReconciliationRun({
      runId,
      status: "succeeded",
      scannedCount,
      mismatchCount,
      errorCount,
    });
    return { runId, scannedCount, mismatchCount, errorCount };
  } catch (error) {
    await dependencies.repository.finishReconciliationRun({
      runId,
      status: "failed",
      scannedCount,
      mismatchCount,
      errorCount: errorCount + 1,
      errorSummary: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
