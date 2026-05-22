export type ShippingTier =
  | "express_flat"
  | "free_annual"
  | "vistakon_flat"
  | "alcon_flat"
  | "bausch_flat"
  | "coopervision_flat"
  | "default_flat";

export const EXPRESS_SHIPPING_CENTS = 2900;

export const SHIPPING_METHODS = ["standard", "express"] as const;

export type ShippingMethod = (typeof SHIPPING_METHODS)[number];

export type ResolveShippingInput = {
  manufacturer?: string | null;
  totalMonths: number;
  itemCount: number;
  hasMixedSkus?: boolean;
  shippingMethod?: ShippingMethod | null;
};

export type ShippingResolution = {
  shippingCents: number;
  tier: ShippingTier;
  label: string;
  shippingMethod: ShippingMethod;
};

function normalizeManufacturer(manufacturer?: string | null): string {
  return (manufacturer ?? "").trim().toLowerCase().replace(/[\s_-]/g, "");
}

export function isShippingMethod(value: unknown): value is ShippingMethod {
  return value === "standard" || value === "express";
}

export function normalizeShippingMethod(
  value?: string | null,
): ShippingMethod {
  return isShippingMethod(value) ? value : "standard";
}

export function resolveShipping({
  manufacturer,
  totalMonths,
  itemCount,
  hasMixedSkus = false,
  shippingMethod,
}: ResolveShippingInput): ShippingResolution {
  const normalizedTotalMonths = Math.max(0, totalMonths);
  const normalizedItemCount = Math.max(0, itemCount);
  const normalizedManufacturer = hasMixedSkus
    ? ""
    : normalizeManufacturer(manufacturer);
  const normalizedMethod = normalizeShippingMethod(shippingMethod);

  if (normalizedItemCount <= 0) {
    return {
      shippingCents: 1500,
      tier: "default_flat",
      label: "Standard shipping",
      shippingMethod: normalizedMethod,
    };
  }

  if (normalizedMethod === "express") {
    return {
      shippingCents: EXPRESS_SHIPPING_CENTS,
      tier: "express_flat",
      label: "Express shipping",
      shippingMethod: "express",
    };
  }

  if (normalizedManufacturer === "vistakon") {
    if (normalizedTotalMonths >= 12) {
      return {
        shippingCents: 0,
        tier: "free_annual",
        label: "Free annual supply shipping",
        shippingMethod: "standard",
      };
    }

    return {
      shippingCents: 1400,
      tier: "vistakon_flat",
      label: "Vistakon standard shipping",
      shippingMethod: "standard",
    };
  }

  if (normalizedManufacturer === "alcon") {
    if (normalizedTotalMonths >= 12) {
      return {
        shippingCents: 0,
        tier: "free_annual",
        label: "Free annual supply shipping",
        shippingMethod: "standard",
      };
    }

    return {
      shippingCents: 1200,
      tier: "alcon_flat",
      label: "Alcon standard shipping",
      shippingMethod: "standard",
    };
  }

  if (normalizedManufacturer === "bausch") {
    return {
      shippingCents: 1000,
      tier: "bausch_flat",
      label: "Bausch + Lomb standard shipping",
      shippingMethod: "standard",
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
      shippingMethod: "standard",
    };
  }

  return {
    shippingCents: 1500,
    tier: "default_flat",
    label: "Standard shipping",
    shippingMethod: "standard",
  };
}
