import type { LensCore, PowerSpec } from "@/LensCore/types";
import { lenses } from "@/LensCore/data/lenses";
import { ALCON_PRICING } from "@/lib/pricing/alcon";
import { BAUSCH_PRICING } from "@/lib/pricing/bausch";
import { COOPERVISION_PRICING } from "@/lib/pricing/coopervision";
import { VISTAKON_PRICING } from "@/lib/pricing/vistakon";
import { getPackSizeFromSku } from "@/lib/pricing/getPackSize";
import { CORE_TO_SKUS } from "@/lib/pricing/resolveDefaultSku";
import type {
  CatalogAssetSummary,
  CatalogDraft,
  CatalogIssue,
  CatalogLensSummary,
  CatalogManufacturer,
  CatalogSkuSummary,
  ParameterPreview,
  PricingIndex,
  PricingManufacturer,
  ReplacementCode,
} from "./types";

const MANUFACTURERS: CatalogManufacturer[] = [
  "VISTAKON",
  "ALCON",
  "BAUSCH + LOMB",
  "COOPERVISION",
];

const REPLACEMENTS: ReplacementCode[] = ["DD", "1W", "2W", "1M"];

const REPLACEMENT_DAYS: Record<ReplacementCode, number> = {
  DD: 1,
  "1W": 7,
  "2W": 14,
  "1M": 30,
};

type PriceTable = Record<string, { price_per_box_cents: number }>;

function issue(
  severity: CatalogIssue["severity"],
  code: string,
  message: string,
  context?: string,
): CatalogIssue {
  return { severity, code, message, context };
}

function isCatalogManufacturer(value: string): value is CatalogManufacturer {
  return MANUFACTURERS.includes(value as CatalogManufacturer);
}

function isReplacementCode(value: string): value is ReplacementCode {
  return REPLACEMENTS.includes(value as ReplacementCode);
}

export function getCatalogManufacturers(): CatalogManufacturer[] {
  return MANUFACTURERS;
}

export function getCatalogReplacements(): ReplacementCode[] {
  return REPLACEMENTS;
}

export function normalizeManufacturer(
  manufacturer: string,
): PricingManufacturer | null {
  if (manufacturer === "VISTAKON") return "vistakon";
  if (manufacturer === "ALCON") return "alcon";
  if (manufacturer === "BAUSCH + LOMB") return "bausch";
  if (manufacturer === "COOPERVISION") return "coopervision";
  return null;
}

function addPricingTable(
  index: PricingIndex,
  manufacturer: PricingManufacturer,
  table: PriceTable,
) {
  Object.entries(table).forEach(([sku, entry]) => {
    index[sku] = {
      manufacturer,
      pricePerBoxCents: entry.price_per_box_cents,
    };
  });
}

export function buildPricingIndex(): PricingIndex {
  const index: PricingIndex = {};

  addPricingTable(index, "vistakon", VISTAKON_PRICING);
  addPricingTable(index, "alcon", ALCON_PRICING);
  addPricingTable(index, "bausch", BAUSCH_PRICING);
  addPricingTable(index, "coopervision", COOPERVISION_PRICING);

  return index;
}

export function deriveSkuDurationMonths(
  sku: string,
  replacement: string,
): number | null {
  if (!isReplacementCode(replacement)) return null;

  const packSize = getPackSizeFromSku(sku);
  if (!packSize) return null;

  return Math.round((packSize * REPLACEMENT_DAYS[replacement]) / 30);
}

export function getCatalogAssetSummary(
  imageRef: string,
  assetNames: readonly string[],
): CatalogAssetSummary {
  const normalizedRef = imageRef.trim();
  const candidates = [
    `${normalizedRef}.webp`,
    `${normalizedRef}.png`,
    `${normalizedRef}.jpg`,
    `${normalizedRef}.jpeg`,
  ];
  const assetSet = new Set(assetNames);
  const match = candidates.find((candidate) => assetSet.has(candidate)) ?? null;

  return {
    imageRef: normalizedRef,
    exists: match !== null,
    preferredPath: match ? `/lens-images/${match}` : null,
    candidates,
  };
}

function formatNumberList(values: readonly number[] | undefined): string[] {
  if (!values || values.length === 0) return [];
  return [...values].sort((a, b) => a - b).map((value) => String(value));
}

function summarizePowerSpec(spec: PowerSpec | undefined): string[] {
  if (!spec) return [];

  return spec.segments.map((segment) => {
    const excluded = spec.exclude?.length
      ? `, excluding ${spec.exclude.join(", ")}`
      : "";

    return `${segment.min} to ${segment.max} by ${segment.step}${excluded}`;
  });
}

export function buildParameterPreview(
  parameters: LensCore["parameters"] | null,
): ParameterPreview {
  if (!parameters) {
    return {
      baseCurves: [],
      diameters: [],
      sphereSummary: [],
      cylinderValues: [],
      axisValues: [],
      addValues: [],
    };
  }

  const cylinderValues = new Set<string>();
  const axisValues = new Set<string>();
  const addValues = new Set<string>();
  const sphereByBaseCurveSummary =
    parameters.sphereByBaseCurve?.flatMap((entry) =>
      summarizePowerSpec(entry.spec).map(
        (summary) => `BC ${Array.isArray(entry.baseCurve) ? entry.baseCurve.join("/") : entry.baseCurve}: ${summary}`,
      ),
    ) ?? [];
  const sphereSummary = [
    ...summarizePowerSpec(parameters.sphere),
    ...sphereByBaseCurveSummary,
  ];

  parameters.toric?.groups.forEach((group) => {
    group.cylinders.forEach((cylinder) => cylinderValues.add(String(cylinder)));

    if ("axis" in group && group.axis) {
      group.axis.forEach((axis) => axisValues.add(String(axis)));
    }

    if ("sphereAxisRules" in group && group.sphereAxisRules) {
      group.sphereAxisRules.forEach((rule) => {
        rule.axis.forEach((axis) => axisValues.add(String(axis)));
      });
    }
  });

  parameters.multifocal?.adds.forEach((add) => addValues.add(add));
  parameters.multifocal?.xrAdds?.forEach((add) => addValues.add(add));
  parameters.multifocal?.groups?.forEach((group) => {
    group.adds.forEach((add) => addValues.add(add));
  });

  return {
    baseCurves: formatNumberList(parameters.baseCurve),
    diameters: formatNumberList(parameters.diameter),
    sphereSummary,
    cylinderValues: [...cylinderValues].sort(),
    axisValues: [...axisValues].sort((a, b) => Number(a) - Number(b)),
    addValues: [...addValues].sort(),
  };
}

function summarizeSku(
  sku: string,
  replacement: string,
  lensManufacturer: string,
  pricingIndex: PricingIndex,
): CatalogSkuSummary {
  const issues: CatalogIssue[] = [];
  const pricing = pricingIndex[sku] ?? null;
  const packSize = getPackSizeFromSku(sku);
  const durationMonths = deriveSkuDurationMonths(sku, replacement);
  const normalizedManufacturer = normalizeManufacturer(lensManufacturer);

  if (!packSize) {
    issues.push(
      issue(
        "error",
        "sku_pack_size_missing",
        `SKU ${sku} does not end in a numeric pack size.`,
      ),
    );
  }

  if (!durationMonths) {
    issues.push(
      issue(
        "error",
        "sku_duration_missing",
        `SKU ${sku} cannot derive supply duration from replacement schedule ${replacement}.`,
      ),
    );
  }

  if (!pricing) {
    issues.push(
      issue("error", "pricing_missing", `SKU ${sku} has no pricing entry.`),
    );
  } else if (
    normalizedManufacturer &&
    pricing.manufacturer !== normalizedManufacturer
  ) {
    issues.push(
      issue(
        "error",
        "manufacturer_mismatch",
        `SKU ${sku} is priced under ${pricing.manufacturer}, but the lens manufacturer is ${lensManufacturer}.`,
      ),
    );
  }

  return {
    sku,
    packSize,
    durationMonths,
    pricePerBoxCents: pricing?.pricePerBoxCents ?? null,
    pricingManufacturer: pricing?.manufacturer ?? null,
    issues,
  };
}

type DraftValidationInput = {
  draft: CatalogDraft;
  existingCoreIds: readonly string[];
  assetNames: readonly string[];
  pricingIndex: PricingIndex;
};

export function validateCatalogDraft({
  draft,
  existingCoreIds,
  assetNames,
  pricingIndex,
}: DraftValidationInput): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const coreId = draft.coreId.trim();
  const displayName = draft.displayName.trim();

  if (!coreId) {
    issues.push(issue("error", "core_id_required", "coreId is required."));
  } else if (!/^[A-Z0-9_]+$/.test(coreId)) {
    issues.push(
      issue(
        "error",
        "core_id_format",
        "coreId should use uppercase letters, numbers, and underscores only.",
      ),
    );
  }

  if (
    coreId &&
    coreId !== draft.originalCoreId &&
    existingCoreIds.includes(coreId)
  ) {
    issues.push(
      issue("error", "duplicate_core_id", `coreId ${coreId} already exists.`),
    );
  }

  if (!displayName) {
    issues.push(
      issue("error", "display_name_required", "Display name is required."),
    );
  }

  if (!draft.manufacturer || !isCatalogManufacturer(draft.manufacturer)) {
    issues.push(
      issue(
        "error",
        "manufacturer_invalid",
        "Manufacturer must be one of the supported catalog manufacturers.",
      ),
    );
  }

  if (!draft.replacement || !isReplacementCode(draft.replacement)) {
    issues.push(
      issue(
        "error",
        "replacement_invalid",
        "Replacement schedule must be DD, 1W, 2W, or 1M.",
      ),
    );
  }

  if (draft.skus.length === 0) {
    issues.push(
      issue(
        "error",
        "sku_mapping_missing",
        "At least one SKU mapping is required before this lens can price or resolve.",
      ),
    );
  }

  draft.skus.forEach((sku) => {
    issues.push(
      ...summarizeSku(
        sku,
        draft.replacement,
        draft.manufacturer,
        pricingIndex,
      ).issues,
    );
  });

  if (!draft.parameters) {
    issues.push(
      issue(
        "error",
        "parameters_invalid",
        "Parameters JSON must be a valid object matching LensCore parameters.",
      ),
    );
  } else {
    if (draft.toric && !draft.parameters.toric) {
      issues.push(
        issue(
          "warning",
          "toric_parameters_missing",
          "Lens is marked toric but has no toric parameter block.",
        ),
      );
    }

    if (draft.multifocal && !draft.parameters.multifocal) {
      issues.push(
        issue(
          "warning",
          "multifocal_parameters_missing",
          "Lens is marked multifocal but has no multifocal parameter block.",
        ),
      );
    }

    if (!draft.parameters.baseCurve && !draft.parameters.sphereByBaseCurve) {
      issues.push(
        issue(
          "warning",
          "base_curve_missing",
          "No base curve options are defined.",
        ),
      );
    }

    if (!draft.parameters.diameter) {
      issues.push(
        issue("warning", "diameter_missing", "No diameter options are defined."),
      );
    }
  }

  const asset = getCatalogAssetSummary(draft.imageRef || coreId, assetNames);
  if (!asset.exists && !draft.acknowledgeMissingImage) {
    issues.push(
      issue(
        "error",
        "image_missing",
        `No product image exists for ${asset.imageRef}. Acknowledge the missing asset or add the image before save.`,
      ),
    );
  } else if (!asset.exists) {
    issues.push(
      issue(
        "warning",
        "image_missing_acknowledged",
        `Product image for ${asset.imageRef} is intentionally missing for now.`,
      ),
    );
  }

  if (draft.imageRef && draft.imageRef !== coreId) {
    issues.push(
      issue(
        "warning",
        "image_ref_nonstandard",
        "Browse currently uses the coreId image convention. A non-coreId image reference needs a renderer update.",
      ),
    );
  }

  if (!draft.browseVisible) {
    issues.push(
      issue(
        "info",
        "browse_hidden",
        "Draft is marked hidden from browse. Current production visibility is still derived by code, not a persisted flag.",
      ),
    );
  } else if (coreId.includes("_XR")) {
    issues.push(
      issue(
        "warning",
        "xr_browse_filter",
        "coreId contains _XR. The current browse page filters XR products by coreId convention.",
      ),
    );
  }

  return issues;
}

export function buildLensSummary(
  lens: LensCore,
  assetNames: readonly string[],
  pricingIndex: PricingIndex,
): CatalogLensSummary {
  const skus = CORE_TO_SKUS[lens.coreId] ?? [];
  const draft: CatalogDraft = {
    originalCoreId: lens.coreId,
    coreId: lens.coreId,
    displayName: lens.displayName,
    manufacturer: isCatalogManufacturer(lens.manufacturer)
      ? lens.manufacturer
      : "",
    replacement: isReplacementCode(lens.replacement) ? lens.replacement : "",
    toric: lens.type.toric,
    multifocal: lens.type.multifocal,
    browseVisible: !lens.coreId.includes("_XR"),
    imageRef: lens.coreId,
    skus,
    parameters: lens.parameters,
    acknowledgeMissingImage: false,
  };

  return {
    coreId: lens.coreId,
    displayName: lens.displayName,
    manufacturer: lens.manufacturer,
    replacement: lens.replacement,
    type: lens.type,
    parameters: lens.parameters,
    browseVisible: draft.browseVisible,
    skus: skus.map((sku) =>
      summarizeSku(sku, lens.replacement, lens.manufacturer, pricingIndex),
    ),
    asset: getCatalogAssetSummary(lens.coreId, assetNames),
    parameterPreview: buildParameterPreview(lens.parameters),
    issues: validateCatalogDraft({
      draft,
      existingCoreIds: lenses.map((item) => item.coreId),
      assetNames,
      pricingIndex,
    }),
  };
}

export function findGlobalCatalogIssues(
  lensSummaries: readonly CatalogLensSummary[],
  pricingIndex: PricingIndex,
): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const coreIds = lensSummaries.map((lens) => lens.coreId);
  const uniqueCoreIds = new Set(coreIds);
  const mappedSkus = new Set(Object.values(CORE_TO_SKUS).flat());
  const mappedCoreIds = new Set(Object.keys(CORE_TO_SKUS));

  if (uniqueCoreIds.size !== coreIds.length) {
    issues.push(
      issue("error", "duplicate_core_ids", "Duplicate coreIds exist in lenses."),
    );
  }

  lensSummaries.forEach((lens) => {
    if (!mappedCoreIds.has(lens.coreId)) {
      issues.push(
        issue(
          "error",
          "core_without_sku_mapping",
          `${lens.coreId} has no CORE_TO_SKUS mapping.`,
        ),
      );
    }
  });

  Object.entries(CORE_TO_SKUS).forEach(([coreId, skus]) => {
    if (!uniqueCoreIds.has(coreId)) {
      issues.push(
        issue(
          "warning",
          "sku_mapping_without_lens",
          `${coreId} has SKU mappings but no LensCore entry.`,
        ),
      );
    }

    skus.forEach((sku) => {
      if (!pricingIndex[sku]) {
        issues.push(
          issue(
            "error",
            "mapped_sku_without_pricing",
            `${sku} is mapped from ${coreId} but missing pricing.`,
          ),
        );
      }
    });
  });

  Object.keys(pricingIndex).forEach((sku) => {
    if (!mappedSkus.has(sku)) {
      issues.push(
        issue(
          "warning",
          "orphan_pricing_entry",
          `${sku} exists in pricing but is not mapped to a lens.`,
        ),
      );
    }
  });

  return issues;
}

export function buildMappedSkuList(): string[] {
  return [...new Set(Object.values(CORE_TO_SKUS).flat())].sort();
}
