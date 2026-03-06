import { lenses } from "@/LensCore/data/lenses";

const REPLACEMENT_DAYS = {
  "DD": 1,
  "1W": 7,
  "2W": 14,
  "1M": 30,
} as const;

type ReplacementCode = keyof typeof REPLACEMENT_DAYS;

function extractPackSize(sku: string): number {
  const match = sku.match(/_(\d+)$/);

  if (!match) {
    throw new Error(`Cannot determine pack size from SKU ${sku}`);
  }

  return parseInt(match[1], 10);
}

export function getSkuBoxDurationMonths(sku: string): number {
  const packSize = extractPackSize(sku);

  const coreId = sku.replace(/_\d+$/, "");

  const lens = lenses.find((l) => coreId.startsWith(l.coreId));

  if (!lens) {
    throw new Error(`Unknown lens for SKU ${sku}`);
  }

  const replacement = lens.replacement as ReplacementCode;

  const interval = REPLACEMENT_DAYS[replacement];

  const days = packSize * interval;

  return Math.round(days / 30);
}