import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lenses, validateLensParams } from "@/LensCore";
import {
  catalogProductType,
  copyManagedCatalogInput,
  emptyManagedCatalogFamily,
  formatCentsAsPrice,
  guidedInputEditorKey,
  getManagedSupplyDurationMonths,
  getSupplyDurationLabel,
  lensTypeFromCatalogProductType,
  parametersFromAdvancedJson,
  parseCommaSeparatedText,
  parseNumberList,
  parsePriceToCents,
  shouldShowCatalogValidationIssue,
  suggestedCatalogCoreId,
} from "./adminForm";
import { managedInputToLensCore, validateManagedCatalogFamily } from "./validation";

const spherical = emptyManagedCatalogFamily();
spherical.coreId = "ACME_GUIDED_SPHERICAL";
spherical.displayName = "Guided Spherical";
spherical.vendorOrderIdentifier = "ACME-FAMILY";
spherical.images = [{ storagePath: "families/ACME_GUIDED_SPHERICAL/primary.png", isPrimary: true }];
spherical.skus = [{ sku: "ACME_GUIDED_30", packSize: 30, pricePerBoxCents: 4999, vendorSku: "ACME-30" }];
spherical.parameters = {
  baseCurve: [8.4, 8.6],
  diameter: [14, 14.2],
  sphere: {
    segments: [
      { min: -12, max: -6.5, step: 0.5 },
      { min: -6, max: 6, step: 0.25 },
      { min: 6.5, max: 8, step: 0.5 },
    ],
    exclude: [-0.25, 0.25],
  },
};
assert.deepEqual(validateManagedCatalogFamily(spherical), []);
assert.equal(validateLensParams(managedInputToLensCore(spherical), { sphere: -6.5, baseCurve: 8.4, diameter: 14 }).valid, true);
assert.equal(validateLensParams(managedInputToLensCore(spherical), { sphere: -0.25, baseCurve: 8.6, diameter: 14.2 }).valid, false);

const toric = copyManagedCatalogInput(spherical);
toric.coreId = "ACME_GUIDED_TORIC";
toric.images = [{ storagePath: "families/ACME_GUIDED_TORIC/primary.png", isPrimary: true }];
toric.type = lensTypeFromCatalogProductType("toric");
toric.parameters.toric = {
  groups: [
    { cylinders: [-0.75, -1.25], axis: [10, 20, 30, 180] },
    { cylinders: [-1.75], sphereAxisRules: [{ sphereRange: { min: -6, max: 0 }, axis: [10, 20] }, { sphereRange: { min: 0.25, max: 6 }, axis: [10], sphereStepOverride: 0.5 }] },
  ],
};
assert.deepEqual(validateManagedCatalogFamily(toric), []);
assert.equal(validateLensParams(managedInputToLensCore(toric), { sphere: -1, cylinder: -1.75, axis: 20, baseCurve: 8.4, diameter: 14 }).valid, true);
assert.equal(validateLensParams(managedInputToLensCore(toric), { sphere: 0.5, cylinder: -1.75, axis: 20, baseCurve: 8.4, diameter: 14 }).valid, false);

const multifocal = copyManagedCatalogInput(spherical);
multifocal.coreId = "ACME_GUIDED_MULTIFOCAL";
multifocal.images = [{ storagePath: "families/ACME_GUIDED_MULTIFOCAL/primary.png", isPrimary: true }];
multifocal.type = lensTypeFromCatalogProductType("multifocal");
multifocal.parameters.multifocal = {
  adds: ["LOW", "MED", "HIGH"],
  groups: [{ adds: ["HIGH"], sphereRange: { min: -4, max: 4 }, sphereStepOverride: 0.5 }],
};
assert.deepEqual(validateManagedCatalogFamily(multifocal), []);
assert.equal(validateLensParams(managedInputToLensCore(multifocal), { sphere: -1, add: "LOW", baseCurve: 8.4, diameter: 14 }).valid, true);

const toricMultifocal = copyManagedCatalogInput(toric);
toricMultifocal.coreId = "ACME_GUIDED_TORIC_MULTIFOCAL";
toricMultifocal.images = [{ storagePath: "families/ACME_GUIDED_TORIC_MULTIFOCAL/primary.png", isPrimary: true }];
toricMultifocal.type = lensTypeFromCatalogProductType("toric-multifocal");
toricMultifocal.parameters.multifocal = { adds: ["LOW", "HIGH"] };
assert.equal(catalogProductType(toricMultifocal.type), "toric-multifocal");
assert.deepEqual(validateManagedCatalogFamily(toricMultifocal), []);
assert.equal(validateLensParams(managedInputToLensCore(toricMultifocal), { sphere: -1, cylinder: -0.75, axis: 10, add: "LOW", baseCurve: 8.4, diameter: 14 }).valid, true);

assert.deepEqual(parseNumberList("8.4, 8.6").values, [8.4, 8.6]);
assert.ok(parseNumberList("8.4, nope").error);
assert.deepEqual(parsePriceToCents("49.99"), { cents: 4999, error: null });
assert.deepEqual(parsePriceToCents("$49.9"), { cents: 4990, error: null });
assert.equal(formatCentsAsPrice(4999), "49.99");
assert.ok(parsePriceToCents("49.999").error);
assert.equal(getManagedSupplyDurationMonths("1M", 6), 6);
assert.equal(getManagedSupplyDurationMonths("DD", 30), 1);
assert.equal(getSupplyDurationLabel("1M", 6), "About 6 months per box");
assert.deepEqual(parseCommaSeparatedText("LOW, MID, HIGH"), ["LOW", "MID", "HIGH"]);
assert.deepEqual(parseCommaSeparatedText("LOW, "), ["LOW"], "a trailing comma must remain typable without rewriting the field");
assert.equal(guidedInputEditorKey(7, "cylinders-0"), guidedInputEditorKey(7, "cylinders-0"), "a focused field keeps one stable key during its editing session");
assert.notEqual(guidedInputEditorKey(7, "cylinders-0"), guidedInputEditorKey(8, "cylinders-0"), "a new lens session intentionally resets raw input text");
assert.equal(emptyManagedCatalogFamily().browseVisible, true, "new lenses default to showing in store");

assert.equal(suggestedCatalogCoreId("BAUSCH + LOMB", "Biotrue ONEday"), "BAUSCH_LOMB_BIOTRUE_ONEDAY");
assert.equal(shouldShowCatalogValidationIssue("displayName", new Set(), false), false, "blank new form must not show a validation wall");
assert.equal(shouldShowCatalogValidationIssue("displayName", new Set(["displayName"]), false), true);
assert.equal(shouldShowCatalogValidationIssue("images", new Set(), true), true);
assert.ok(validateManagedCatalogFamily({ ...spherical, coreId: lenses[0]!.coreId }).some((issue) => issue.field === "coreId"), "generated or overridden IDs cannot claim a protected LensCore record");

const advanced = copyManagedCatalogInput(toricMultifocal);
advanced.parameters.sphere = undefined;
advanced.parameters.sphereByBaseCurve = [
  { baseCurve: [8.4], spec: { segments: [{ min: -10, max: 6, step: 0.5 }] } },
  { baseCurve: [8.6], spec: { segments: [{ min: -8, max: 8, step: 0.25 }], exclude: [0.25] } },
];
const advancedText = JSON.stringify(advanced.parameters);
const parsed = parametersFromAdvancedJson(advancedText);
assert.equal(JSON.stringify(parsed.parameters), advancedText, "advanced rules must round-trip without losing existing restrictions");
assert.equal(parsed.error, null);
assert.deepEqual(copyManagedCatalogInput(advanced).parameters, advanced.parameters, "editing an existing managed input starts with an exact detached copy");

const workflowSource = readFileSync("src/app/admin/catalog/ManagedCatalogWorkflow.tsx", "utf8");
assert.doesNotMatch(workflowSource, /key=\{\"(?:cylinders|axis|bc|dia):\" \+ formatNumberList/, "parsed list values must never be used as React keys");
assert.match(workflowSource, /guidedInputEditorKey\(editorSession, "cylinders-" \+ index\)/, "cylinder input key must remain stable while typing");
assert.match(workflowSource, /guidedInputEditorKey\(editorSession, "axis-" \+ index\)/, "axis input key must remain stable while typing");
assert.match(workflowSource, /parseCommaSeparatedText\(event\.target\.value\)/, "ADD input retains its raw text instead of normalizing on every keystroke");
assert.doesNotMatch(workflowSource, /value=\{multifocal\.adds\.join/, "ADD input cannot be rendered from the normalized list while being typed");
assert.match(workflowSource, /label="Available ADD values or categories"/, "ADD remains an explicitly labelled field");
for (const example of ["Example: 8.4, 8.6", "Example: 14.0, 14.2", "Example: -6.25, +4.25", "Example: -0.75, -1.25, -1.75", "Example: 10, 20, 30, 180", "Example: LOW, MID, HIGH"]) {
  assert.ok(workflowSource.includes(example), "workflow must retain the correct field-specific example: " + example);
}
assert.match(workflowSource, /\.managedForm select\{height:39px;min-height:39px\}/, "replacement schedule remains a compact control");

console.log("Managed catalog guided-form conversions, validation visibility, and advanced round-trip checks passed.");
