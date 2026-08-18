import assert from "node:assert/strict";
import { lenses, validateLensParams } from "@/LensCore";
import { getColorOptions } from "@/data/lensColors";
import { deriveManagedTotalMonths, getManagedDefaultSku, getManagedNextSmallerPack, getManagedOrderQuote, getManagedPackSizeOptions, getManagedPrice } from "./commerce";
import { isManagedFamilyCustomerOrderable } from "./availability";
import { managedInputToLensCore, validateManagedCatalogFamily } from "./validation";
import type { ManagedCatalogFamilyInput } from "./types";

const family: ManagedCatalogFamilyInput = {
  coreId: "TEST_MANAGED_AST_MF", displayName: "Test Managed Astigmatism Multifocal", manufacturer: "COOPERVISION", replacement: "1M",
  type: { toric: true, multifocal: true }, active: true, browseVisible: true, vendorOrderIdentifier: "ARMORY-FAMILY-001",
  images: [{ storagePath: "families/TEST_MANAGED_AST_MF/primary.jpg", isPrimary: true }],
  skus: [
    { sku: "TEST_MANAGED_AST_MF_3", packSize: 3, pricePerBoxCents: 2500, vendorSku: "ARMORY-3" },
    { sku: "TEST_MANAGED_AST_MF_6", packSize: 6, pricePerBoxCents: 4600, vendorSku: "ARMORY-6" },
  ],
  parameters: {
    baseCurve: [8.6], diameter: [14.2], sphere: { segments: [{ min: -4, max: 4, step: 0.25 }], exclude: [0.25] },
    toric: { groups: [{ cylinders: [-0.75], sphereAxisRules: [{ sphereRange: { min: -4, max: 0 }, axis: [10, 20] }, { sphereRange: { min: 0.25, max: 4 }, axis: [10], sphereStepOverride: 0.5 }] }] },
    multifocal: { adds: ["LOW", "HIGH"] },
  },
};

assert.deepEqual(validateManagedCatalogFamily(family), []);
const managedLens = managedInputToLensCore(family);
assert.equal(validateLensParams(managedLens, { sphere: -1, cylinder: -0.75, axis: 20, add: "LOW", baseCurve: 8.6, diameter: 14.2 }).valid, true, "managed LensCore rules must validate manufacturable Rx");
assert.equal(validateLensParams(managedLens, { sphere: 0.5, cylinder: -0.75, axis: 20, add: "LOW", baseCurve: 8.6, diameter: 14.2 }).valid, false, "managed LensCore rules must reject an invalid conditional axis combination");
assert.equal(validateLensParams(managedLens, { sphere: 0.5, cylinder: -0.75, axis: 10, add: "LOW", baseCurve: 8.6, diameter: 14.2 }).valid, false, "managed LensCore rules must enforce sphere step overrides");

const beforeLegacy = JSON.stringify(lenses);
const edited = structuredClone(family);
edited.displayName = "Edited managed family only";
edited.parameters.sphere = { segments: [{ min: -2, max: 2, step: 0.5 }] };
assert.deepEqual(validateManagedCatalogFamily(edited), []);
assert.equal(JSON.stringify(lenses), beforeLegacy, "editing a managed input must not mutate any source LensCore family");
assert.ok(validateManagedCatalogFamily({ ...family, coreId: lenses[0]!.coreId }).some((issue) => issue.field === "coreId"), "a managed family cannot overwrite a source LensCore ID");

const options = getManagedPackSizeOptions({ replacement: family.replacement, skus: family.skus });
assert.deepEqual(options.map((option) => option.sku), ["TEST_MANAGED_AST_MF_3", "TEST_MANAGED_AST_MF_6"]);
assert.equal(getManagedDefaultSku({ replacement: family.replacement, skus: family.skus }, 6), "TEST_MANAGED_AST_MF_6");
assert.equal(getManagedNextSmallerPack({ replacement: family.replacement, skus: family.skus }, "TEST_MANAGED_AST_MF_6")?.sku, "TEST_MANAGED_AST_MF_3");
assert.deepEqual(getManagedPrice(family.skus[0]!, 2, family.manufacturer), { manufacturer: "coopervision", price_per_box_cents: 2500, total_amount_cents: 5000, price_reason: "managed_catalog_retail_v1" });

const monthlyFamily = {
  ...family,
  replacement: "1M" as const,
  skus: [
    { sku: "TEST_MANAGED_AST_MF_3", packSize: 3, pricePerBoxCents: 2500, vendorSku: "ARMORY-3", active: true },
    { sku: "TEST_MANAGED_AST_MF_6", packSize: 6, pricePerBoxCents: 4600, vendorSku: "ARMORY-6", active: true },
  ],
};
const publishedMonthlyFamily = {
  ...monthlyFamily,
  id: "00000000-0000-4000-8000-000000000001",
  versionId: "00000000-0000-4000-8000-000000000002",
  version: 1,
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
};
assert.equal(deriveManagedTotalMonths({ family: monthlyFamily, sku: "TEST_MANAGED_AST_MF_3", totalBoxes: 4, rightBoxCount: 2, leftBoxCount: 2 }), 6, "two eyes × two 3-month boxes is six months per eye, not twelve");
assert.equal(deriveManagedTotalMonths({ family: monthlyFamily, sku: "TEST_MANAGED_AST_MF_3", totalBoxes: 5, rightBoxCount: 4, leftBoxCount: 1 }), 3, "asymmetric eyes use the lesser supplied duration");
assert.equal(getManagedOrderQuote({ family: publishedMonthlyFamily, sku: "TEST_MANAGED_AST_MF_3", totalBoxes: 4, rightBoxCount: 2, leftBoxCount: 2 }).shippingCents, 1500, "six-month two-eye supply must not receive annual shipping");
assert.equal(getManagedOrderQuote({ family: publishedMonthlyFamily, sku: "TEST_MANAGED_AST_MF_3", totalBoxes: 8, rightBoxCount: 4, leftBoxCount: 4 }).shippingCents, 0, "true twelve-month per-eye supply remains free");
assert.equal(getManagedOrderQuote({ family: publishedMonthlyFamily, sku: "TEST_MANAGED_AST_MF_6", totalBoxes: 4, rightBoxCount: 2, leftBoxCount: 2 }).shippingCents, 0, "smaller-pack changes preserve a true annual per-eye supply result");
assert.equal(
  deriveManagedTotalMonths({ family: monthlyFamily, sku: "TEST_MANAGED_AST_MF_3", totalBoxes: 8, rightBoxCount: 4, leftBoxCount: 4 }),
  deriveManagedTotalMonths({ family: monthlyFamily, sku: "TEST_MANAGED_AST_MF_6", totalBoxes: 4, rightBoxCount: 2, leftBoxCount: 2 }),
  "smaller-pack switching preserves the per-eye supply duration",
);

assert.equal(isManagedFamilyCustomerOrderable({ active: true, browseVisible: true }), true);
assert.equal(isManagedFamilyCustomerOrderable({ active: true, browseVisible: false }), false, "non-browse managed families must be rejected server-side");
assert.equal(isManagedFamilyCustomerOrderable({ active: false, browseVisible: true }), false, "inactive managed families must be rejected server-side");

assert.ok(getColorOptions("DEFINE").length > 0);
assert.ok(getColorOptions("AO_COL").length > 0);
assert.ok(getColorOptions("DAILIES_COL").length > 0);
assert.equal(validateLensParams(lenses.find((lens) => lens.coreId === "BIOTRUE_1D_AST")!, { sphere: -5.5, cylinder: -2.75, axis: 10 }).valid, true);
assert.equal(validateLensParams(lenses.find((lens) => lens.coreId === "BIOTRUE_1D_AST")!, { sphere: -5.75, cylinder: -2.75, axis: 10 }).valid, false);

console.log("Managed catalog validation, isolation, pack, price, color, and Biotrue regression checks passed.");
