import { lenses } from "@/LensCore";
import type { LensCore, PowerSpec } from "@/LensCore/types";
import type {
  ManagedCatalogFamilyInput,
  ManagedCatalogValidationIssue,
} from "./types";

const CORE_ID = /^[A-Z0-9_]+$/;
const STEPS = new Set([0.25, 0.5, 1]);

function add(
  issues: ManagedCatalogValidationIssue[],
  field: string,
  message: string,
) {
  issues.push({ field, message });
}

function finiteList(
  issues: ManagedCatalogValidationIssue[],
  field: string,
  values: readonly number[] | undefined,
) {
  if (!values?.length || values.some((value) => !Number.isFinite(value))) {
    add(issues, field, "At least one finite value is required.");
  }
}

function validatePowerSpec(
  issues: ManagedCatalogValidationIssue[],
  field: string,
  spec: PowerSpec | undefined,
) {
  if (!spec?.segments.length) {
    add(issues, field, "At least one power range is required.");
    return;
  }

  spec.segments.forEach((segment, index) => {
    const segmentField = `${field}.segments[${index}]`;
    if (
      !Number.isFinite(segment.min) ||
      !Number.isFinite(segment.max) ||
      segment.min > segment.max
    ) {
      add(issues, segmentField, "Range minimum must be less than or equal to maximum.");
    }
    if (!STEPS.has(segment.step)) {
      add(issues, segmentField, "Step must be 0.25, 0.5, or 1.0.");
    }
  });
  if (spec.exclude?.some((value) => !Number.isFinite(value))) {
    add(issues, `${field}.exclude`, "Exclusions must be finite numeric powers.");
  }
}

function validateParameters(
  input: ManagedCatalogFamilyInput,
  issues: ManagedCatalogValidationIssue[],
) {
  const { parameters, type } = input;
  if (!parameters || typeof parameters !== "object") {
    add(issues, "parameters", "LensCore parameters are required.");
    return;
  }

  if (!parameters.sphere && !parameters.sphereByBaseCurve?.length) {
    add(issues, "parameters", "Define sphere or BC-dependent sphere ranges.");
  }
  if (parameters.sphere) validatePowerSpec(issues, "parameters.sphere", parameters.sphere);
  parameters.sphereByBaseCurve?.forEach((entry, index) => {
    finiteList(issues, `parameters.sphereByBaseCurve[${index}].baseCurve`, Array.isArray(entry.baseCurve) ? entry.baseCurve : [entry.baseCurve]);
    validatePowerSpec(issues, `parameters.sphereByBaseCurve[${index}].spec`, entry.spec);
  });
  finiteList(issues, "parameters.baseCurve", parameters.baseCurve);
  finiteList(issues, "parameters.diameter", parameters.diameter);

  if (type.toric) {
    if (!parameters.toric?.groups.length) {
      add(issues, "parameters.toric", "Toric lenses require at least one cylinder/axis group.");
    }
    parameters.toric?.groups.forEach((group, index) => {
      finiteList(issues, `parameters.toric.groups[${index}].cylinders`, group.cylinders);
      if ("axis" in group) {
        finiteList(issues, `parameters.toric.groups[${index}].axis`, group.axis);
      } else if (!group.sphereAxisRules?.length) {
        add(issues, `parameters.toric.groups[${index}]`, "An axis list or sphere/axis rules is required.");
      } else {
        group.sphereAxisRules.forEach((rule, ruleIndex) => {
          if (rule.sphereRange.min > rule.sphereRange.max) {
            add(issues, `parameters.toric.groups[${index}].sphereAxisRules[${ruleIndex}]`, "Sphere range is invalid.");
          }
          finiteList(issues, `parameters.toric.groups[${index}].sphereAxisRules[${ruleIndex}].axis`, rule.axis);
          if (rule.sphereStepOverride && !STEPS.has(rule.sphereStepOverride)) {
            add(issues, `parameters.toric.groups[${index}].sphereAxisRules[${ruleIndex}].sphereStepOverride`, "Step must be 0.25, 0.5, or 1.0.");
          }
        });
      }
    });
  } else if (parameters.toric) {
    add(issues, "parameters.toric", "Toric parameters require the toric characteristic.");
  }

  if (type.multifocal) {
    const multifocal = parameters.multifocal;
    if (!multifocal || (!multifocal.adds?.length && !multifocal.groups?.length)) {
      add(issues, "parameters.multifocal", "Multifocal lenses require ADD values or ADD groups.");
    }
    multifocal?.groups?.forEach((group, index) => {
      if (!group.adds.length) add(issues, `parameters.multifocal.groups[${index}].adds`, "At least one ADD is required.");
      if (group.sphereRange.min > group.sphereRange.max) add(issues, `parameters.multifocal.groups[${index}].sphereRange`, "Sphere range is invalid.");
      if (group.sphereStepOverride && !STEPS.has(group.sphereStepOverride)) add(issues, `parameters.multifocal.groups[${index}].sphereStepOverride`, "Step must be 0.25, 0.5, or 1.0.");
    });
  } else if (parameters.multifocal) {
    add(issues, "parameters.multifocal", "Multifocal parameters require the multifocal characteristic.");
  }
}

/** Validates an entire publishable managed family before it is versioned. */
export function validateManagedCatalogFamily(
  input: ManagedCatalogFamilyInput,
  options: { existingManagedCoreIds?: readonly string[] } = {},
): ManagedCatalogValidationIssue[] {
  const issues: ManagedCatalogValidationIssue[] = [];
  const coreId = input.coreId.trim();

  if (!CORE_ID.test(coreId)) add(issues, "coreId", "Use uppercase letters, numbers, and underscores only.");
  if (lenses.some((lens) => lens.coreId === coreId)) add(issues, "coreId", "This core ID belongs to a protected source-managed LensCore family.");
  if (options.existingManagedCoreIds?.includes(coreId)) add(issues, "coreId", "This managed core ID already exists; use Edit instead.");
  if (!input.displayName.trim()) add(issues, "displayName", "Display name is required.");
  if (!input.vendorOrderIdentifier?.trim()) add(issues, "vendorOrderIdentifier", "A family-level vendor/distributor order identifier is required.");
  validateParameters(input, issues);

  if (!input.images.length) add(issues, "images", "Upload one primary product image.");
  if (input.images.filter((image) => image.isPrimary !== false).length !== 1) add(issues, "images", "Exactly one primary product image is required.");
  input.images.forEach((image, index) => {
    if (!image.storagePath.startsWith("families/")) add(issues, `images[${index}].storagePath`, "Image must be stored in the managed catalog family path.");
  });

  if (!input.skus.length) add(issues, "skus", "At least one active SKU is required.");
  const skuSet = new Set<string>();
  input.skus.forEach((sku, index) => {
    if (!sku.sku.trim()) add(issues, `skus[${index}].sku`, "SKU is required.");
    if (skuSet.has(sku.sku)) add(issues, `skus[${index}].sku`, "SKU values must be unique within a family.");
    skuSet.add(sku.sku);
    if (!Number.isInteger(sku.packSize) || sku.packSize <= 0) add(issues, `skus[${index}].packSize`, "Pack size must be a positive whole number.");
    if (!Number.isInteger(sku.pricePerBoxCents) || sku.pricePerBoxCents <= 0) add(issues, `skus[${index}].pricePerBoxCents`, "Retail price must be positive whole cents.");
    if (!sku.vendorSku?.trim() && !sku.vendorOrderIdentifier?.trim()) add(issues, `skus[${index}]`, "Provide a vendor SKU or SKU-level order identifier.");
  });

  return issues;
}

export function managedInputToLensCore(input: ManagedCatalogFamilyInput): LensCore {
  return {
    coreId: input.coreId,
    displayName: input.displayName,
    manufacturer: input.manufacturer,
    replacement: input.replacement,
    type: { ...input.type },
    parameters: input.parameters,
  };
}
