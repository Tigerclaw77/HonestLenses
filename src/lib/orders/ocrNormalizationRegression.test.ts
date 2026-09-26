import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getLensById, resolveLensRxState, validate } from "@/LensCore";
import { formatRxValue } from "@/lib/formatters/rxFormat";
import {
  applyCategoricalAddRecovery,
  categoricalAddRecoveryEyes,
  mapOcrInterpretationToPrescription,
} from "./ocrPrescription";
import {
  assessOcrProductRequirements,
  calibrateOcrConfidence,
} from "./ocrProductRequirements";
import {
  normalizePrescriptionAddForDisplay,
  prescriptionAddsEquivalent,
} from "./prescriptionAdd";
import { evaluateUploadedRxAutomation } from "./uploadedRxAutomation";

const interpretation = {
  right: {
    sphere: 1.75,
    cylinder: -1,
    axis: 100,
    add: null,
    baseCurve: 8.5,
    diameter: 14.3,
    brand_raw: "AVO MAX 1-Day Toric MF",
  },
  left: {
    sphere: 2,
    cylinder: -1,
    axis: 80,
    add: null,
    baseCurve: 8.5,
    diameter: 14.3,
    brand_raw: "AVO MAX 1-Day Toric MF",
  },
  expirationDate: "2026-12-29",
  patient_name: "Sanitized Patient",
  doctor_name: "Sanitized Prescriber",
  prescriber_phone: "5555550100",
  confidence: 1,
  looks_like_contact_lens_rx: true,
  notes: null,
};

assert.deepEqual(categoricalAddRecoveryEyes(interpretation), ["right", "left"]);
const contradictoryAssessment = assessOcrProductRequirements(interpretation, {
  right: "OASYS_MAX_1D_AST_MF",
  left: "OASYS_MAX_1D_AST_MF",
});
assert.deepEqual(
  contradictoryAssessment.issues.map((issue) => [issue.eye, issue.field]),
  [["right", "add"], ["left", "add"]],
  "a multifocal product makes missing ADD a product-aware contradiction",
);
assert.equal(
  calibrateOcrConfidence(1, contradictoryAssessment.issues, false),
  0.5,
  "self-reported confidence 1 is capped when required ADD is missing",
);
const recoveredInterpretation = applyCategoricalAddRecovery(interpretation, {
  right_add: "MED",
  left_add: "MED",
});
const reconciledAssessment = assessOcrProductRequirements(recoveredInterpretation, {
  right: "OASYS_MAX_1D_AST_MF",
  left: "OASYS_MAX_1D_AST_MF",
});
assert.deepEqual(reconciledAssessment.issues, []);
assert.equal(
  calibrateOcrConfidence(1, reconciledAssessment.issues, true),
  0.99,
  "successful focused reconciliation remains high confidence but not perfect",
);
const extracted = mapOcrInterpretationToPrescription(recoveredInterpretation);
assert.equal(extracted.right?.add, "MED", "OD MED survives OCR normalization");
assert.equal(extracted.left?.add, "MED", "OS MED survives OCR normalization");
assert.equal(prescriptionAddsEquivalent("MED", "MID"), true);
assert.equal(prescriptionAddsEquivalent("MED", "HIGH"), false);

const lens = getLensById("OASYS_MAX_1D_AST_MF");
assert.ok(lens, "multifocal-toric product exists in the catalog");

for (const eye of [extracted.right, extracted.left]) {
  assert.ok(eye);
  const payload = {
    sphere: eye.sphere ?? Number.NaN,
    cylinder: eye.cylinder,
    axis: eye.axis,
    add: eye.add,
    baseCurve: eye.base_curve,
    diameter: eye.diameter,
  };
  const resolved = resolveLensRxState(lens, payload);
  assert.equal(resolved.add.invalid, false, "MED matches the catalog MID alias");
  assert.equal(resolved.add.rawValue, "MED", "validation retains the printed ADD evidence");
  assert.equal(resolved.add.value, "MID", "MED canonicalizes to the catalog MID option");
  assert.deepEqual(validate(lens.coreId, payload), { valid: true, errors: [] });
}

const persistedRx = {
  expires: extracted.expires,
  right: { coreId: lens.coreId, ...extracted.right },
  left: { coreId: lens.coreId, ...extracted.left },
};
assert.equal(persistedRx.right.add, "MED", "raw normalized OCR persistence retains MED");
assert.equal(persistedRx.left.add, "MED", "raw normalized OCR persistence retains MED");
const confirmedRx = {
  ...persistedRx,
  right: { ...persistedRx.right, add: "MID" },
  left: { ...persistedRx.left, add: "MID" },
};
const order = {
  id: "00000000-0000-4000-8000-000000000029",
  sku: "OASYS_MAX_1D_AST_MF_30",
  rx_upload_path: "rx/sanitized/westlake.jpg",
  rx_status: "uploaded_customer_confirmed",
  patient_name: interpretation.patient_name,
  prescriber_name: interpretation.doctor_name,
  prescriber_phone: interpretation.prescriber_phone,
  rx: confirmedRx,
  rx_ocr_raw: recoveredInterpretation,
};
const decision = evaluateUploadedRxAutomation(
  order,
  "requires_capture",
  new Date("2026-09-17T12:00:00.000Z"),
);
assert.equal(decision.autoVerify, true, "clean multifocal-toric Rx auto-verifies");
assert.equal(recoveredInterpretation.right?.add, "MED");
assert.equal(recoveredInterpretation.left?.add, "MED");

const adminAdd = normalizePrescriptionAddForDisplay(persistedRx.right.add);
assert.equal(adminAdd, "MED", "admin API does not coerce categorical ADD to null");

const ocrRoute = readFileSync(
  join(process.cwd(), "src", "app", "api", "orders", "[id]", "rx-ocr", "route.ts"),
  "utf8",
);
assert.match(
  ocrRoute,
  /Catalog context for the product selected before upload:[\s\S]*multifocal product requires an ADD value/,
  "OCR receives product-aware required-field context",
);
assert.match(
  ocrRoute,
  /model_confidence:[\s\S]*effective_confidence:[\s\S]*product_requirement_issues/,
  "OCR persists calibrated product-aware reconciliation evidence",
);

const rxForm = readFileSync(
  join(process.cwd(), "src", "components", "RxForm.tsx"),
  "utf8",
);
assert.match(
  rxForm,
  /syncAddOption[\s\S]*canonicalPrescriptionAdd/,
  "the product-selection UI canonicalizes MED to the catalog MID option",
);

const adminPage = readFileSync(
  join(process.cwd(), "src", "app", "admin", "orders", "page.tsx"),
  "utf8",
);
assert.match(
  adminPage,
  /import \{ formatRxValue \} from "@\/lib\/formatters\/rxFormat"/,
  "the admin UI uses the shared categorical-safe Rx formatter",
);
assert.equal(
  formatRxValue("MED", 2),
  "MED",
  "the admin formatter renders categorical ADD text instead of a dash",
);

const acceptanceMigration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260917173740_normalize_admin_verified_rx_status.sql",
  ),
  "utf8",
);
assert.match(
  acceptanceMigration,
  /rx_status = 'manual_verified'/,
  "operator acceptance clears the stale automation-review state",
);
assert.match(
  acceptanceMigration,
  /'verification_reason', v_order\.rx_status[\s\S]*'rx_status', 'manual_verified'/,
  "operator acceptance preserves the prior reason and audits the normalized state",
);

console.log("OCR categorical ADD normalization regression tests passed.");
