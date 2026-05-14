import { VISTAKON_PRICING } from "./vistakon"
import { BAUSCH_PRICING } from "./bausch"
import { COOPERVISION_PRICING } from "./coopervision"
import { ALCON_PRICING } from "./alcon"
export {
  CATALOG_AUDIT_NOTES,
  PRICING_AUDIT_TODOS,
  normalizePricingManufacturer,
  type CatalogAuditNote,
  type CatalogAuditItem,
  type PricingAuditManufacturer,
  type PricingAuditTodo,
} from "./catalogAudit"
export {
  applyPricingAdjustment,
  estimateOrderEconomics,
  getPricingAuditReport,
  type OrderEconomicsEstimate,
  type OrderEconomicsInput,
  type PricingAdjustment,
  type PricingAuditReport,
  type PricingAuditSeverity,
  type PricingAuditWarning,
  type PricingAuditWarningCode,
} from "./audit"

export const ALL_PRICING = {
  ...VISTAKON_PRICING,
  ...BAUSCH_PRICING,
  ...COOPERVISION_PRICING,
  ...ALCON_PRICING,
}
