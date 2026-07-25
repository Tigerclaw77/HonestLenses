import { getPrice, type Manufacturer } from "@/lib/pricing/getPrice";
import { deriveTotalMonths } from "@/lib/shipping";
import {
  normalizeShippingMethod,
  resolveShipping,
  type ShippingMethod,
  type ShippingTier,
} from "@/lib/shipping/resolveShipping";

export type OrderPricingInput = {
  sku: string;
  totalBoxes: number;
  rightBoxCount?: number | null;
  leftBoxCount?: number | null;
  shippingMethod?: ShippingMethod | null;
};

export type OrderPricingQuote = {
  sku: string;
  manufacturer: Manufacturer;
  rightBoxCount: number | null;
  leftBoxCount: number | null;
  totalBoxes: number;
  totalMonths: number;
  pricePerBoxCents: number;
  productSubtotalCents: number;
  shippingMethod: ShippingMethod;
  shippingCents: number;
  shippingTier: ShippingTier;
  totalAmountCents: number;
  priceReason: string;
};

function quantity(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("Order quantity must be a non-negative integer.");
  }
  return value;
}

export function getAuthoritativeOrderQuote({
  sku,
  totalBoxes,
  rightBoxCount,
  leftBoxCount,
  shippingMethod,
}: OrderPricingInput): OrderPricingQuote {
  const right = quantity(rightBoxCount);
  const left = quantity(leftBoxCount);

  if (!Number.isInteger(totalBoxes) || totalBoxes <= 0) {
    throw new Error("Order total quantity must be a positive integer.");
  }

  if (right !== null && left !== null && right + left !== totalBoxes) {
    throw new Error("Order eye quantities do not match the total quantity.");
  }

  const pricing = getPrice({ sku, box_count: totalBoxes });
  const totalMonths = deriveTotalMonths({
    sku,
    totalBoxes,
    right_box_count: right,
    left_box_count: left,
  });
  const shipping = resolveShipping({
    manufacturer: pricing.manufacturer,
    totalMonths,
    itemCount: totalBoxes,
    hasMixedSkus: false,
    shippingMethod: normalizeShippingMethod(shippingMethod),
  });

  return {
    sku,
    manufacturer: pricing.manufacturer,
    rightBoxCount: right,
    leftBoxCount: left,
    totalBoxes,
    totalMonths,
    pricePerBoxCents: pricing.price_per_box_cents,
    productSubtotalCents: pricing.total_amount_cents,
    shippingMethod: shipping.shippingMethod,
    shippingCents: shipping.shippingCents,
    shippingTier: shipping.tier,
    totalAmountCents: pricing.total_amount_cents + shipping.shippingCents,
    priceReason: pricing.price_reason,
  };
}
