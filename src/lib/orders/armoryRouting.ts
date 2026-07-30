import {
  classifyOperationalQueue,
  type OperationalQueueBucket,
  type OperationalQueueOrder,
} from "./operationalQueue";

const ARMORY_LIFECYCLE_STATUSES = new Set([
  "ordered",
  "backordered",
  "shipped",
  "delivered",
  "completed",
]);

type ActiveDashboardLane =
  | "awaiting_verification"
  | "ready_to_order"
  | "resolve_exception";

function activeDashboardLane(
  bucket: OperationalQueueBucket,
): ActiveDashboardLane | null {
  if (
    bucket === "awaiting_verification" ||
    bucket === "ready_to_order" ||
    bucket === "resolve_exception"
  ) {
    return bucket;
  }

  return null;
}

export function getArmoryOrderRouting(order: OperationalQueueOrder) {
  const classification = classifyOperationalQueue(order);
  const fulfillmentStatus =
    order.fulfillment_status?.trim().toLowerCase() ?? "";
  const lifecycleOwner = ARMORY_LIFECYCLE_STATUSES.has(fulfillmentStatus)
    ? "armory"
    : "honest_lenses";
  const founderActionRequired =
    classification.bucket === "resolve_exception";

  return {
    classification,
    lifecycleOwner,
    activeDashboardLane: activeDashboardLane(classification.bucket),
    founderActionRequired,
    founderActionReasons: founderActionRequired
      ? classification.reasons
      : [],
  } as const;
}
