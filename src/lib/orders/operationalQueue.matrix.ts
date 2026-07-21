import { strict as assert } from "node:assert";
import { classifyOperationalQueue, type OperationalQueueOrder } from "./operationalQueue";
import { getNextAction } from "./getNextAction";

type MatrixCase = {
  scenario: string;
  order: OperationalQueueOrder;
  expectedBucket: ReturnType<typeof classifyOperationalQueue>["bucket"];
  expectedActionable: boolean;
};

const verifiedRx = {
  right: { coreId: "OASYS_1D", sphere: "-1.00" },
  left: { coreId: "OASYS_1D", sphere: "-1.25" },
};

const cases: MatrixCase[] = [
  {
    scenario: "local draft + Stripe requires_capture",
    order: {
      id: "matrix-requires-capture",
      status: "draft",
      payment_intent_id: "pi_requires_capture",
      stripe_payment_intent_status: "requires_capture",
      verification_status: "verified",
      rx: verifiedRx,
    },
    expectedBucket: "active_fulfillment",
    expectedActionable: true,
  },
  {
    scenario: "local draft + Stripe succeeded",
    order: {
      id: "matrix-succeeded",
      status: "draft",
      payment_intent_id: "pi_succeeded",
      stripe_payment_intent_status: "succeeded",
      verification_status: "verified",
      rx: verifiedRx,
    },
    expectedBucket: "active_fulfillment",
    expectedActionable: true,
  },
  {
    scenario: "local draft + Stripe incomplete",
    order: {
      id: "matrix-incomplete",
      status: "draft",
      payment_intent_id: "pi_incomplete",
      stripe_payment_intent_status: "incomplete",
      verification_status: "verified",
      rx: verifiedRx,
    },
    expectedBucket: "customer_blocked",
    expectedActionable: false,
  },
  {
    scenario: "unpaid order awaiting checkout",
    order: {
      id: "matrix-await-checkout",
      status: "draft",
      verification_status: "pending",
    },
    expectedBucket: "customer_blocked",
    expectedActionable: false,
  },
  {
    scenario: "paid order waiting doctor verification",
    order: {
      id: "matrix-doctor-pending",
      status: "authorized",
      payment_intent_id: "pi_doctor_pending",
      stripe_payment_intent_status: "requires_capture",
      verification_status: "pending",
      rx_source: "doctor",
      prescriber_name: "Dr. Example",
    },
    expectedBucket: "verification_pending",
    expectedActionable: false,
  },
  {
    scenario: "paid verified order not fulfilled",
    order: {
      id: "matrix-ready-to-order",
      status: "captured",
      payment_intent_id: "pi_captured",
      stripe_payment_intent_status: "succeeded",
      verification_status: "verified",
      fulfillment_status: "review",
      rx: verifiedRx,
    },
    expectedBucket: "active_fulfillment",
    expectedActionable: true,
  },
  {
    scenario: "captured order with hard-bounced customer email",
    order: {
      id: "matrix-email-bounced",
      status: "captured",
      payment_intent_id: "pi_email_bounced",
      stripe_payment_intent_status: "succeeded",
      verification_status: "verified",
      fulfillment_status: "review",
      rx: verifiedRx,
      email_delivery_status: "bounced",
      email_delivery_requires_attention: true,
    },
    expectedBucket: "action_required",
    expectedActionable: true,
  },
  {
    scenario: "delivered email does not alter fulfillment placement",
    order: {
      id: "matrix-email-delivered",
      status: "captured",
      payment_intent_id: "pi_email_delivered",
      stripe_payment_intent_status: "succeeded",
      verification_status: "verified",
      fulfillment_status: "review",
      rx: verifiedRx,
      email_delivery_status: "delivered",
      email_delivery_requires_attention: false,
    },
    expectedBucket: "active_fulfillment",
    expectedActionable: true,
  },
  {
    scenario: "test/internal order",
    order: {
      id: "matrix-test",
      status: "draft",
      verification_status: "pending",
      admin_notes: "Internal test order",
    },
    expectedBucket: "draft_or_test",
    expectedActionable: false,
  },
];

const rows = cases.map((matrixCase) => {
  const classification = classifyOperationalQueue(matrixCase.order);
  const nextAction = getNextAction(matrixCase.order);

  assert.equal(
    classification.bucket,
    matrixCase.expectedBucket,
    `${matrixCase.scenario} bucket`,
  );
  assert.equal(
    classification.operatorActionable,
    matrixCase.expectedActionable,
    `${matrixCase.scenario} actionability`,
  );

  return {
    scenario: matrixCase.scenario,
    bucket: classification.bucket,
    actionable: classification.operatorActionable ? "yes" : "no",
    nextAction: nextAction.label,
  };
});

console.log("| Scenario | Bucket | Actionable | Next action |");
console.log("|---|---|---|---|");
for (const row of rows) {
  console.log(
    `| ${row.scenario} | ${row.bucket} | ${row.actionable} | ${row.nextAction} |`,
  );
}
