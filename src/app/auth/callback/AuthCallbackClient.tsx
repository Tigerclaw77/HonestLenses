"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { POSTHOG_EVENTS } from "@/lib/posthog/client";
import { captureClientError } from "@/lib/telemetry/clientErrors";
import { trackFunnelEvent } from "@/lib/telemetry/funnel";

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

async function waitForSession(maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (session || error || attempt === maxAttempts) {
      return { session, error, attempts: attempt };
    }

    await new Promise((resolve) => window.setTimeout(resolve, 200));
  }

  return { session: null, error: null, attempts: maxAttempts };
}

export default function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let alive = true;

    async function finish() {
      const next = safeNextPath(searchParams.get("next"));
      const code = searchParams.get("code");
      const error = searchParams.get("error");
      const errorDescription = searchParams.get("error_description");

      void trackFunnelEvent(POSTHOG_EVENTS.AUTH_CALLBACK_RECEIVED, {
        has_code: Boolean(code),
        has_error: Boolean(error),
        next_route: next,
      });

      if (error) {
        void trackFunnelEvent(POSTHOG_EVENTS.AUTH_SESSION_RESTORED, {
          restored: false,
          reason: errorDescription ?? error,
          next_route: next,
        });
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }

      try {
        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) throw exchangeError;
        }

        const { session, error: sessionError, attempts } =
          await waitForSession();

        if (sessionError) throw sessionError;

        if (!alive) return;

        if (session) {
          void trackFunnelEvent(POSTHOG_EVENTS.AUTH_SESSION_RESTORED, {
            restored: true,
            attempts,
            next_route: next,
          });

          if (next.startsWith("/upload-prescription")) {
            void trackFunnelEvent(POSTHOG_EVENTS.UPLOAD_RESUME_AFTER_AUTH, {
              resumed: true,
              stage: "callback_redirecting_to_upload",
              next_route: next,
            });
          }

          router.replace(next);
        } else {
          void trackFunnelEvent(POSTHOG_EVENTS.AUTH_SESSION_RESTORED, {
            restored: false,
            reason: "missing_session_after_callback",
            attempts,
            next_route: next,
          });
          router.replace(`/login?next=${encodeURIComponent(next)}`);
        }
      } catch (err: unknown) {
        if (!alive) return;

        void captureClientError(err, {
          source: "auth_callback",
          component: "AuthCallbackClient",
        });
        void trackFunnelEvent(POSTHOG_EVENTS.AUTH_SESSION_RESTORED, {
          restored: false,
          reason: err instanceof Error ? err.message : "auth_callback_failed",
          next_route: next,
        });
        router.replace(`/login?next=${encodeURIComponent(next)}`);
      }
    }

    void finish();
    return () => {
      alive = false;
    };
  }, [router, searchParams]);

  return <main className="content-shell">Signing you in…</main>;
}
