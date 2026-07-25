import {
  getAuthoritativeOrderQuantity,
  type AuthoritativeOrderQuantity,
  type OrderQuantityFields,
} from "./orderQuantity";
import {
  getCaptureAmountCents,
  type CaptureAmountOrder,
} from "@/lib/payments/captureAmount";

export type OrderCommerceFields = OrderQuantityFields & CaptureAmountOrder;

export type OrderCommerceProjection = {
  quantity: AuthoritativeOrderQuantity;
  billingAmountCents: number | null;
};

export function projectOrderCommerce(
  order: OrderCommerceFields,
): OrderCommerceProjection {
  let billingAmountCents: number | null = null;
  try {
    billingAmountCents = getCaptureAmountCents(order);
  } catch {
    billingAmountCents = null;
  }

  return {
    quantity: getAuthoritativeOrderQuantity(order),
    billingAmountCents,
  };
}
