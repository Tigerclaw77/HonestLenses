"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import RxForm, { type RxDraft } from "@/components/RxForm";
import { supabase } from "@/lib/supabase-client";
import { resolveBrand } from "@/lib/resolveBrand";
import { lenses } from "@/LensCore";
import { POSTHOG_EVENTS } from "@/lib/posthog/client";
import { captureClientError } from "@/lib/telemetry/clientErrors";
import { trackFunnelEvent } from "@/lib/telemetry/funnel";

/* =========================
   TYPES
========================= */

type Eye = {
  sphere?: number | string;
  cylinder?: number | string;
  axis?: number | string;
  add?: string;
  base_curve?: string;
  diameter?: string;
  brand_raw?: string;
};

function toFixedSafe(val: unknown): string {
  if (val === null || val === undefined || val === "") return "";
  const num = Number(val);
  return !isNaN(num) ? num.toFixed(2) : "";
}

function toStringSafe(val: unknown): string {
  return val != null ? String(val) : "";
}

async function getSessionWithRetry(maxAttempts = 4) {
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

/* =========================
   COMPONENT
========================= */

export default function ConfirmClient() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialDraft, setInitialDraft] = useState<RxDraft | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError("Missing orderId");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);

        const { session, error: sessionError, attempts } =
          await getSessionWithRetry();

        if (!session?.access_token) {
          void trackFunnelEvent(POSTHOG_EVENTS.UPLOAD_RESUME_AFTER_AUTH, {
            resumed: false,
            reason: sessionError?.message ?? "missing_session_on_confirm",
            attempts,
            order_id: orderId,
          });
          throw new Error("No auth session found");
        }

        const res = await fetch(`/api/orders/${orderId}`, {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!res.ok) {
          throw new Error(`Failed to load order (${res.status})`);
        }

        const json = await res.json();
        const order = json.order;

        if (!order?.rx) {
          throw new Error("No prescription data found for this order");
        }

        const rx = order.rx as {
          left?: Eye;
          right?: Eye;
          expires?: string;
        };

        const mapEye = (eye?: Eye): RxDraft["left"] => {
          const rawString = (eye?.brand_raw ?? "").trim();

          const result = resolveBrand(
            {
              rawString,
              hasCyl: eye?.cylinder != null,
              hasAdd: eye?.add != null && eye?.add !== "",
              bc: eye?.base_curve ? Number(eye.base_curve) : null,
              dia: eye?.diameter ? Number(eye.diameter) : null,
            },
            lenses,
          );

          let coreId = result?.lensId ?? "";

          // 🔥 CRITICAL FIX — HARD FALLBACK
          if (!coreId && rawString) {
            const normalized = rawString.toLowerCase();

            const match = lenses.find((l) =>
              l.displayName.toLowerCase().includes(normalized),
            );

            if (match) {
              coreId = match.coreId;
              if (process.env.NODE_ENV === "development") {
                console.info("Rx brand fallback match used", {
                  matched: match.displayName,
                  coreId,
                });
              }
            }
          }

          // 🔍 DEBUG — DO NOT REMOVE YET
          if (process.env.NODE_ENV === "development") {
            console.info("Resolve brand debug", {
              has_raw_brand: Boolean(rawString),
              matched_lens: result?.lensId ?? null,
              finalCoreId: coreId,
            });
          }

          // 🚨 FAIL LOUD (temporary safety)
          if (!coreId && process.env.NODE_ENV === "development") {
            console.warn("No core id resolved for uploaded Rx eye");
          }

          return {
            coreId,
            sph: toFixedSafe(eye?.sphere),
            cyl: toFixedSafe(eye?.cylinder),
            axis: toStringSafe(eye?.axis),
            add: eye?.add ?? "",
            bc: toStringSafe(eye?.base_curve),
            color: "",
          };
        };

        const draft: RxDraft = {
          left: mapEye(rx.left),
          right: mapEye(rx.right),
          expires: rx.expires ?? "",
        };

        setInitialDraft(draft);
        setError(null);
        void trackFunnelEvent(POSTHOG_EVENTS.UPLOAD_RESUME_AFTER_AUTH, {
          resumed: true,
          stage: "confirm_loaded",
          attempts,
          order_id: orderId,
          has_right_lens: Boolean(draft.right.coreId),
          has_left_lens: Boolean(draft.left.coreId),
        });
      } catch (err: unknown) {
        void captureClientError(err, {
          source: "upload_confirm_load",
          component: "ConfirmClient",
          order_id: orderId,
        });
        void trackFunnelEvent(POSTHOG_EVENTS.UPLOAD_RESUME_AFTER_AUTH, {
          resumed: false,
          reason: err instanceof Error ? err.message : "confirm_load_failed",
          order_id: orderId,
        });

        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load prescription");
        }
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [orderId]);

  /* =========================
     UI STATES
  ========================= */

  if (loading) {
    return <div style={{ padding: 40 }}>Loading prescription...</div>;
  }

  if (error) {
    return <div style={{ padding: 40, color: "red" }}>{error}</div>;
  }

  if (!initialDraft) {
    return <div style={{ padding: 40 }}>No prescription data found.</div>;
  }

  return (
    <div style={{ padding: 40 }}>
      <RxForm initialDraft={initialDraft} />
    </div>
  );
}
