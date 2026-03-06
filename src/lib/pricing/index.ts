import { VISTAKON_PRICING } from "./vistakon"
import { BAUSCH_PRICING } from "./bausch"
import { COOPERVISION_PRICING } from "./coopervision"
import { ALCON_PRICING } from "./alcon"

export const ALL_PRICING = {
  ...VISTAKON_PRICING,
  ...BAUSCH_PRICING,
  ...COOPERVISION_PRICING,
  ...ALCON_PRICING,
}