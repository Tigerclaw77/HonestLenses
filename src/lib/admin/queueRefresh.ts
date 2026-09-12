/** Serialize refreshes and retain one trailing refresh for changes during a request. */
export function createQueueRefresh(
  run: (isCurrent: () => boolean) => Promise<boolean>,
  now: () => number = Date.now,
) {
  let active = false;
  let generation = 0;
  let running: Promise<void> | null = null;
  let pending = false;
  let forced = false;
  let failures = 0;
  let nextAutomaticAt = 0;
  return {
    activate() { active = true; generation++; },
    deactivate() { active = false; generation++; pending = false; },
    request(force = true): Promise<void> {
      if (!active) return Promise.resolve();
      if (running) {
        pending = true;
        forced ||= force;
        return running;
      }
      if (!force && now() < nextAutomaticAt) return Promise.resolve();
      running = (async () => {
        do {
          pending = false;
          forced = false;
          const startedGeneration = generation;
          const ok = await run(() => active && generation === startedGeneration);
          if (!active) break;
          if (generation !== startedGeneration) continue;
          failures = ok ? 0 : failures + 1;
          nextAutomaticAt = ok ? 0 : now() + Math.min(120_000, 30_000 * 2 ** Math.min(failures - 1, 2));
          if (!ok && !forced) break;
        } while (active && pending);
      })().finally(() => { running = null; });
      return running;
    },
  };
}

export function isQueuePayload(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return ["awaiting_verification", "founder_review", "ready_to_order", "resolve_exception", "archive", "abandoned", "integrity_issues"]
    .every(key => Array.isArray(payload[key])) &&
    ["awaiting_verification", "founder_review", "ready_to_order", "resolve_exception", "archive"]
      .every(key => (payload[key] as unknown[]).every(row => {
        if (!row || typeof row !== "object") return false;
        const order = row as Record<string, unknown>;
        return typeof order.id === "string" && Boolean(order.operational_queue);
      }));
}
