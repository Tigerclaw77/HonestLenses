import { VISTAKON_PRICING } from "./vistakon";
import { BAUSCH_PRICING } from "./bausch";
import { COOPERVISION_PRICING } from "./coopervision";
import { ALCON_PRICING } from "./alcon";
import type { LensCore } from "@/LensCore/types";

const ALL_PRICING = {
  ...VISTAKON_PRICING,
  ...BAUSCH_PRICING,
  ...COOPERVISION_PRICING,
  ...ALCON_PRICING,
};

export function getLensSkus(lens: LensCore): string[] {
  return Object.keys(ALL_PRICING).filter((sku) => {
    const family = sku.replace(/_\d+$/, "");
    return family === lens.coreId;
  });
}