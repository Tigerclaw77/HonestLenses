export type RequestFeedback = { state: "sent" | "rate-limited" | "failed"; retrySeconds: number };

export function reorderRequestFeedback(status: number, retryAfter: string | null): RequestFeedback {
  if (status >= 200 && status < 300) return { state: "sent", retrySeconds: 60 };
  if (status === 429) {
    const seconds = Number(retryAfter);
    return { state: "rate-limited",
      retrySeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 60 };
  }
  return { state: "failed", retrySeconds: 0 };
}
