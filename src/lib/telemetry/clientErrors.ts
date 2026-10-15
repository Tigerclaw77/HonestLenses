"use client";

import posthog from "posthog-js";
import { supabase } from "@/lib/supabase-client";
import {
  POSTHOG_EVENTS,
  getDeviceType,
  isPostHogReady,
  type AnalyticsProperties,
} from "@/lib/posthog/client";
import {
  errorToAnalyticsProperties,
  sanitizeAnalyticsProperties,
} from "@/lib/posthog/events";
import { getBaseFunnelProperties, getClientAuthState } from "./funnel";

type ClientErrorContext = AnalyticsProperties & {
  source?: string;
  component?: string;
};

type UploadTelemetryState = {
  stage: string;
  has_file?: boolean;
  file_type?: string | null;
  file_size_bucket?: string | null;
  order_id?: string | null;
  verification_mode?: string | null;
};

const RECENT_ACTION_KEY = "hl_recent_user_action_v1";
const UPLOAD_STATE_KEY = "hl_upload_state_v1";
const MAX_STRING_LENGTH = 1400;
let globalHandlersInstalled = false;

function isBrowser() {
  return typeof window !== "undefined";
}

function scrubString(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(access_token|refresh_token|code|token|client_secret)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .slice(0, MAX_STRING_LENGTH);
}

function sanitizeForClientErrors(
  properties: AnalyticsProperties,
): AnalyticsProperties {
  const sanitized = sanitizeAnalyticsProperties(properties);
  const safe: AnalyticsProperties = {};

  for (const [key, value] of Object.entries(sanitized)) {
    safe[key] = typeof value === "string" ? scrubString(value) : value;
  }

  return safe;
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === "string" ? error : String(error));
}

export function recordRecentUserAction(
  action: string,
  properties: AnalyticsProperties = {},
) {
  if (!isBrowser()) return;

  const safe = sanitizeForClientErrors({
    action,
    route: window.location.pathname,
    action_at: Date.now(),
    ...properties,
  });

  window.sessionStorage.setItem(RECENT_ACTION_KEY, JSON.stringify(safe));
}

export function setCurrentUploadTelemetryState(state: UploadTelemetryState) {
  if (!isBrowser()) return;

  window.sessionStorage.setItem(
    UPLOAD_STATE_KEY,
    JSON.stringify(sanitizeForClientErrors(state)),
  );
}

export function clearCurrentUploadTelemetryState() {
  if (!isBrowser()) return;
  window.sessionStorage.removeItem(UPLOAD_STATE_KEY);
}

export async function captureClientError(
  error: unknown,
  context: ClientErrorContext = {},
) {
  if (!isPostHogReady()) return;

  const normalizedError = normalizeError(error);
  const authState = await getClientAuthState();
  const {
    data: { session },
  } = await supabase.auth.getSession().catch(() => ({
    data: { session: null },
  }));

  const base = getBaseFunnelProperties();
  const safeErrorProperties = errorToAnalyticsProperties(normalizedError);
  const safeProperties = {
    session_id: base.session_id,
    page_path: base.page_path,
    device_type: getDeviceType(),
    source: typeof context.source === "string" && /^[a-z_]{1,60}$/.test(context.source) ? context.source : "client",
    component: typeof context.component === "string" && /^[A-Za-z0-9_]{1,80}$/.test(context.component) ? context.component : "unknown",
    ...safeErrorProperties,
    auth_state: authState,
    has_auth_session: Boolean(session),
  };

  const safeError = new Error("[redacted]");
  safeError.name = String(safeErrorProperties.error_name);
  safeError.stack = `${safeError.name}: [redacted]`;
  posthog.captureException(safeError, safeProperties);
  posthog.capture(POSTHOG_EVENTS.CLIENT_ERROR, safeProperties);
}

export function installGlobalClientErrorHandlers() {
  if (!isBrowser() || globalHandlersInstalled) return;

  globalHandlersInstalled = true;

  function handleError(event: ErrorEvent) {
    void captureClientError(event.error ?? event.message, {
      source: "window_error",
      component: "global_window",
      error_filename: event.filename || null,
      error_lineno: event.lineno || null,
      error_colno: event.colno || null,
    });
  }

  function handleRejection(event: PromiseRejectionEvent) {
    void captureClientError(event.reason, {
      source: "unhandled_promise_rejection",
      component: "global_window",
    });
  }

  function handleClick(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const clickable = target.closest("button,a,[role='button']");
    if (!(clickable instanceof HTMLElement)) return;

    recordRecentUserAction("click", {
      target_tag: clickable.tagName.toLowerCase(),
      target_role: clickable.getAttribute("role"),
      target_type: clickable.getAttribute("type"),
      target_disabled:
        clickable.getAttribute("disabled") !== null ||
        clickable.getAttribute("aria-disabled") === "true",
    });
  }

  window.addEventListener("error", handleError);
  window.addEventListener("unhandledrejection", handleRejection);
  window.addEventListener("click", handleClick, true);
}
