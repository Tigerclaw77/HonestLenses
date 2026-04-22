"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import RxForm, { type RxDraft } from "@/components/RxForm";
import { supabase } from "@/lib/supabase-client";
import { resolveBrand } from "@/lib/resolveBrand";
import { lenses } from "@/LensCore";

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

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        console.log("SESSION DEBUG", { session, sessionError });

        if (!session?.access_token) {
          throw new Error("No auth session found");
        }

        const res = await fetch(`/api/orders/${orderId}`, {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        console.log("FETCH STATUS", res.status);

        if (!res.ok) {
          const text = await res.text();
          console.error("FETCH ERROR BODY", text);
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

        console.log("ORDER RX RAW DATA", rx);

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
              l.displayName.toLowerCase().includes(normalized)
            );

            if (match) {
              coreId = match.coreId;
              console.log("🟨 FALLBACK MATCH USED", {
                rawString,
                matched: match.displayName,
                coreId,
              });
            }
          }

          // 🔍 DEBUG — DO NOT REMOVE YET
          console.log("RESOLVE BRAND DEBUG", {
            rawString,
            result,
            finalCoreId: coreId,
          });

          // 🚨 FAIL LOUD (temporary safety)
          if (!coreId) {
            console.warn("⚠️ NO CORE ID FOR EYE", eye);
          }

          return {
            coreId,
            brand: eye?.brand_raw ?? "",
            sph: toFixedSafe(eye?.sphere),
            cyl: toFixedSafe(eye?.cylinder),
            axis: toStringSafe(eye?.axis),
            add: eye?.add ?? "",
            bc: toStringSafe(eye?.base_curve),
            dia: toStringSafe(eye?.diameter),
            color: "",
          };
        };

        const draft: RxDraft = {
          left: mapEye(rx.left),
          right: mapEye(rx.right),
          expires: rx.expires ?? "",
        };

        console.log("MAPPED DRAFT", draft);

        setInitialDraft(draft);
        setError(null);
      } catch (err: unknown) {
        console.error("CONFIRM LOAD ERROR", err);

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