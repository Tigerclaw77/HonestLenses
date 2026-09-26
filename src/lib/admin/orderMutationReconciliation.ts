export type OrderWithId = { id: string };

/**
 * Lazy detail records contain fields omitted from the queue projection, but the
 * queue is refreshed more often and owns the current operational state. Merge
 * every new authoritative queue projection into any cached detail record so an
 * open card cannot keep rendering stale status/action fields.
 */
export function reconcileCachedOrderDetails<T extends OrderWithId>(
  current: Record<string, T>,
  queueOrders: T[],
): Record<string, T> {
  if (Object.keys(current).length === 0) return current;

  const queueById = new Map(queueOrders.map((order) => [order.id, order]));
  let changed = false;
  const next = { ...current };

  for (const [orderId, detail] of Object.entries(current)) {
    const queueOrder = queueById.get(orderId);
    if (!queueOrder) continue;
    next[orderId] = { ...detail, ...queueOrder };
    changed = true;
  }

  return changed ? next : current;
}
