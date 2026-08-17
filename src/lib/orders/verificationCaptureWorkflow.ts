export type VerificationCaptureResult = {
  paymentIntentId: string;
  alreadyCaptured: boolean;
};

export type VerificationCaptureWorkflowResult<T> =
  | {
      ok: true;
      capture: VerificationCaptureResult;
      persisted: T;
    }
  | {
      ok: false;
      stage: "capture" | "persistence";
      capture: VerificationCaptureResult | null;
    };

/**
 * Keeps the payment reconciliation and the local verified-state write as two
 * explicit steps. A retry after a successful Stripe capture may safely run the
 * persistence step again when the capture command reports alreadyCaptured.
 */
export async function runVerificationCaptureWorkflow<T>(options: {
  reconcilePayment: () => Promise<VerificationCaptureResult>;
  persistVerifiedState: () => Promise<T | null>;
}): Promise<VerificationCaptureWorkflowResult<T>> {
  let capture: VerificationCaptureResult;
  try {
    capture = await options.reconcilePayment();
  } catch {
    return { ok: false, stage: "capture", capture: null };
  }

  try {
    const persisted = await options.persistVerifiedState();
    if (!persisted) {
      return { ok: false, stage: "persistence", capture };
    }
    return { ok: true, capture, persisted };
  } catch {
    return { ok: false, stage: "persistence", capture };
  }
}
