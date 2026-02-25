export type Manufacturer = "vistakon" | "alcon" | "bausch" | "coop"

interface ShippingInput {
  manufacturer: Manufacturer
  totalMonthsAcrossOrder: number
}

export function resolveShipping({
  manufacturer,
  totalMonthsAcrossOrder,
}: ShippingInput): number {
  switch (manufacturer) {
    case "vistakon":
      // Free if 12+ months total supply across order
      if (totalMonthsAcrossOrder >= 12) return 0
      return 1400

    // Future manufacturers (MVP stub)
    case "alcon":
    case "bausch":
    case "coop":
      throw new Error(`Shipping logic not implemented for ${manufacturer}`)

    default:
      throw new Error(`Unknown manufacturer: ${manufacturer}`)
  }
}