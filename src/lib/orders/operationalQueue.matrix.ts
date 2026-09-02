import { strict as assert } from "node:assert";
import {
  ADMIN_WORK_QUEUE_SECTIONS,
  classifyOperationalQueue,
  getLastOperationalActivity,
  groupOperationalQueueOrders,
  isMeaningfulOperationalActivityEvent,
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

assert.deepEqual(
  ADMIN_WORK_QUEUE_SECTIONS.map(({ key, title }) => ({ key, title })),
  [
    {
      key: "awaiting_verification",
      title: "Needs Verification",
    },
    {
      key: "founder_review",
      title: "AUTHORIZED — RX REVIEW REQUIRED",
    },
    {
      key: "ready_to_order",
      title: "Ready to Place",
    },
    {
      key: "resolve_exception",
      title: "Needs Attention",
    },
  ],
  "the admin dashboard exposes exactly the three approved work-queue groups",
);

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
    expectedBucket: "ready_to_order",
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
    expectedBucket: "resolve_exception",
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
    expectedBucket: "awaiting_verification",
    expectedActionable: true,
  },
  {
    scenario: "authorized customer upload needs founder review",
    order: {
      id: "matrix-upload-founder-review",
      status: "authorized",
      payment_intent_id: "pi_uploaded_founder_review",
      stripe_payment_intent_status: "requires_capture",
      verification_status: "pending",
      rx_status: "uploaded_pending_review",
      rx_upload_path: "rx/matrix-upload-founder-review/rx.png",
    },
    expectedBucket: "founder_review",
    expectedActionable: true,
    expectedNextAction: "Review uploaded prescription",
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
    expectedBucket: "awaiting_verification",
    expectedActionable: true,
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
    expectedBucket: "awaiting_verification",
    expectedActionable: true,
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
    expectedBucket: "ready_to_order",
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
    expectedBucket: "resolve_exception",
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
    expectedBucket: "ready_to_order",
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
    expectedBucket: "resolve_exception",
    expectedActionable: true,
  },
  {
    scenario: "Stripe lookup failure remains diagnostic, not founder work",
    order: {
      id: "matrix-stripe-lookup-failed",
      status: "authorized",
      payment_intent_id: "pi_lookup_failed",
      payment_status: "authorized",
      payment_status_source: "stripe_lookup_failed",
      verification_status: "pending",
      rx: verifiedRx,
    },
    expectedBucket: "awaiting_verification",
    expectedActionable: true,
  },
  {
    scenario: "completed historical payment drift stays out of active work",
    order: {
      id: "matrix-completed-historical-drift",
      status: "completed",
      payment_intent_id: "pi_completed_historical_drift",
      stripe_payment_intent_status: "requires_capture",
      verification_status: "pending",
      fulfillment_status: "completed",
      rx: verifiedRx,
    },
    expectedBucket: "history_archive",
    expectedActionable: false,
  },
  {
    scenario: "coherent supplier-managed archive stays quiet",
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
    expectedBucket: "history_archive",
    expectedActionable: false,
  },
  {
    scenario: "Foelster authorized pending review remains visible and actionable",
    order: {
      id: "b1e22cc9-0a06-4b49-ae0a-83c2592aa89f",
      status: "authorized",
      payment_intent_id: "pi_3UB0TXJNXXlFCfrS0TqAkDdq",
      stripe_payment_intent_status: "requires_capture",
      verification_status: "pending",
      rx_status: "manual",
      rx_source: "manual",
      prescriber_name: "Costco Vision",
      prescriber_phone: "5302228142",
      fulfillment_status: "review",
      archived: false,
    },
    expectedBucket: "awaiting_verification",
    expectedActionable: true,
  },
  {
    scenario: "recent archived uncaptured order is recoverable",
    order: {
      id: "matrix-recent-archived-uncaptured",
      status: "authorized",
      payment_intent_id: "pi_recent_archived",
      stripe_payment_intent_status: "requires_capture",
      verification_status: "pending",
      fulfillment_status: "review",
      archived: true,
      archived_at: new Date().toISOString(),
      rx: verifiedRx,
    },
    expectedBucket: "resolve_exception",
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
    expectedBucket: "resolve_exception",
    expectedActionable: true,
  },
  {
    scenario: "normal supplier-ordered order is owned by Armory",
    order: {
      id: "matrix-ordered-armory",
      status: "captured",
      payment_intent_id: "pi_ordered_armory",
      stripe_payment_intent_status: "succeeded",
      verification_status: "verified",
      fulfillment_status: "ordered",
      rx: verifiedRx,
    },
    expectedBucket: "supplier_managed",
    expectedActionable: false,
  },
  {
    scenario: "normal shipped order remains outside the founder queue",
    order: {
      id: "matrix-shipped-armory",
      status: "captured",
      payment_intent_id: "pi_shipped_armory",
      stripe_payment_intent_status: "succeeded",
      verification_status: "verified",
      fulfillment_status: "shipped",
      rx: verifiedRx,
    },
    expectedBucket: "supplier_managed",
    expectedActionable: false,
  },
  {
    scenario: "backorder without founder action remains with Armory",
    order: {
      id: "matrix-backordered-armory",
      status: "captured",
      payment_intent_id: "pi_backordered_armory",
      stripe_payment_intent_status: "succeeded",
      verification_status: "verified",
      fulfillment_status: "backordered",
      rx: verifiedRx,
    },
    expectedBucket: "supplier_managed",
    expectedActionable: false,
  },
  {
    scenario: "Armory exception with a specific founder reason returns to queue",
    order: {
      id: "matrix-armory-founder-exception",
      status: "captured",
      payment_intent_id: "pi_armory_exception",
      stripe_payment_intent_status: "succeeded",
      verification_status: "verified",
      fulfillment_status: "ordered",
      admin_notes:
        "Armory exception: Supplier requires founder approval for a product substitution.",
      rx: verifiedRx,
    },
    expectedBucket: "resolve_exception",
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
  if (classification.bucket === "resolve_exception") {
    assert.ok(
      classification.reasons.length > 0,
      `${matrixCase.scenario} Needs Attention reason`,
    );
    assert.ok(
      classification.reasons.every(
        (reason) =>
          reason.trim().length >= 20 &&
          ![
            "hold",
            "review prescription",
            "verify prescription",
            "fulfillment",
          ].includes(reason.trim().toLowerCase()),
      ),
      `${matrixCase.scenario} Needs Attention reasons are specific and human-readable`,
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
const historicalPaymentDriftOrder = assignments.find(
  (order) => order.id === "matrix-completed-historical-drift",
);

for (const order of assignments) {
  if (order.operational_queue.operatorActionable) {
    assert.ok(
      [
        "awaiting_verification",
        "founder_review",
        "ready_to_order",
        "resolve_exception",
      ].includes(order.operational_queue.bucket),
      `${order.id} requiring founder action cannot disappear from the active dashboard`,
    );
  }
}

for (const orderId of [
  "matrix-ordered-armory",
  "matrix-shipped-armory",
  "matrix-backordered-armory",
]) {
  const order = assignments.find((candidate) => candidate.id === orderId);
  assert.equal(
    order?.operational_queue.bucket,
    "supplier_managed",
    `${orderId} does not clutter the active dashboard`,
  );
}
assert.ok(
  paymentDriftOrder?.operational_queue.integrityIssues.some(
    (issue) => issue.code === "PAYMENT_STATE_DRIFT",
  ),
  "captured Stripe payment with stale local state is surfaced as integrity drift",
);
assert.ok(
  historicalPaymentDriftOrder?.operational_queue.integrityIssues.some(
    (issue) => issue.code === "PAYMENT_STATE_DRIFT",
  ),
  "historical payment drift remains available as a diagnostic",
);

assert.deepEqual(
  getLastOperationalActivity({
    created_at: "2025-01-01T12:00:00.000Z",
    updated_at: "2026-07-30T18:00:00.000Z",
  }),
  {
    at: "2025-01-01T12:00:00.000Z",
    reason: "Order created",
  },
  "bulk migration updates do not become operational activity",
);

assert.deepEqual(
  getLastOperationalActivity({
    created_at: "2025-01-01T12:00:00.000Z",
    updated_at: "2026-07-30T18:00:00.000Z",
    verification_details_submitted_at: "2025-01-02T09:00:00.000Z",
  }),
  {
    at: "2025-01-02T09:00:00.000Z",
    reason: "Verification details submitted",
  },
  "the latest meaningful operational timestamp is displayed",
);

assert.equal(
  isMeaningfulOperationalActivityEvent({
    event_type: "payment_projection_applied",
  }),
  false,
  "projection rebuilds are not operational activity",
);
assert.equal(
  isMeaningfulOperationalActivityEvent({ event_type: "payment_reconciled" }),
  false,
  "background reconciliation is not operational activity",
);
assert.equal(
  isMeaningfulOperationalActivityEvent({
    event_type: "verification_phone_attempted",
  }),
  true,
  "founder verification work is operational activity",
);
assert.deepEqual(
  getLastOperationalActivity(
    { created_at: "2025-01-01T12:00:00.000Z" },
    {
      event_type: "payment_projection_applied",
      created_at: "2026-07-30T18:00:00.000Z",
    },
  ),
  { at: "2025-01-01T12:00:00.000Z", reason: "Order created" },
  "background-only events do not replace the last meaningful activity",
);

console.log("| Scenario | Bucket | Actionable | Next action |");
console.log("|---|---|---|---|");
for (const row of rows) {
  console.log(
    `| ${row.scenario} | ${row.bucket} | ${row.actionable} | ${row.nextAction} |`,
  );
}
