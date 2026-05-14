"use client";

import posthog from "posthog-js";
import {
  POSTHOG_EVENTS,
  errorToAnalyticsProperties,
  sanitizeAnalyticsProperties,
  type AnalyticsProperties,
  type PostHogEventName,
} from "./events";

export { POSTHOG_EVENTS };
export type { AnalyticsProperties, PostHogEventName };

const TIMING_PREFIX = "hl_timing:";
const RETRY_PREFIX = "hl_retry:";

function isBrowser() {
  return typeof window !== "undefined";
}

export function isPostHogConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);
}

export function getDeviceType():
  | "mobile"
  | "tablet"
  | "desktop"
  | "unknown" {
  if (!isBrowser()) return "unknown";

  const width = window.innerWidth;
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function track(
  event: PostHogEventName,
  properties: AnalyticsProperties = {},
) {
  if (!isBrowser() || !isPostHogConfigured() || !posthog.__loaded) return;

  posthog.capture(event, {
    ...sanitizeAnalyticsProperties(properties),
    device_type: getDeviceType(),
    page_path: window.location.pathname,
  });
}

export function identifyPostHogUser(user: {
  id: string;
  email?: string | null;
}) {
  if (!isBrowser() || !isPostHogConfigured() || !posthog.__loaded) return;

  const emailDomain = user.email?.split("@")[1]?.toLowerCase() ?? null;

  posthog.identify(user.id, {
    auth_state: "authenticated",
    email_domain: emailDomain,
  });
  posthog.register({ auth_state: "authenticated" });
}

export function resetPostHogUser() {
  if (!isBrowser() || !isPostHogConfigured() || !posthog.__loaded) return;

  posthog.reset();
  posthog.register({ auth_state: "anonymous" });
}

export function captureClientException(
  error: unknown,
  properties: AnalyticsProperties = {},
) {
  if (!isBrowser() || !isPostHogConfigured() || !posthog.__loaded) return;

  const safeProperties = sanitizeAnalyticsProperties({
    ...properties,
    ...errorToAnalyticsProperties(error),
    device_type: getDeviceType(),
    page_path: window.location.pathname,
  });

  posthog.captureException(error, safeProperties);
  posthog.capture(POSTHOG_EVENTS.CLIENT_ERROR, safeProperties);
}

export function markStepStart(key: string) {
  if (!isBrowser()) return;
  sessionStorage.setItem(`${TIMING_PREFIX}${key}`, String(Date.now()));
}

export function getStepDurationMs(key: string): number | null {
  if (!isBrowser()) return null;

  const raw = sessionStorage.getItem(`${TIMING_PREFIX}${key}`);
  if (!raw) return null;

  const startedAt = Number(raw);
  if (!Number.isFinite(startedAt)) return null;

  return Math.max(0, Date.now() - startedAt);
}

export function consumeStepDurationMs(key: string): number | null {
  if (!isBrowser()) return null;

  const duration = getStepDurationMs(key);
  sessionStorage.removeItem(`${TIMING_PREFIX}${key}`);
  return duration;
}

export function incrementRetryCount(key: string): number {
  if (!isBrowser()) return 1;

  const storageKey = `${RETRY_PREFIX}${key}`;
  const current = Number(sessionStorage.getItem(storageKey) ?? "0");
  const next = Number.isFinite(current) ? current + 1 : 1;

  sessionStorage.setItem(storageKey, String(next));
  return next;
}
