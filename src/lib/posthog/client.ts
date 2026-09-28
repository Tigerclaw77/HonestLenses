"use client";

import posthog from "posthog-js";
import {
  POSTHOG_EVENTS,
  errorToAnalyticsProperties,
  sanitizeAnalyticsProperties,
  sanitizeAnalyticsPath,
  type AnalyticsProperties,
  type PostHogEventName,
} from "./events";
import { getPublicPostHogConfig } from "./config";

export { POSTHOG_EVENTS };
export type { AnalyticsProperties, PostHogEventName };

const TIMING_PREFIX = "hl_timing:";
const RETRY_PREFIX = "hl_retry:";
const LANDING_ATTRIBUTION_KEY = "hl_landing_attribution_v1";
const posthogConfig = getPublicPostHogConfig();

function isBrowser() {
  return typeof window !== "undefined";
}

function referrerHost(): string | null {
  if (!document.referrer) return null;
  try {
    return new URL(document.referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function getLandingAttributionProperties(): AnalyticsProperties {
  if (!isBrowser()) return {};

  const stored = window.sessionStorage.getItem(LANDING_ATTRIBUTION_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as AnalyticsProperties;
    } catch {
      window.sessionStorage.removeItem(LANDING_ATTRIBUTION_KEY);
    }
  }

  const params = new URLSearchParams(window.location.search);
  const host = referrerHost();
  const medium = params.get("utm_medium")?.slice(0, 120) ?? null;
  const hasPaidSignal =
    params.has("gclid") ||
    params.has("msclkid") ||
    Boolean(medium && /^(cpc|ppc|paid|paid_search)$/i.test(medium));
  const isSearchReferrer = Boolean(
    host &&
      /(^|\.)(google|bing|duckduckgo|yahoo)\.[a-z.]+$|(^|\.)search\.brave\.com$/i.test(
        host,
      ),
  );
  const attribution: AnalyticsProperties = {
    landing_page_path: sanitizeAnalyticsPath(window.location.pathname),
    landing_referrer_host: host,
    landing_utm_source: params.get("utm_source")?.slice(0, 120) ?? null,
    landing_utm_medium: medium,
    landing_utm_campaign: params.get("utm_campaign")?.slice(0, 120) ?? null,
    traffic_channel: hasPaidSignal
      ? "paid_search"
      : isSearchReferrer
        ? "organic_search"
        : host
          ? "referral"
          : "direct",
  };

  window.sessionStorage.setItem(
    LANDING_ATTRIBUTION_KEY,
    JSON.stringify(attribution),
  );
  return attribution;
}

export function isPostHogConfigured(): boolean {
  return posthogConfig.enabled;
}

export function isPostHogReady(): boolean {
  return isBrowser() && posthogConfig.enabled && posthog.__loaded;
}

export function getPostHogClientStatus() {
  return {
    configured: posthogConfig.enabled,
    loaded: isBrowser() ? posthog.__loaded : false,
    host: posthogConfig.host,
    replay_enabled: posthogConfig.replayEnabled,
    capture_exceptions_enabled: posthogConfig.captureExceptionsEnabled,
  };
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
  if (!isPostHogReady()) return;

  posthog.capture(event, {
    ...sanitizeAnalyticsProperties(properties),
    device_type: getDeviceType(),
    page_path: sanitizeAnalyticsPath(window.location.pathname),
    ...getLandingAttributionProperties(),
  });
}

export function identifyPostHogUser(user: {
  id: string;
  email?: string | null;
}) {
  if (!isPostHogReady()) return;

  const emailDomain = user.email?.split("@")[1]?.toLowerCase() ?? null;

  posthog.identify(user.id, {
    auth_state: "authenticated",
    email_domain: emailDomain,
  });
  posthog.register({ auth_state: "authenticated" });
}

export function resetPostHogUser() {
  if (!isPostHogReady()) return;

  posthog.reset();
  posthog.register({ auth_state: "anonymous" });
}

export function captureClientException(
  error: unknown,
  properties: AnalyticsProperties = {},
) {
  if (!isPostHogReady()) return;

  const safeProperties = sanitizeAnalyticsProperties({
    ...properties,
    ...errorToAnalyticsProperties(error),
    device_type: getDeviceType(),
    page_path: sanitizeAnalyticsPath(window.location.pathname),
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
