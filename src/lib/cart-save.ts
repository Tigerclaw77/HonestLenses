import { getResumeDestination, type RecoverableOrder } from "@/lib/order-recovery";

export type SaveableCartOrder = RecoverableOrder & {
  user_id?: string | null;
};

export function isSaveableCart(order: SaveableCartOrder): boolean {
  return Boolean(
    order.id &&
      order.status === "draft" &&
      !order.payment_intent_id &&
      getResumeDestination(order),
  );
}
