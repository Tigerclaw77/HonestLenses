type QueryResult = { error: unknown; status?: number; statusText?: string };

/** Log query context, never query text, row data, tokens, or raw error details. */
export async function readQueueQuery<T extends QueryResult>(
  query: string,
  requestId: string,
  read: () => PromiseLike<T>,
): Promise<{ ok: true; result: T } | { ok: false }> {
  const started = Date.now();
  let error: unknown;
  let status: number | undefined;
  try {
    const result = await read();
    if (!result.error) return { ok: true, result };
    error = result.error;
    status = result.status;
  } catch (caught) {
    error = caught;
  }
  const upstream = error as { code?: unknown; message?: unknown; name?: unknown } | null;
  const message = typeof upstream?.message === "string" ? upstream.message : "";
  const category = /gateway.*timeout/i.test(message) ? "gateway_timeout"
    : /timeout|timed out|abort/i.test(message) ? "timeout"
    : /fetch|network|connect/i.test(message) ? "network"
    : "upstream_error";
  const log = query === "orders" ? console.error : console.warn;
  log("Admin queue query unavailable", {
    query, requestId, elapsedMs: Date.now() - started, status: status ?? null,
    code: typeof upstream?.code === "string" && /^[A-Z0-9_]{1,40}$/i.test(upstream.code)
      ? upstream.code : null,
    category,
  });
  return { ok: false };
}
