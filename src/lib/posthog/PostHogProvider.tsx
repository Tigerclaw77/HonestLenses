"use client";

import { useEffect, Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import posthog, { type Properties } from "posthog-js";
import { PostHogProvider as Provider } from "posthog-js/react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase-client";
import {
  identifyPostHogUser,
  resetPostHogUser,
  captureClientException,
} from "./client";
import { getPublicPostHogConfig } from "./config";
import { isSensitiveAnalyticsKey } from "./events";

const posthogConfig = getPublicPostHogConfig();
const posthogKey = posthogConfig.key;
let statusLogged = false;

function sanitizePostHogProperties(properties: Properties): Properties {
  const safe: Properties = {};

  for (const [key, value] of Object.entries(properties)) {
    safe[key] = isSensitiveAnalyticsKey(key) ? "[redacted]" : value;
  }

  return safe;
}

function logPostHogStatus(status: "disabled" | "loaded") {
  if (!posthogConfig.debugEnabled || statusLogged) return;

  statusLogged = true;

  if (status === "disabled") {
    console.info(
      "[posthog] disabled: NEXT_PUBLIC_POSTHOG_KEY is not configured.",
    );
    return;
  }

  if (posthogConfig.hostWasNormalized) {
    console.warn(
      `[posthog] NEXT_PUBLIC_POSTHOG_HOST was normalized to ${posthogConfig.host}. Use the ingestion host, not the dashboard URL.`,
    );
  }

  console.info("[posthog] initialized", {
    host: posthogConfig.host,
    replay_enabled: posthogConfig.replayEnabled,
    capture_exceptions_enabled: posthogConfig.captureExceptionsEnabled,
  });
}

if (typeof window !== "undefined" && !posthogConfig.enabled) {
  logPostHogStatus("disabled");
}

if (typeof window !== "undefined" && posthogKey && !posthog.__loaded) {
  posthog.init(posthogKey, {
    api_host: posthogConfig.host,
    defaults: "2026-01-30",
    capture_pageview: false,
    capture_pageleave: true,
    capture_dead_clicks: true,
    capture_exceptions: posthogConfig.captureExceptionsEnabled,
    disable_session_recording: !posthogConfig.replayEnabled,
    mask_all_element_attributes: true,
    mask_personal_data_properties: true,
    custom_personal_data_properties: [
      "email",
      "phone",
      "address",
      "dob",
      "patient",
      "doctor",
      "prescriber",
      "orderId",
      "order_id",
    ],
    person_profiles: "identified_only",
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: ".ph-mask,[data-ph-mask='true']",
      blockSelector:
        ".ph-block,[data-ph-block='true'],[data-ph-block-replay='true'],iframe",
    },
    sanitize_properties: sanitizePostHogProperties,
    loaded: (client) => {
      client.register({ auth_state: "anonymous" });
      logPostHogStatus("loaded");
    },
  });
}

function PageviewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!posthogKey || !posthog.__loaded) return;

    posthog.capture("$pageview", {
      path: pathname,
      url: window.location.origin + pathname,
    });
  }, [pathname]);

  return null;
}

function identifySessionUser(session: Session | null) {
  const user: User | undefined = session?.user;

  if (!user) {
    resetPostHogUser();
    return;
  }

  identifyPostHogUser({
    id: user.id,
    email: user.email ?? null,
  });
}

function IdentityStitcher() {
  useEffect(() => {
    let alive = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (alive) identifySessionUser(data.session);
      })
      .catch((error: unknown) => {
        captureClientException(error, { source: "posthog_identity" });
      });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        identifySessionUser(session);
      },
    );

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return null;
}

function ClientErrorListeners() {
  useEffect(() => {
    function handleError(event: ErrorEvent) {
      captureClientException(event.error ?? event.message, {
        source: "window_error",
      });
    }

    function handleRejection(event: PromiseRejectionEvent) {
      captureClientException(event.reason, {
        source: "unhandled_promise_rejection",
      });
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}

export function HonestPostHogProvider({ children }: { children: ReactNode }) {
  if (!posthogKey) {
    return <>{children}</>;
  }

  return (
    <Provider client={posthog}>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      <IdentityStitcher />
      <ClientErrorListeners />
      {children}
    </Provider>
  );
}
