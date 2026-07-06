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

const fulfillmentShipping = {
  shipping_email: "customer@honestlenses.com",
  shipping_first_name: "Example",
  shipping_last_name: "Customer",
  shipping_address1: "123 Main St",
  shipping_city: "Dallas",
  shipping_state: "TX",
  shipping_zip: "75001",
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
      ...fulfillmentShipping,
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
      ...fulfillmentShipping,
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
      ...fulfillmentShipping,
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
    scenario: "Kelvin-style paid order waiting doctor verification",
    order: {
      id: "matrix-doctor-pending",
      status: "authorized",
      payment_intent_id: "pi_doctor_pending",
      stripe_payment_intent_status: "requires_capture",
      verification_status: "pending",
      rx_source: "doctor",
      prescriber_name: "Dr. Example",
      ...fulfillmentShipping,
    },
    expectedBucket: "active_fulfillment",
    expectedActionable: false,
  },
  {
    scenario: "paid order waiting passive verification",
    order: {
      id: "matrix-passive-pending",
      status: "authorized",
      payment_intent_id: "pi_passive_pending",
      stripe_payment_intent_status: "requires_capture",
      verification_status: "pending",
      rx: verifiedRx,
      ...fulfillmentShipping,
    },
    expectedBucket: "active_fulfillment",
    expectedActionable: false,
  },
  {
    scenario: "paid order awaiting Rx upload",
    order: {
      id: "matrix-await-rx",
      status: "authorized",
      payment_intent_id: "pi_await_rx",
      stripe_payment_intent_status: "requires_capture",
      verification_status: "pending",
      ...fulfillmentShipping,
    },
    expectedBucket: "customer_blocked",
    expectedActionable: false,
  },
  {
    scenario: "paid order awaiting shipping information",
    order: {
      id: "matrix-await-shipping",
      status: "authorized",
      payment_intent_id: "pi_await_shipping",
      stripe_payment_intent_status: "requires_capture",
      verification_status: "verified",
      rx: verifiedRx,
    },
    expectedBucket: "customer_blocked",
    expectedActionable: false,
  },
  {
    scenario: "paid order with rejected prescription",
    order: {
      id: "matrix-rejected-rx",
      status: "authorized",
      payment_intent_id: "pi_rejected_rx",
      stripe_payment_intent_status: "requires_capture",
      verification_status: "rejected",
      rx: verifiedRx,
      ...fulfillmentShipping,
    },
    expectedBucket: "customer_blocked",
    expectedActionable: false,
  },
  {
    scenario: "paid order with expired prescription",
    order: {
      id: "matrix-expired-rx",
      status: "authorized",
      payment_intent_id: "pi_expired_rx",
      stripe_payment_intent_status: "requires_capture",
      verification_status: "verified",
      rx_status: "expired",
      rx: verifiedRx,
      ...fulfillmentShipping,
    },
    expectedBucket: "customer_blocked",
    expectedActionable: false,
  },
  {
    scenario: "Lynzi-style incomplete checkout",
    order: {
      id: "matrix-incomplete-checkout",
      status: "draft",
      payment_intent_id: "pi_incomplete_checkout",
      stripe_payment_intent_status: "requires_payment_method",
      verification_status: "pending",
      rx: verifiedRx,
      ...fulfillmentShipping,
    },
    expectedBucket: "customer_blocked",
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
      ...fulfillmentShipping,
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
