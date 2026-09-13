import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateUploadedRxAutomation,
  isCompletedUploadedRxFinalization,
  runUploadedRxAutomation,
  uploadedRxFinalizationAllowedOrderStatuses,
  uploadedRxFinalizationOutcome,
  uploadedRxReviewStatus,
  UPLOADED_RX_CAPTURE_FAILURE_CODE,
  type UploadedRxAutomationOrder,
} from "./uploadedRxAutomation";

const NOW = new Date("2026-08-11T12:00:00.000Z");

function validOrder() {
  return {
    id: "00000000-0000-4000-8000-000000000099",
    rx_upload_path: "rx/order/prescription.jpg",
    rx_status: "uploaded_customer_confirmed",
    patient_name: "India Guerrero",
    prescriber_name: "Dr. Avery Smith",
    prescriber_phone: "312-555-0100",
    rx: {
      expires: "2027-05-01",
      right: {
        coreId: "OASYS_MAX_1D",
        sphere: -2.5,
        base_curve: 8.5,
      },
      left: {
        coreId: "OASYS_MAX_1D",
        sphere: -2.75,
        base_curve: 8.5,
      },
    },
    rx_ocr_raw: {
      right: {
        sphere: -2.5,
        cylinder: null as number | null,
        axis: null as number | null,
        add: null,
        baseCurve: 8.5,
        diameter: 14.3,
        brand_raw: "ACUVUE OASYS MAX 1-Day",
      },
      left: {
        sphere: -2.75,
        cylinder: null as number | null,
        axis: null as number | null,
        add: null,
        baseCurve: 8.5,
        diameter: 14.3,
        brand_raw: "ACUVUE OASYS MAX 1-Day",
      },
      expirationDate: "2027-05-01",
      patient_name: "India Guerrero",
      doctor_name: "Avery Smith",
      prescriber_phone: "(312) 555-0100",
      confidence: 0.99,
      looks_like_contact_lens_rx: true,
      notes: null as string | null,
    },
  };
}

function mutate(
  callback: (order: ReturnType<typeof validOrder>) => void,
): UploadedRxAutomationOrder {
  const order = structuredClone(validOrder());
  callback(order);
  return order;
}

const valid = evaluateUploadedRxAutomation(
  validOrder(),
  "requires_capture",
  NOW,
);
assert.equal(valid.autoVerify, true, "clean confirmed OCR evidence auto-verifies");
assert.equal(valid.reason, "all_checks_passed");

const moistProductionShape: UploadedRxAutomationOrder = {
  id: "3b5b0bde-e584-469a-8117-c9749c1ff584",
  sku: "MOIST_90",
  rx_upload_path: "rx/order/acuvue-moist.jpg",
  rx_status: "uploaded_customer_confirmed",
  patient_name: "Collazo Coca, Naomi",
  prescriber_name: "Gregory Popowitz, OD",
  prescriber_phone: "5178860222",
  rx: {
    expires: "2027-01-22",
    right: { coreId: "MOIST", sphere: -3.25, base_curve: 9, diameter: 14.2 },
    left: { coreId: "MOIST", sphere: -4, base_curve: 9, diameter: 14.2 },
  },
  rx_ocr_raw: {
    right: {
      sphere: -3.25,
      cylinder: null,
      axis: null,
      add: null,
      baseCurve: 9,
      diameter: 14.2,
      brand_raw: "ACUVUE 1 DAY MOIST 90 PACK",
    },
    left: {
      sphere: -4,
      cylinder: null,
      axis: null,
      add: null,
      baseCurve: 9,
      diameter: 14.2,
      brand_raw: "ACUVUE 1 DAY MOIST 90 PACK",
    },
    expirationDate: "2027-01-22",
    patient_name: "CollazoCoca, Naomi",
    doctor_name: "Gregory Popowitz, OD",
    prescriber_phone: "5178860222",
    confidence: 1,
    looks_like_contact_lens_rx: true,
    notes:
      "Contact lens prescription section clearly identified. No cylinder, axis, or add values present. Brand is specified for each eye. Expiration date is clearly listed.",
  },
};
const moistDecision = evaluateUploadedRxAutomation(
  moistProductionShape,
  "requires_capture",
  NOW,
);
assert.equal(moistDecision.autoVerify, true);
assert.deepEqual(moistDecision.evidence.resolvedProducts, {
  right: "MOIST",
  left: "MOIST",
});
assert.deepEqual(
  uploadedRxFinalizationOutcome(moistDecision, null),
  {
    state: "eligible_pending_capture",
    writeVerificationOutcome: false,
    recordAutomationEvent: false,
  },
  "a capture-disabled caller preserves a passing upload without a review write or exception event",
);
assert.equal(
  isCompletedUploadedRxFinalization(
    "captured",
    "auto_verified",
    "auto_verified",
  ),
  true,
  "late or retried authorization webhooks cannot downgrade a completed upload",
);
assert.deepEqual(
  uploadedRxFinalizationAllowedOrderStatuses(
    "draft",
    "captured",
    uploadedRxFinalizationOutcome(moistDecision, {
      paymentIntentId: "pi_concurrent",
      alreadyCaptured: false,
    }),
  ),
  ["draft", "captured", "authorized"],
  "the browser final-state write accepts the webhook's benign authorized intermediate state",
);

assert.equal(
  evaluateUploadedRxAutomation(
    { ...validOrder(), rx_ocr_raw: null },
    "requires_capture",
    NOW,
  ).reason,
  "ocr_evidence_missing",
  "unreadable or missing OCR evidence routes to review",
);

assert.equal(
  evaluateUploadedRxAutomation(
    mutate((order) => {
      order.rx.expires = "2026-01-01";
      order.rx_ocr_raw.expirationDate = "2026-01-01";
    }),
    "requires_capture",
    NOW,
  ).reason,
  "prescription_expired",
  "expired prescriptions route to review",
);

assert.equal(
  evaluateUploadedRxAutomation(
    mutate((order) => {
      order.rx.right.coreId = "OASYS_1D";
    }),
    "requires_capture",
    NOW,
  ).reason,
  "product_mismatch",
  "ordered product mismatch routes to review",
);

assert.equal(
  evaluateUploadedRxAutomation(
    mutate((order) => {
      order.rx.left.sphere = -3;
    }),
    "requires_capture",
    NOW,
  ).reason,
  "parameter_mismatch",
  "confirmed parameter mismatch routes to review",
);

assert.equal(
  evaluateUploadedRxAutomation(
    mutate((order) => {
      order.rx_ocr_raw.right.cylinder = -0.75;
      order.rx_ocr_raw.right.axis = 90;
    }),
    "requires_capture",
    NOW,
  ).reason,
  "parameter_mismatch",
  "toric OCR values cannot pass against a spherical product",
);

assert.equal(
  evaluateUploadedRxAutomation(
    mutate((order) => {
      order.rx_ocr_raw.confidence = 0.9;
    }),
    "requires_capture",
    NOW,
  ).reason,
  "ocr_low_confidence",
  "low-confidence OCR routes to review",
);

assert.equal(
  evaluateUploadedRxAutomation(
    mutate((order) => {
      order.rx_ocr_raw.notes = "Axis was ambiguous";
    }),
    "requires_capture",
    NOW,
  ).reason,
  "ocr_ambiguous",
  "ambiguous extraction routes to review",
);

assert.equal(
  evaluateUploadedRxAutomation(
    (() => {
      const order = structuredClone(validOrder()) as UploadedRxAutomationOrder;
      const confirmed = order.rx as Record<string, unknown>;
      const ocr = order.rx_ocr_raw as Record<string, unknown>;
      ocr.notes =
        "Contact-lens prescription identified; unrelated spectacle values ignored.";
      confirmed.left = null;
      ocr.left = null;
      order.patient_name = null;
      order.prescriber_name = null;
      order.prescriber_phone = null;
      ocr.patient_name = null;
      ocr.doctor_name = null;
      ocr.prescriber_phone = null;
      return order;
    })(),
    "requires_capture",
    NOW,
  ).autoVerify,
  true,
  "a clear customer-confirmed one-eye prescription is not blocked by explanatory notes or absent corroborating names",
);

assert.equal(
  evaluateUploadedRxAutomation(validOrder(), "requires_action", NOW).reason,
  "payment_not_capturable",
  "a non-capturable PaymentIntent never passes the gate",
);

assert.equal(
  uploadedRxReviewStatus("product_mismatch"),
  "automation_review_product_mismatch",
  "review state records a specific exception reason",
);

async function runAutomationWorkflowTests() {
  let captureCalls = 0;
  const successfulRun = await runUploadedRxAutomation(
  validOrder(),
  "requires_capture",
  async () => {
    captureCalls += 1;
    return { paymentIntentId: "pi_clean", alreadyCaptured: false };
  },
  NOW,
);
  assert.equal(successfulRun.decision.autoVerify, true);
  assert.equal(successfulRun.capture?.paymentIntentId, "pi_clean");
  assert.equal(captureCalls, 1, "clean evidence invokes capture exactly once");

  const blockedRun = await runUploadedRxAutomation(
  validOrder(),
  "requires_action",
  async () => {
    captureCalls += 1;
    return { paymentIntentId: "pi_never", alreadyCaptured: false };
  },
  NOW,
);
  assert.equal(blockedRun.decision.reason, "payment_not_capturable");
  assert.equal(captureCalls, 1, "non-capturable payment never invokes capture");

  const retryRun = await runUploadedRxAutomation(
  validOrder(),
  "succeeded",
  async () => ({ paymentIntentId: "pi_clean", alreadyCaptured: true }),
  NOW,
);
  assert.equal(retryRun.decision.autoVerify, true);
  assert.equal(
    retryRun.capture?.alreadyCaptured,
    true,
    "an already-captured retry reconciles without another charge",
  );

  const failedRun = await runUploadedRxAutomation(
  validOrder(),
  "requires_capture",
  async () => {
    throw Object.assign(new Error("Stripe unavailable"), {
      code: "stripe_capture_unavailable",
    });
  },
  NOW,
);
  assert.equal(failedRun.decision.reason, "automation_capture_failed");
  assert.equal(
    failedRun.decision.errorCode,
    "stripe_capture_unavailable",
    "capture failures retain a stable specific error code",
  );
  assert.equal(
    failedRun.decision.detail,
    "Stripe unavailable",
    "capture failures retain their precise diagnostic detail",
  );
  assert.equal(failedRun.capture, null, "automation failure remains unresolved");

  const genericFailedRun = await runUploadedRxAutomation(
    validOrder(),
    "requires_capture",
    async () => {
      throw new Error("Unclassified capture failure");
    },
    NOW,
  );
  assert.equal(genericFailedRun.decision.autoVerify, false);
  if (genericFailedRun.decision.autoVerify) {
    throw new Error("generic capture failure unexpectedly auto-verified");
  }
  assert.equal(
    genericFailedRun.decision.errorCode,
    UPLOADED_RX_CAPTURE_FAILURE_CODE,
    "unclassified failures use the stable uploaded-Rx capture error code",
  );

  const genuineReview = evaluateUploadedRxAutomation(
    mutate((order) => {
      order.rx_ocr_raw.confidence = 0.9;
    }),
    "requires_capture",
    NOW,
  );
  assert.deepEqual(
    uploadedRxFinalizationOutcome(genuineReview, null),
    {
      state: "review",
      writeVerificationOutcome: true,
      recordAutomationEvent: true,
    },
    "genuine prescription failures retain the existing review outcome",
  );

  const checkoutRoute = readFileSync(
  join(process.cwd(), "src", "lib", "payments", "checkoutAuthorizationFinalizer.ts"),
  "utf8",
);
  assert.match(
  checkoutRoute,
  /captureAuthorizedOrderPayment\([\s\S]*"uploaded-rx-automation"/,
  "automation reuses the guarded idempotent capture command",
);
  assert.match(
  checkoutRoute,
  /mode: "uploaded_auto_verified",[\s\S]*idempotent: true/,
  "completed automation retries return without duplicate capture or email",
);
  assert.match(
  readFileSync(
    join(process.cwd(), "src", "lib", "orders", "uploadedRxAutomation.ts"),
    "utf8",
  ),
  /reason: "automation_capture_failed"/,
  "capture failures become explicit review exceptions",
);
  assert.match(
    checkoutRoute,
    /verification_uploaded_exception/,
    "review routing retains an audit event",
  );
  assert.match(
    checkoutRoute,
    /uploadedPendingCapture[\s\S]*uploadedOutcome\?\.writeVerificationOutcome/,
    "capture-disabled eligibility preserves verification fields",
  );
  assert.match(
    checkoutRoute,
    /uploadedOutcome\?\.recordAutomationEvent[\s\S]*verification_uploaded_exception/,
    "capture-disabled eligibility emits no automation exception",
  );
  assert.match(
    checkoutRoute,
    /error_code:[\s\S]*uploadedAutomation\.errorCode[\s\S]*detail:[\s\S]*uploadedAutomation\.detail/,
    "capture failure audit evidence retains stable code and precise detail",
  );

  const rxRoute = readFileSync(
    join(process.cwd(), "src", "app", "api", "orders", "[id]", "rx", "route.ts"),
    "utf8",
  );
  assert.match(
    rxRoute,
    /uploaded_customer_confirmed/,
    "server records explicit customer confirmation after an upload",
  );

  const confirmationPage = readFileSync(
    join(
      process.cwd(),
      "src",
      "app",
      "upload-prescription",
      "confirm",
      "ConfirmClient.tsx",
    ),
    "utf8",
  );
  assert.match(
    confirmationPage,
    /<RxForm mode="ocr"[\s\S]*ocrExtract=/,
    "the confirmation UI preserves OCR provenance and extracted identity fields",
  );

  console.log("Uploaded-Rx automation gate tests passed.");
}

void runAutomationWorkflowTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
