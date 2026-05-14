import { VISTAKON_PRICING } from "./vistakon";
import { BAUSCH_PRICING } from "./bausch";
import { COOPERVISION_PRICING } from "./coopervision";
import { ALCON_PRICING } from "./alcon";
import { CORE_TO_SKUS } from "./resolveDefaultSku";
import type { LensCore } from "@/LensCore/types";

const ALL_PRICING = {
  ...VISTAKON_PRICING,
  ...BAUSCH_PRICING,
  ...COOPERVISION_PRICING,
  ...ALCON_PRICING,
};

export function getLensSkus(lens: LensCore): string[] {
  const configuredSkus = CORE_TO_SKUS[lens.coreId] ?? [];

  return configuredSkus.filter((sku) => sku in ALL_PRICING);
}
