import { strict as assert } from "node:assert";
import {
  classifyOperationalQueue,
  groupOperationalQueueOrders,
  type OperationalQueueOrder,
} from "./operationalQueue";
import { getNextAction } from "./getNextAction";

type MatrixCase = {
  scenario: string;
  order: OperationalQueueOrder;
  expectedBucket: ReturnType<typeof classifyOperationalQueue>["bucket"];
  expectedActionable: boolean;
  expectedNextAction?: string;
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
    scenario: "paid order waiting on customer verification information",
    order: {
      id: "matrix-information-needed",
      status: "authorized",
      payment_intent_id: "pi_information_needed",
      stripe_payment_intent_status: "requires_capture",
      verification_status: "information_needed",
      rx: verifiedRx,
      rx_status: "uploaded",
      rx_upload_path: null,
    },
    expectedBucket: "verification_pending",
    expectedActionable: false,
    expectedNextAction: "Request prescription details",
  },
  {
    scenario: "legacy uploaded status without file path",
    order: {
      id: "matrix-uploaded-status-no-path",
      status: "authorized",
      payment_intent_id: "pi_uploaded_status_no_path",
      stripe_payment_intent_status: "requires_capture",
      verification_status: "pending",
      rx_status: "uploaded",
      rx_upload_path: null,
    },
    expectedBucket: "verification_pending",
    expectedActionable: false,
    expectedNextAction: "Request prescription details",
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
    scenario: "captured Stripe payment with stale authorized order row",
    order: {
      id: "matrix-cameron-drift",
      status: "authorized",
      payment_intent_id: "pi_captured_stale_row",
      stripe_payment_intent_status: "succeeded",
      verification_status: "pending",
      fulfillment_status: "review",
      rx_status: "uploaded",
      rx: verifiedRx,
    },
    expectedBucket: "active_fulfillment",
    expectedActionable: true,
  },
  {
    scenario: "Stripe lookup failure is explicit action required",
    order: {
      id: "matrix-stripe-lookup-failed",
      status: "authorized",
      payment_intent_id: "pi_lookup_failed",
      payment_status_source: "stripe_lookup_failed",
      verification_status: "pending",
      rx: verifiedRx,
    },
    expectedBucket: "action_required",
    expectedActionable: true,
  },
  {
    scenario: "nonterminal archived order remains operationally visible",
    order: {
      id: "matrix-archived-active",
      status: "captured",
      payment_intent_id: "pi_archived_active",
      stripe_payment_intent_status: "succeeded",
      verification_status: "verified",
      fulfillment_status: "ordered",
      archived: true,
      rx: verifiedRx,
    },
    expectedBucket: "action_required",
    expectedActionable: true,
  },
  {
    scenario: "unknown fulfillment state is flagged with a reason",
    order: {
      id: "matrix-unknown-fulfillment",
      status: "captured",
      payment_intent_id: "pi_unknown_fulfillment",
      stripe_payment_intent_status: "succeeded",
      verification_status: "verified",
      fulfillment_status: "lost_between_queues",
      rx: verifiedRx,
    },
    expectedBucket: "action_required",
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
  if (classification.bucket === "action_required") {
    assert.ok(
      classification.reasons.length > 0,
      `${matrixCase.scenario} Action Required reason`,
    );
    assert.ok(
      classification.reasons.every((reason) => reason.trim().length > 0),
      `${matrixCase.scenario} Action Required reasons are explicit`,
    );
  }
  assert.equal(
    classification.operatorActionable,
    matrixCase.expectedActionable,
    `${matrixCase.scenario} actionability`,
  );
  if (matrixCase.expectedNextAction) {
    assert.equal(
      nextAction.label,
      matrixCase.expectedNextAction,
      `${matrixCase.scenario} next action`,
    );
  }

  return {
    scenario: matrixCase.scenario,
    bucket: classification.bucket,
    actionable: classification.operatorActionable ? "yes" : "no",
    nextAction: nextAction.label,
  };
});

const grouped = groupOperationalQueueOrders(cases.map((entry) => entry.order));
const assignments = Object.values(grouped).flat();
assert.equal(
  assignments.length,
  cases.length,
  "every input order has exactly one queue assignment",
);
assert.equal(
  new Set(assignments.map((order) => order.id)).size,
  cases.length,
  "no order is duplicated across queues",
);
for (const order of assignments) {
  assert.equal(
    order.operational_queue.bucket,
    Object.entries(grouped).find(([, rows]) =>
      rows.some((row) => row.id === order.id),
    )?.[0],
    `${order.id} metadata agrees with its queue`,
  );
}

const paymentDriftOrder = assignments.find(
  (order) => order.id === "matrix-cameron-drift",
);
assert.ok(
  paymentDriftOrder?.operational_queue.integrityIssues.some(
    (issue) => issue.code === "PAYMENT_STATE_DRIFT",
  ),
  "captured Stripe payment with stale local state is surfaced as integrity drift",
);

console.log("| Scenario | Bucket | Actionable | Next action |");
console.log("|---|---|---|---|");
for (const row of rows) {
  console.log(
    `| ${row.scenario} | ${row.bucket} | ${row.actionable} | ${row.nextAction} |`,
  );
}
