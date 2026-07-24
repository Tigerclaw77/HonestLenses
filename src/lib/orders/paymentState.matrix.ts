import { strict as assert } from "node:assert";
import { getCaptureReadiness } from "./captureReadiness";
import { projectPaymentState, type PaymentStateOrder } from "./paymentState";

type MatrixCase = {
  scenario: string;
  order: PaymentStateOrder;
  intent?: {
    id?: string;
    status?: string;
    authorization_expires_at?: string;
  } | null;
  expectedPaymentStatus: ReturnType<typeof projectPaymentState>["status"];
  expectedCaptureReason: ReturnType<typeof getCaptureReadiness>["reason"];
  expectedCanProceed: boolean;
  expectedShouldCapture: boolean;
};

const now = new Date("2026-07-13T12:00:00.000Z");

const cases: MatrixCase[] = [
  {
    scenario: "no PaymentIntent",
    order: { status: "draft" },
    intent: null,
    expectedPaymentStatus: "draft",
    expectedCaptureReason: "missing_payment_intent",
    expectedCanProceed: false,
    expectedShouldCapture: false,
  },
  {
    scenario: "incomplete PaymentIntent",
    order: { status: "draft", payment_intent_id: "pi_incomplete" },
    intent: { id: "pi_incomplete", status: "requires_payment_method" },
    expectedPaymentStatus: "draft",
    expectedCaptureReason: "incomplete_payment",
    expectedCanProceed: false,
    expectedShouldCapture: false,
  },
  {
    scenario: "failed Stripe payment",
    order: { status: "authorized", payment_intent_id: "pi_failed" },
    intent: { id: "pi_failed", status: "payment_failed" },
    expectedPaymentStatus: "failed",
    expectedCaptureReason: "not_capturable",
    expectedCanProceed: false,
    expectedShouldCapture: false,
  },
  {
    scenario: "cancelled Stripe payment",
    order: { status: "authorized", payment_intent_id: "pi_cancelled" },
    intent: { id: "pi_cancelled", status: "canceled" },
    expectedPaymentStatus: "cancelled",
    expectedCaptureReason: "cancelled_payment",
    expectedCanProceed: false,
    expectedShouldCapture: false,
  },
  {
    scenario: "authorized requires_capture",
    order: { status: "authorized", payment_intent_id: "pi_authorized" },
    intent: { id: "pi_authorized", status: "requires_capture" },
    expectedPaymentStatus: "authorized",
    expectedCaptureReason: "requires_capture",
    expectedCanProceed: true,
    expectedShouldCapture: true,
  },
  {
    scenario: "captured succeeded",
    order: { status: "captured", payment_intent_id: "pi_succeeded" },
    intent: { id: "pi_succeeded", status: "succeeded" },
    expectedPaymentStatus: "captured",
    expectedCaptureReason: "already_captured",
    expectedCanProceed: true,
    expectedShouldCapture: false,
  },
  {
    scenario: "stale local draft with current Stripe authorization",
    order: { status: "draft", payment_intent_id: "pi_stale_authorized" },
    intent: { id: "pi_stale_authorized", status: "requires_capture" },
    expectedPaymentStatus: "authorized",
    expectedCaptureReason: "requires_capture",
    expectedCanProceed: true,
    expectedShouldCapture: true,
  },
  {
    scenario: "expired authorization",
    order: { status: "authorized", payment_intent_id: "pi_expired" },
    intent: {
      id: "pi_expired",
      status: "requires_capture",
      authorization_expires_at: "2026-07-13T11:59:59.000Z",
    },
    expectedPaymentStatus: "authorized",
    expectedCaptureReason: "authorization_expired",
    expectedCanProceed: false,
    expectedShouldCapture: false,
  },
];

const rows = cases.map((matrixCase) => {
  const payment = projectPaymentState(matrixCase.order, {
    stripeIntent: matrixCase.intent,
    fallback: "intent_authorized",
  });
  const capture = getCaptureReadiness(matrixCase.order, matrixCase.intent, {
    now,
  });

  assert.equal(
    payment.status,
    matrixCase.expectedPaymentStatus,
    `${matrixCase.scenario} payment status`,
  );
  assert.equal(
    capture.reason,
    matrixCase.expectedCaptureReason,
    `${matrixCase.scenario} capture reason`,
  );
  assert.equal(
    capture.canProceed,
    matrixCase.expectedCanProceed,
    `${matrixCase.scenario} can proceed`,
  );
  assert.equal(
    capture.shouldCapture,
    matrixCase.expectedShouldCapture,
    `${matrixCase.scenario} should capture`,
  );

  return {
    scenario: matrixCase.scenario,
    payment: payment.status,
    captureReason: capture.reason,
    canProceed: capture.canProceed ? "yes" : "no",
    shouldCapture: capture.shouldCapture ? "yes" : "no",
  };
});

console.log("| Scenario | Payment | Capture reason | Can proceed | Should capture |");
console.log("|---|---|---|---|---|");
for (const row of rows) {
  console.log(
    `| ${row.scenario} | ${row.payment} | ${row.captureReason} | ${row.canProceed} | ${row.shouldCapture} |`,
  );
}
