"use client";

import {
  POSTHOG_EVENTS,
  getDeviceType,
  track,
  type AnalyticsProperties,
  type PostHogEventName,
} from "@/lib/posthog/client";
import { supabase } from "@/lib/supabase-client";

type FunnelEvent = Extract<
  PostHogEventName,
  | typeof POSTHOG_EVENTS.HOMEPAGE_VIEWED
  | typeof POSTHOG_EVENTS.BROWSE_VIEWED
  | typeof POSTHOG_EVENTS.PRODUCT_MODAL_OPENED
  | typeof POSTHOG_EVENTS.UPLOAD_PRESCRIPTION_VIEWED
  | typeof POSTHOG_EVENTS.RX_METHOD_SELECTED
  | typeof POSTHOG_EVENTS.RX_FILE_PICKER_OPENED
  | typeof POSTHOG_EVENTS.RX_FILE_SELECTED
  | typeof POSTHOG_EVENTS.RX_UPLOAD_AUTH_REQUIRED
  | typeof POSTHOG_EVENTS.RX_UPLOAD_CTA_CLICKED_WITHOUT_FILE
  | typeof POSTHOG_EVENTS.RX_UPLOAD_RESUME_PROMPT_SHOWN
  | typeof POSTHOG_EVENTS.RX_UPLOAD_RESELECT_AFTER_AUTH_CLICKED
  | typeof POSTHOG_EVENTS.RX_UPLOAD_STARTED
  | typeof POSTHOG_EVENTS.RX_UPLOAD_COMPLETED
  | typeof POSTHOG_EVENTS.RX_UPLOAD_FAILED
  | typeof POSTHOG_EVENTS.LOGIN_REDIRECT_STARTED
  | typeof POSTHOG_EVENTS.AUTH_CALLBACK_RECEIVED
  | typeof POSTHOG_EVENTS.AUTH_SESSION_RESTORED
  | typeof POSTHOG_EVENTS.UPLOAD_RESUME_AFTER_AUTH
  | typeof POSTHOG_EVENTS.CHECKOUT_STARTED
  | typeof POSTHOG_EVENTS.PAYMENT_INTENT_CREATED
  | typeof POSTHOG_EVENTS.ORDER_AUTHORIZED
  | typeof POSTHOG_EVENTS.ORDER_CAPTURED
>;

const SAFE_UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

function isBrowser() {
  return typeof window !== "undefined";
}

function safeReferrer(): string | null {
  if (!isBrowser() || !document.referrer) return null;

  try {
    return new URL(document.referrer).hostname;
  } catch {
    return null;
  }
}

function currentRoute(): string {
  return isBrowser() ? window.location.pathname : "";
}

function currentUtm(): AnalyticsProperties {
  if (!isBrowser()) return {};

  const params = new URLSearchParams(window.location.search);
  const properties: AnalyticsProperties = {};

  SAFE_UTM_KEYS.forEach((key) => {
    const value = params.get(key);
    if (value) properties[key] = value.slice(0, 120);
  });

  return properties;
}

export async function getClientAuthState(): Promise<
  "authenticated" | "anonymous" | "unknown"
> {
  if (!isBrowser()) return "unknown";

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session ? "authenticated" : "anonymous";
  } catch {
    return "unknown";
  }
}

export function getBaseFunnelProperties(
  extra: AnalyticsProperties = {},
): AnalyticsProperties {
  return {
    session_id: ensureFunnelSessionId(),
    route: currentRoute(),
    page_path: currentRoute(),
    device_type: getDeviceType(),
    referrer_host: safeReferrer(),
    source: extra.source ?? "client",
    ...currentUtm(),
    ...extra,
  };
}

export async function trackFunnelEvent(
  event: FunnelEvent,
  properties: AnalyticsProperties = {},
) {
  track(event, {
    ...getBaseFunnelProperties(properties),
    auth_state: await getClientAuthState(),
  });
}

export function ensureFunnelSessionId(): string | null {
  if (!isBrowser()) return null;

  const existing = window.sessionStorage.getItem("hl_session_id");
  if (existing) return existing;

  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  window.sessionStorage.setItem("hl_session_id", next);
  return next;
}
