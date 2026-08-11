"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import RxForm, { type RxDraft } from "@/components/RxForm";
import { resolveBrand } from "@/lib/resolveBrand";
import { lenses } from "@/LensCore";
import { POSTHOG_EVENTS } from "@/lib/posthog/client";
import { captureClientError } from "@/lib/telemetry/clientErrors";
import { trackFunnelEvent } from "@/lib/telemetry/funnel";
import { hasUploadedEvidenceWithoutPrescription } from "@/lib/uploadFlow";
import type { OcrExtract } from "@/types/ocr";

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
  const rightLens = searchParams.get("right")?.trim() || null;
  const leftLens = searchParams.get("left")?.trim() || null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialDraft, setInitialDraft] = useState<RxDraft | null>(null);
  const [ocrExtract, setOcrExtract] = useState<OcrExtract | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);

  const recoveryParams = new URLSearchParams();
  if (rightLens) recoveryParams.set("right", rightLens);
  if (leftLens) recoveryParams.set("left", leftLens);
  const recoveryQuery = recoveryParams.toString();
  const uploadHref = recoveryQuery
    ? `/upload-prescription?${recoveryQuery}`
    : "/upload-prescription";
  const manualHref = recoveryQuery
    ? `/enter-prescription?${recoveryQuery}`
    : "/enter-prescription";

  useEffect(() => {
    if (!orderId) {
      setError("Missing orderId");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);

        const res = await fetch(`/api/orders/${orderId}`, {
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(`Failed to load order (${res.status})`);
        }

        const json = await res.json();
        const order = json.order;

        if (hasUploadedEvidenceWithoutPrescription(order)) {
          setRecoveryRequired(true);
          setError(null);
          void trackFunnelEvent(POSTHOG_EVENTS.UPLOAD_RESUME_AFTER_AUTH, {
            resumed: false,
            reason: "uploaded_evidence_without_structured_rx",
            order_id: orderId,
          });
          return;
        }

        if (!order?.rx) {
          throw new Error("No prescription data found for this order");
        }

        const rx = order.rx as {
          left?: Eye;
          right?: Eye;
          expires?: string;
        };
        const rawOcr = order.rx_ocr_raw as Record<string, unknown> | null;

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
        const firstEye =
          rx.right && Object.keys(rx.right).length ? rx.right : rx.left;
        const rawBrand = String(firstEye?.brand_raw ?? "").trim();
        const resolved = rawBrand
          ? resolveBrand(
              {
                rawString: rawBrand,
                hasCyl: firstEye?.cylinder != null,
                hasAdd: Boolean(firstEye?.add),
                bc: firstEye?.base_curve ? Number(firstEye.base_curve) : null,
                dia: firstEye?.diameter ? Number(firstEye.diameter) : null,
              },
              lenses,
            )
          : null;
        setOcrExtract({
          patientName:
            typeof rawOcr?.patient_name === "string"
              ? rawOcr.patient_name
              : undefined,
          doctorName:
            typeof rawOcr?.doctor_name === "string"
              ? rawOcr.doctor_name
              : undefined,
          doctorPhone:
            typeof rawOcr?.prescriber_phone === "string"
              ? rawOcr.prescriber_phone
              : undefined,
          expires: rx.expires,
          proposedLensId: resolved?.lensId ?? null,
          proposalConfidence: resolved?.confidence ?? null,
        });
        setError(null);
        void trackFunnelEvent(POSTHOG_EVENTS.UPLOAD_RESUME_AFTER_AUTH, {
          resumed: true,
          stage: "confirm_loaded",
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

  if (recoveryRequired) {
    return (
      <div style={{ padding: 40 }}>
        <p>
          Your prescription image was saved, but the details could not be read
          automatically. Try a clearer JPG or PNG, or enter the details
          manually to continue.
        </p>
        <p>
          <Link href={uploadHref}>Try another image</Link>
          {" · "}
          <Link href={manualHref}>Enter prescription details</Link>
        </p>
      </div>
    );
  }

  if (!initialDraft) {
    return <div style={{ padding: 40 }}>No prescription data found.</div>;
  }

  return (
    <div style={{ padding: 40 }}>
      <RxForm mode="ocr" initialDraft={initialDraft} ocrExtract={ocrExtract ?? undefined} />
    </div>
  );
}
