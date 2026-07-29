import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Stripe from "stripe";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function publicStripeError(error: unknown) {
  if (!(error instanceof Error)) return { type: "unknown", code: null };
  const stripeError = error as Stripe.errors.StripeError;
  return {
    type: stripeError.type ?? error.name,
    code: stripeError.code ?? null,
    declineCode: stripeError.decline_code ?? null,
  };
}

async function expectStripeFailure(
  operation: () => Promise<unknown>,
  acceptedCodes: string[],
  acceptedTypes: string[] = [],
) {
  try {
    await operation();
  } catch (error) {
    const result = publicStripeError(error);
    assert(
      (result.code && acceptedCodes.includes(result.code)) ||
        acceptedTypes.includes(result.type),
      `Expected code ${acceptedCodes.join(", ")} or type ${acceptedTypes.join(", ")}, received ${JSON.stringify(result)}`,
    );
    return result;
  }
  throw new Error(`Expected Stripe failure: ${acceptedCodes.join(", ")}`);
}

async function main() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  const env = parseEnvFile(await readFile(envPath, "utf8"));
  const testKey = env.STRIPE_SECRET_KEY_TEST;
  assert(testKey, "STRIPE_SECRET_KEY_TEST is required");
  assert(
    testKey.startsWith("sk_test_"),
    "Refusing to run: STRIPE_SECRET_KEY_TEST is not a Stripe test-mode key",
  );

// The application Stripe clients intentionally read STRIPE_SECRET_KEY.
// Override it in this process only after proving that the dedicated source key
// is test mode. The live/default file value is never read into this variable.
process.env.STRIPE_SECRET_KEY = testKey;
process.env.COMMERCE_V2_ENABLED = "false";

const stripe = new Stripe(testKey, {
  maxNetworkRetries: 2,
  timeout: 10_000,
});
const runId = randomUUID();
const metadata = {
  security_gate: "2026-07-29",
  security_gate_run_id: runId,
  commerce_model: "legacy-test-only",
};
const createdIntentIds: string[] = [];

async function createIntent(
  parameters: Stripe.PaymentIntentCreateParams,
  idempotencyKey: string,
) {
  const intent = await stripe.paymentIntents.create(
    { ...parameters, metadata: { ...metadata, ...parameters.metadata } },
    { idempotencyKey },
  );
  createdIntentIds.push(intent.id);
  assert(!intent.livemode, `Stripe returned a live-mode object: ${intent.id}`);
  return intent;
}

const declined = await expectStripeFailure(
  () =>
    createIntent(
      {
        amount: 1_099,
        currency: "usd",
        capture_method: "manual",
        payment_method_types: ["card"],
        payment_method: "pm_card_visa_chargeDeclined",
        confirm: true,
      },
      `security-gate:${runId}:declined`,
    ),
  ["card_declined"],
);

const expired = await expectStripeFailure(
  () =>
    createIntent(
      {
        amount: 1_099,
        currency: "usd",
        capture_method: "manual",
        payment_method_types: ["card"],
        payment_method: "pm_card_chargeDeclinedExpiredCard",
        confirm: true,
      },
      `security-gate:${runId}:expired`,
    ),
  ["expired_card"],
);

const idempotencyKey = `security-gate:${runId}:idempotent-create`;
const idempotentParameters: Stripe.PaymentIntentCreateParams = {
  amount: 1_099,
  currency: "usd",
  capture_method: "manual",
  payment_method_types: ["card"],
  metadata,
};
const firstCreate = await createIntent(idempotentParameters, idempotencyKey);
const secondCreate = await stripe.paymentIntents.create(
  idempotentParameters,
  { idempotencyKey },
);
assert(firstCreate.id === secondCreate.id, "Idempotent retry created two intents");
let idempotencyTamper: ReturnType<typeof publicStripeError>;
try {
  await stripe.paymentIntents.create(
      { ...idempotentParameters, amount: 1_100 },
      { idempotencyKey },
    );
  throw new Error("Idempotency parameter tamper unexpectedly succeeded");
} catch (error) {
  idempotencyTamper = publicStripeError(error);
  assert(
    error instanceof Stripe.errors.StripeIdempotencyError ||
      (error as Stripe.errors.StripeError)?.type === "StripeIdempotencyError",
    `Expected StripeIdempotencyError, received ${JSON.stringify(idempotencyTamper)}`,
  );
}

const captureIntent = await createIntent(
  {
    amount: 1_099,
    currency: "usd",
    capture_method: "manual",
    payment_method_types: ["card"],
    payment_method: "pm_card_visa",
    confirm: true,
  },
  `security-gate:${runId}:capture-intent`,
);
assert(
  captureIntent.status === "requires_capture",
  `Expected requires_capture, received ${captureIntent.status}`,
);

const captureFailure = await expectStripeFailure(
  () =>
    stripe.paymentIntents.capture(
      captureIntent.id,
      { amount_to_capture: 1_100 },
      { idempotencyKey: `security-gate:${runId}:overcapture` },
    ),
  ["amount_too_large", "parameter_invalid_integer"],
);

const {
  captureAuthorizedOrderPayment,
  cancelOrderPayment,
} = await import("../../src/lib/payments/legacyPaymentCommands");

const captureOrder = {
  id: "aaaaaaaa-1111-4111-8111-111111111111",
  payment_intent_id: captureIntent.id,
  total_amount_cents: 1_099,
};
const firstCapture = await captureAuthorizedOrderPayment(
  captureOrder,
  "admin-verification",
);
const secondCapture = await captureAuthorizedOrderPayment(
  captureOrder,
  "admin-verification",
);
assert(!firstCapture.alreadyCaptured, "First capture was reported as duplicate");
assert(secondCapture.alreadyCaptured, "Capture retry did not converge");
const capturedIntent = await stripe.paymentIntents.retrieve(captureIntent.id, {
  expand: ["latest_charge"],
});
assert(
  capturedIntent.status === "succeeded" &&
    capturedIntent.amount_received === 1_099,
  "Capture did not produce one complete test-mode payment",
);

const refundFailure = await expectStripeFailure(
  () =>
    stripe.refunds.create(
      { payment_intent: captureIntent.id, amount: 1_100 },
      { idempotencyKey: `security-gate:${runId}:over-refund` },
    ),
  ["charge_already_refunded", "amount_too_large", "parameter_invalid_integer"],
  ["StripeInvalidRequestError"],
);
const refundIdempotencyKey = `security-gate:${runId}:partial-refund`;
const firstRefund = await stripe.refunds.create(
  { payment_intent: captureIntent.id, amount: 100 },
  { idempotencyKey: refundIdempotencyKey },
);
const secondRefund = await stripe.refunds.create(
  { payment_intent: captureIntent.id, amount: 100 },
  { idempotencyKey: refundIdempotencyKey },
);
assert(firstRefund.id === secondRefund.id, "Refund retry created two refunds");

const cancelIntent = await createIntent(
  {
    amount: 1_099,
    currency: "usd",
    capture_method: "manual",
    payment_method_types: ["card"],
    payment_method: "pm_card_visa",
    confirm: true,
  },
  `security-gate:${runId}:cancel-intent`,
);
const cancelOrder = {
  orderId: "bbbbbbbb-1111-4111-8111-111111111111",
  paymentIntentId: cancelIntent.id,
};
const firstCancel = await cancelOrderPayment(cancelOrder, "customer-cancel");
const secondCancel = await cancelOrderPayment(cancelOrder, "customer-cancel");
assert(!firstCancel.alreadyCancelled, "First cancellation was a duplicate");
assert(secondCancel.alreadyCancelled, "Cancellation retry did not converge");

const outageProbe = await createIntent(
  {
    amount: 1_099,
    currency: "usd",
    capture_method: "manual",
    payment_method_types: ["card"],
  },
  `security-gate:${runId}:outage-probe`,
);
const unreachableStripe = new Stripe(testKey, {
  protocol: "http",
  host: "127.0.0.1",
  port: "9",
  timeout: 500,
  maxNetworkRetries: 1,
});
let outageError: ReturnType<typeof publicStripeError> | null = null;
try {
  await unreachableStripe.paymentIntents.retrieve(outageProbe.id);
} catch (error) {
  outageError = publicStripeError(error);
}
assert(outageError, "Temporary Stripe outage simulation unexpectedly succeeded");
const outageProbeAfter = await stripe.paymentIntents.retrieve(outageProbe.id);
assert(
  outageProbeAfter.status === outageProbe.status,
  "Connection outage changed the PaymentIntent state",
);

const webhookSecret = `whsec_${randomBytes(32).toString("hex")}`;
const webhookPayload = JSON.stringify({
  id: `evt_security_gate_${runId.replaceAll("-", "")}`,
  object: "event",
  api_version: null,
  created: Math.floor(Date.now() / 1000),
  data: { object: capturedIntent },
  livemode: false,
  pending_webhooks: 1,
  request: { id: null, idempotency_key: null },
  type: "payment_intent.succeeded",
});
const validHeader = stripe.webhooks.generateTestHeaderString({
  payload: webhookPayload,
  secret: webhookSecret,
});
const staleHeader = stripe.webhooks.generateTestHeaderString({
  payload: webhookPayload,
  secret: webhookSecret,
  timestamp: Math.floor(Date.now() / 1000) - 600,
});
const { verifyStripeWebhook } = await import(
  "../../src/lib/commerce-v2/webhookService"
);
const verifiedEvent = verifyStripeWebhook(
  webhookPayload,
  validHeader,
  webhookSecret,
  testKey,
);
assert(!verifiedEvent.livemode, "Verified webhook event is live mode");
let invalidSignatureRejected = false;
try {
  verifyStripeWebhook(webhookPayload, `${validHeader}tampered`, webhookSecret, testKey);
} catch {
  invalidSignatureRejected = true;
}
assert(invalidSignatureRejected, "Tampered webhook signature was accepted");
let staleSignatureRejected = false;
try {
  verifyStripeWebhook(webhookPayload, staleHeader, webhookSecret, testKey);
} catch {
  staleSignatureRejected = true;
}
assert(staleSignatureRejected, "Stale webhook signature was accepted");

const { projectStripePaymentIntent } = await import(
  "../../src/lib/commerce-v2/paymentProjection"
);
const reconciledIntent = await stripe.paymentIntents.retrieve(captureIntent.id, {
  expand: ["latest_charge"],
});
const projection = projectStripePaymentIntent(reconciledIntent);
assert(
  projection.stripe_payment_intent_id === captureIntent.id &&
    projection.captured_amount_cents === 1_099 &&
    projection.refunded_amount_cents === 100 &&
    projection.lifecycle_status === "partially_refunded",
  "Stripe retrieval did not reconcile to the expected partial-refund projection",
);

for (const paymentIntentId of createdIntentIds) {
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (
    ["requires_payment_method", "requires_confirmation", "requires_action", "requires_capture"].includes(
      intent.status,
    )
  ) {
    await stripe.paymentIntents
      .cancel(paymentIntentId, undefined, {
        idempotencyKey: `security-gate:${runId}:cleanup:${paymentIntentId}`,
      })
      .catch(() => {});
  }
}

  console.log(
    JSON.stringify(
      {
        environment: {
          stripeMode: "test",
          allReturnedObjectsLivemodeFalse: true,
          commerceV2Enabled: false,
        },
        runId,
        scenarios: {
          genericDecline: declined,
          expiredCard: expired,
          idempotentCreate: {
            samePaymentIntent: firstCreate.id === secondCreate.id,
            parameterTamper: idempotencyTamper,
          },
          captureFailure,
          captureRetry: {
            firstAlreadyCaptured: firstCapture.alreadyCaptured,
            secondAlreadyCaptured: secondCapture.alreadyCaptured,
            amountReceived: capturedIntent.amount_received,
          },
          refundFailure,
          refundRetry: {
            sameRefund: firstRefund.id === secondRefund.id,
            amount: firstRefund.amount,
          },
          cancellationRetry: {
            firstAlreadyCancelled: firstCancel.alreadyCancelled,
            secondAlreadyCancelled: secondCancel.alreadyCancelled,
          },
          temporaryOutage: {
            error: outageError,
            stateUnchanged: outageProbeAfter.status === outageProbe.status,
          },
          webhookSignatures: {
            validAccepted: true,
            tamperedRejected: invalidSignatureRejected,
            staleRejected: staleSignatureRejected,
          },
          reconciliation: {
            lifecycleStatus: projection.lifecycle_status,
            capturedAmountCents: projection.captured_amount_cents,
            refundedAmountCents: projection.refunded_amount_cents,
          },
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
