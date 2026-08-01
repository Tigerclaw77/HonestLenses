export const ORDER_ROW_CONTROL_SELECTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  '[role="button"]',
  '[role="link"]',
  '[contenteditable="true"]',
  "[data-order-row-control]",
].join(", ");

type ClosestCapableTarget = EventTarget & {
  closest?: (selector: string) => unknown;
};

export function isOrderRowControlTarget(target: EventTarget | null): boolean {
  if (!target) return false;

  const closest = (target as ClosestCapableTarget).closest;
  if (typeof closest !== "function") return false;

  return Boolean(closest.call(target, ORDER_ROW_CONTROL_SELECTOR));
}
