export type ShippingTier =
  | "free_annual"
  | "vistakon_flat"
  | "alcon_flat"
  | "bausch_flat"
  | "coopervision_flat"
  | "default_flat";

export type ResolveShippingInput = {
  manufacturer?: string | null;
  totalMonths: number;
  itemCount: number;
  hasMixedSkus?: boolean;
};

export type ShippingResolution = {
  shippingCents: number;
  tier: ShippingTier;
  label: string;
};

function normalizeManufacturer(manufacturer?: string | null): string {
  return (manufacturer ?? "").trim().toLowerCase().replace(/[\s_-]/g, "");
}

export function resolveShipping({
  manufacturer,
  totalMonths,
  itemCount,
  hasMixedSkus = false,
}: ResolveShippingInput): ShippingResolution {
  const normalizedTotalMonths = Math.max(0, totalMonths);
  const normalizedItemCount = Math.max(0, itemCount);
  const normalizedManufacturer = hasMixedSkus
    ? ""
    : normalizeManufacturer(manufacturer);

  if (normalizedItemCount <= 0) {
    return {
      shippingCents: 1500,
      tier: "default_flat",
      label: "Standard shipping",
    };
  }

  if (normalizedManufacturer === "vistakon") {
    if (normalizedTotalMonths >= 12) {
      return {
        shippingCents: 0,
        tier: "free_annual",
        label: "Free annual supply shipping",
      };
    }

    return {
      shippingCents: 1400,
      tier: "vistakon_flat",
      label: "Vistakon standard shipping",
    };
  }

  if (normalizedManufacturer === "alcon") {
    if (normalizedTotalMonths >= 12) {
      return {
        shippingCents: 0,
        tier: "free_annual",
        label: "Free annual supply shipping",
      };
    }

    return {
      shippingCents: 1200,
      tier: "alcon_flat",
      label: "Alcon standard shipping",
    };
  }

  if (normalizedManufacturer === "bausch") {
    return {
      shippingCents: 1000,
      tier: "bausch_flat",
      label: "Bausch + Lomb standard shipping",
    };
  }

  if (
    normalizedManufacturer === "coopervision" ||
    normalizedManufacturer === "coop"
  ) {
    return {
      shippingCents: 1500,
      tier: "coopervision_flat",
      label: "CooperVision standard shipping",
    };
  }

  return {
    shippingCents: 1500,
    tier: "default_flat",
    label: "Standard shipping",
  };
}
