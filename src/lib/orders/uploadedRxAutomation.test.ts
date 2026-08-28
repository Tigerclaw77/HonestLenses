import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateUploadedRxAutomation,
  runUploadedRxAutomation,
  uploadedRxReviewStatus,
  type UploadedRxAutomationOrder,
} from "./uploadedRxAutomation";
import { mapPrescriptionInterpretationToRx } from "./prescriptionOcrParsing";
import { buildPowerSignVerification } from "./powerSignVerification";

const NOW = new Date("2026-08-11T12:00:00.000Z");

function validOrder() {
  return {
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

function powerSignFixture(
  candidate: number | null,
  rawText: string,
  imageRawText = rawText,
  imageValue: number | null = candidate,
  field: "sphere" | "cylinder" = "sphere",
) {
  return buildPowerSignVerification(
    {
      right: { [field]: candidate },
      power_evidence: {
        right: { [field]: { raw_text: rawText, value: candidate } },
      },
    },
    {
      right: { [field]: { raw_text: imageRawText, value: imageValue } },
    },
  );
}

for (const [candidate, rawText, description] of [
  [-0.25, "OD SPH -0.25", "faint OCR hyphen-minus quarter diopter"],
  [-0.5, "OD SPH −.50", "Unicode-minus half diopter"],
  [-1, "OD SPH -1.00", "hyphen-minus one diopter"],
  [-4.25, "OD | SPH | —4.25 |", "OCR dash with table-line interference"],
  [0.5, "OD SPH +.50", "explicit positive half diopter"],
  [2, "OD SPH +2.00", "explicit positive two diopters"],
] as const) {
  const verification = powerSignFixture(candidate, rawText);
  assert.equal(
    verification.has_manual_review,
    false,
    `${description} retains its signed power through all four checks`,
  );
}

assert.equal(
  powerSignFixture(null, "OD CYL PLANO", "OD CYL PLANO", null, "cylinder")
    .has_manual_review,
  false,
  "plano is accepted as no cylinder, not a positive sphere",
);
assert.equal(
  powerSignFixture(null, "OD CYL D.S.", "OD CYL D.S.", null, "cylinder")
    .has_manual_review,
  false,
  "DS is accepted as no cylinder, not a positive sphere",
);

const conflictingSignVerification = powerSignFixture(
  4.25,
  "OD SPH -4.25",
  "OD SPH -4.25",
  -4.25,
);
assert.equal(
  conflictingSignVerification.has_manual_review,
  true,
  "a dropped minus glyph cannot silently become a positive power",
);

// Safe fixture equivalent to the reported HydraLuxe prescription. It avoids
// patient and prescriber data while proving the parser and validation path.
const hydraLuxeFixture = {
  right: {
    sphere: -4.25,
    cylinder: null,
    axis: null,
    add: null,
    baseCurve: 8.5,
    diameter: 14.3,
    brand_raw: "Acuvue Oasys HydraLuxe 1-Day 90pk",
  },
  left: {
    sphere: -4.25,
    cylinder: null,
    axis: null,
    add: null,
    baseCurve: 8.5,
    diameter: 14.3,
    brand_raw: "Acuvue Oasys HydraLuxe 1-Day 90pk",
  },
  expirationDate: "2027-07-16",
  confidence: 1,
  looks_like_contact_lens_rx: true,
  notes: "D.S. confirms spherical powers without cylinder.",
  power_evidence: {
    right: {
      sphere: { raw_text: "OD SPH -4.25", value: -4.25 },
      cylinder: { raw_text: "OD CYL DS", value: null },
    },
    left: {
      sphere: { raw_text: "OS SPH -4.25", value: -4.25 },
      cylinder: { raw_text: "OS CYL DS", value: null },
    },
  },
};
const hydraLuxeRx = mapPrescriptionInterpretationToRx(hydraLuxeFixture);
assert.equal(hydraLuxeRx.right?.sphere, -4.25, "OCR parsing preserves the printed negative OD sphere");
assert.equal(hydraLuxeRx.left?.sphere, -4.25, "OCR parsing preserves the printed negative OS sphere");
assert.equal(hydraLuxeRx.right?.base_curve, 8.5);
assert.equal(hydraLuxeRx.right?.diameter, 14.3);
assert.equal(hydraLuxeRx.expires, "2027-07-16");
const matthewRhodesPowerSignVerification = buildPowerSignVerification(
  hydraLuxeFixture,
  {
    right: {
      sphere: { raw_text: "OD SPH -4.25", value: -4.25 },
      cylinder: { raw_text: "OD CYL DS", value: null },
    },
    left: {
      sphere: { raw_text: "OS SPH -4.25", value: -4.25 },
      cylinder: { raw_text: "OS CYL DS", value: null },
    },
  },
);
assert.equal(
  matthewRhodesPowerSignVerification.has_manual_review,
  false,
  "the Matthew Rhodes equivalent fixture verifies OD/OS -4.25 DS",
);
assert.deepEqual(
  [hydraLuxeRx.right?.sphere, hydraLuxeRx.left?.sphere],
  [-4.25, -4.25],
  "the Matthew Rhodes equivalent fixture remains -4.25 OU and cannot become +4.25",
);
assert.equal(
  evaluateUploadedRxAutomation(
    {
      rx_upload_path: "rx/fixture/hydraluxe.png",
      rx_status: "uploaded_customer_confirmed",
      rx: {
        expires: "2027-07-16",
        right: { coreId: "OASYS_1D", sphere: -4.25, base_curve: 8.5 },
        left: { coreId: "OASYS_1D", sphere: -4.25, base_curve: 8.5 },
      },
      rx_ocr_raw: hydraLuxeFixture,
    },
    "requires_capture",
    NOW,
  ).reason,
  "all_checks_passed",
  "the HydraLuxe fixture resolves the exact catalog product and extracted parameters",
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
  evaluateUploadedRxAutomation(
    mutate((order) => {
      order.rx_ocr_raw.power_sign_verification = conflictingSignVerification;
    }),
    "requires_capture",
    NOW,
  ).reason,
  "ocr_power_sign_conflict",
  "a persisted sign contradiction blocks automatic verification and capture",
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

  const conflictingSignRun = await runUploadedRxAutomation(
    mutate((order) => {
      order.rx_ocr_raw.power_sign_verification = conflictingSignVerification;
    }),
    "requires_capture",
    async () => {
      captureCalls += 1;
      return { paymentIntentId: "pi_never", alreadyCaptured: false };
    },
    NOW,
  );
  assert.equal(conflictingSignRun.decision.reason, "ocr_power_sign_conflict");
  assert.equal(captureCalls, 1, "a sign conflict never invokes capture");

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
    throw new Error("Stripe unavailable");
  },
  NOW,
);
  assert.equal(failedRun.decision.reason, "automation_capture_failed");
  assert.equal(failedRun.capture, null, "automation failure remains unresolved");

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
  /orderStatus === nextStatus && verificationStatus === nextVerificationStatus/,
  "completed automation retries return without duplicate capture or email",
);
  assert.match(
  readFileSync(
    join(process.cwd(), "src", "app", "api", "checkout", "authorized", "route.ts"),
    "utf8",
  ),
  /allowAutomaticCapture: true/,
  "only the original in-browser authorization route retains legacy auto-capture",
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

  const ocrRoute = readFileSync(
    join(process.cwd(), "src", "app", "api", "orders", "[id]", "rx-ocr", "route.ts"),
    "utf8",
  );
  assert.match(
    ocrRoute,
    /Preserve the printed sign on every power exactly/,
    "the vision instruction explicitly preserves negative prescription powers",
  );

  console.log("Uploaded-Rx automation gate tests passed.");
}

void runAutomationWorkflowTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
