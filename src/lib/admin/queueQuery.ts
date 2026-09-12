type QueryResult = { error: unknown; status?: number; statusText?: string };

/** Retry only the supplied read; the caller invokes downstream work once. */
export async function readPrimaryOrders<T extends QueryResult>(
  requestId: string,
  read: () => PromiseLike<T>,
): Promise<{ ok: true; result: T } | { ok: false }> {
  return readWithRetry("orders", requestId, read);
}

async function readWithRetry<T extends QueryResult>(
  query: "orders" | "recovery_count" | "order_activity" | "manual_recovery_review",
  requestId: string,
  read: () => PromiseLike<T>,
): Promise<{ ok: true; result: T } | { ok: false }> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    let result: T | undefined;
    let error: unknown;
    try {
      result = await read();
      error = result.error;
    } catch (caught) {
      error = caught;
    }
    const upstream = error as { code?: unknown; message?: unknown; cause?: { code?: unknown } } | null;
    const rawCode = upstream?.code || upstream?.cause?.code;
    const code = typeof rawCode === "string" && /^[A-Z0-9_]{1,40}$/i.test(rawCode) ? rawCode : null;
    const message = typeof upstream?.message === "string" ? upstream.message : "";
    const status = result?.status ?? null;
    const ok = Boolean(result && !error);
    // A known deterministic code/status takes precedence over timeout wording.
    const transientCodes = ["PGRST003", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"];
    const transientCode = code !== null && transientCodes.includes(code);
    const transientStatus = status !== null && [502, 503, 504].includes(status);
    const transportMessage = /^(?:(?:TypeError|FetchError|Error):\s*)?(?:fetch failed|failed to fetch|network fetch failed|gateway timeout|network request failed|connection timed out|request timed out)\.?$/i.test(message.trim());
    const transient = (!rawCode || transientCode) &&
      (transientStatus || ((status === null || status === 0) && (transientCode || transportMessage)));
    const retryScheduled = !ok && attempt === 1 && transient;
    const category = ok ? "success" : !transient ? "non_retryable" : transientStatus && status === 504 ? "gateway_timeout"
      : transientCode || transportMessage ? "transient_transport" : transientStatus ? "upstream_unavailable" : "non_retryable";
    const log = ok ? console.info : retryScheduled || query !== "orders" ? console.warn : console.error;
    // postgrest-js does not expose response headers on its result. Do not log
    // request headers or raw error details in an attempt to obtain correlation IDs.
    log(query === "orders" ? "Admin queue primary read" : "Admin queue auxiliary read", {
      query, requestId, attempt, elapsedMs: Date.now() - started,
      status, code, category, retryScheduled, recovered: ok && attempt === 2,
    });
    if (ok && result) return { ok: true, result };
    if (!retryScheduled) return { ok: false };
    await new Promise(resolve => setTimeout(resolve, 150 + Math.floor(Math.random() * 101)));
  }
  return { ok: false };
}

/** Each auxiliary attempt has its own deadline and retry budget. */
export async function readQueueQuery<T extends QueryResult>(
  query: "recovery_count" | "order_activity" | "manual_recovery_review",
  requestId: string,
  read: (signal: AbortSignal) => PromiseLike<T>,
): Promise<{ ok: true; result: T } | { ok: false }> {
  return readWithRetry(query, requestId, async () => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(Object.assign(new Error("Auxiliary read timed out"), { code: "ETIMEDOUT" }));
        controller.abort();
      }, 6_000);
    });
    try {
      return await Promise.race([Promise.resolve(read(controller.signal)), deadline]);
    } finally {
      clearTimeout(timer);
    }
  });
}
