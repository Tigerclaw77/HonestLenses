"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import Link from "next/link";
import Header from "../../components/Header";
import { Suspense } from "react";
import {
  POSTHOG_EVENTS,
  captureClientException,
  consumeStepDurationMs,
  markStepStart,
  track,
} from "@/lib/posthog/client";
import { getLensAnalyticsPropertiesByCoreId } from "@/lib/posthog/lensMetadata";
import {
  captureClientError,
  recordRecentUserAction,
  setCurrentUploadTelemetryState,
} from "@/lib/telemetry/clientErrors";
import { trackFunnelEvent } from "@/lib/telemetry/funnel";

const LS_ORDER_ID = "rx_upload_order_id";
const SS_PENDING_UPLOAD_INTENT = "hl_pending_upload_intent_v1";

const MAX_FILE_MB = 10;

type CartResponse = {
  hasCart?: boolean;
  order?: { id: string };
};

type CreateOrderResponse = {
  orderId?: string;
  error?: string;
};

type OcrResponse = {
  ok?: boolean;
  usable?: boolean;
  confidence?: number;
  error?: string;
};

function fileSizeBucket(size: number): string {
  if (size < 1_000_000) return "<1mb";
  if (size < 5_000_000) return "1-5mb";
  if (size < 10_000_000) return "5-10mb";
  return "10mb+";
}

function UploadPrescriptionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rightLens = searchParams.get("right")?.trim() || null;
  const leftLens = searchParams.get("left")?.trim() || null;
  const manualEntryHref = (() => {
    const params = new URLSearchParams();

    if (rightLens) params.set("right", rightLens);
    if (leftLens) params.set("left", leftLens);

    const query = params.toString();
    return query ? `/enter-prescription?${query}` : "/enter-prescription";
  })();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void trackFunnelEvent(POSTHOG_EVENTS.UPLOAD_PRESCRIPTION_VIEWED, {
      ...selectedLensAnalytics("upload_prescription_view"),
    });

    const pendingRaw = sessionStorage.getItem(SS_PENDING_UPLOAD_INTENT);
    if (!pendingRaw) return;

    sessionStorage.removeItem(SS_PENDING_UPLOAD_INTENT);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!data.session) {
          void trackFunnelEvent(POSTHOG_EVENTS.UPLOAD_RESUME_AFTER_AUTH, {
            resumed: false,
            reason: "no_session_after_redirect",
          });
          return;
        }

        // Browsers intentionally do not persist selected local files through
        // a magic-link redirect. Surface a clear recovery path instead of
        // leaving the CTA disabled and producing dead-click noise.
        setError("Please choose your prescription file again to continue.");
        void trackFunnelEvent(POSTHOG_EVENTS.UPLOAD_RESUME_AFTER_AUTH, {
          resumed: false,
          reason: "file_reselect_required",
          ...selectedLensAnalytics("upload_resume_after_auth"),
        });
      })
      .catch((err: unknown) => {
        void captureClientError(err, {
          source: "upload_resume_after_auth",
          component: "UploadPrescriptionContent",
        });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- page-view telemetry should run once per mounted route.
  }, []);

  function selectedLensAnalytics(source: string) {
    return {
      ...getLensAnalyticsPropertiesByCoreId(rightLens ?? leftLens, { source }),
      right_core_id: rightLens,
      left_core_id: leftLens,
      has_mixed_lenses: Boolean(
        rightLens && leftLens && rightLens !== leftLens,
      ),
    };
  }

  function validateFile(selected: File): string | null {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/heic",
      "application/pdf",
    ];

    if (!allowedTypes.includes(selected.type)) {
      return "Please upload a JPG, PNG, HEIC, or PDF file.";
    }

    if (selected.size > MAX_FILE_MB * 1024 * 1024) {
      return `File must be under ${MAX_FILE_MB}MB.`;
    }

    return null;
  }

  function handleFileSelected(selected: File | null) {
    if (!selected) return;

    recordRecentUserAction("rx_file_selected", {
      file_type: selected.type || "unknown",
      file_size_bucket: fileSizeBucket(selected.size),
    });

    const validation = validateFile(selected);

    if (validation) {
      setError(validation);
      track(POSTHOG_EVENTS.VALIDATION_ERROR, {
        step: "rx_upload_file_select",
        reason: validation,
        file_type: selected.type || "unknown",
        file_size_bytes: selected.size,
      });
      return;
    }

    setError(null);
    setFile(selected);
    setCurrentUploadTelemetryState({
      stage: "file_selected",
      has_file: true,
      file_type: selected.type || "unknown",
      file_size_bucket: fileSizeBucket(selected.size),
      verification_mode: "upload",
    });
    markStepStart("rx_upload");
    track(POSTHOG_EVENTS.RX_METHOD_SELECTED, {
      ...selectedLensAnalytics("upload_prescription"),
      verification_mode: "upload",
    });
    track(POSTHOG_EVENTS.RX_UPLOAD_STARTED, {
      ...selectedLensAnalytics("upload_prescription"),
      file_type: selected.type || "unknown",
      file_size_bytes: selected.size,
    });
  }

  function clearFile() {
    setFile(null);
    setCurrentUploadTelemetryState({
      stage: "file_cleared",
      has_file: false,
      verification_mode: "upload",
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function getOrCreateDraftOrder(accessToken: string): Promise<string> {
    const cartRes = await fetch("/api/cart", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (cartRes.ok) {
      const cart: CartResponse = await cartRes.json();
      if (cart.hasCart && cart.order?.id) {
        return cart.order.id;
      }
    }

    const orderRes = await fetch("/api/orders", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    const body: CreateOrderResponse = await orderRes.json();

    if (!orderRes.ok || !body.orderId) {
      throw new Error(body.error ?? "Failed to create order");
    }

    return body.orderId;
  }

  async function submitUpload() {
    recordRecentUserAction("rx_upload_submit_click", {
      has_file: Boolean(file),
      loading,
    });

    if (!file || loading) return;

    setLoading(true);
    setError(null);
    setCurrentUploadTelemetryState({
      stage: "submit_started",
      has_file: true,
      file_type: file.type || "unknown",
      file_size_bucket: fileSizeBucket(file.size),
      verification_mode: "upload",
    });

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        const next = window.location.pathname + window.location.search;
        sessionStorage.setItem(
          SS_PENDING_UPLOAD_INTENT,
          JSON.stringify({
            route: next,
            has_file: true,
            file_type: file.type || "unknown",
            file_size_bucket: fileSizeBucket(file.size),
            at: Date.now(),
          }),
        );
        void trackFunnelEvent(POSTHOG_EVENTS.LOGIN_REDIRECT_STARTED, {
          reason: "rx_upload_requires_auth",
          next_route: next,
          has_file: true,
          file_type: file.type || "unknown",
          file_size_bucket: fileSizeBucket(file.size),
          ...selectedLensAnalytics("rx_upload_login_redirect"),
        });
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }

      const orderId = await getOrCreateDraftOrder(session.access_token);

      localStorage.setItem(LS_ORDER_ID, orderId);
      setCurrentUploadTelemetryState({
        stage: "order_ready",
        has_file: true,
        file_type: file.type || "unknown",
        file_size_bucket: fileSizeBucket(file.size),
        order_id: orderId,
        verification_mode: "upload",
      });

      const formData = new FormData();
      formData.append("file", file);

      const ocrRes = await fetch(`/api/orders/${orderId}/rx-ocr`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const ocrBody: OcrResponse = await ocrRes.json().catch(() => ({}));
      const uploadDurationMs = consumeStepDurationMs("rx_upload");

      if (!ocrRes.ok) {
        track(POSTHOG_EVENTS.RX_UPLOAD_FAILED, {
          ...selectedLensAnalytics("rx_upload_failed"),
          order_id: orderId,
          reason: ocrBody.error ?? "Upload failed",
          upload_duration_ms: uploadDurationMs,
        });
        track(POSTHOG_EVENTS.OCR_FAILED, {
          ...selectedLensAnalytics("rx_ocr"),
          order_id: orderId,
          reason: ocrBody.error ?? "Upload failed",
          upload_duration_ms: uploadDurationMs,
        });
        throw new Error(ocrBody.error ?? "Upload failed");
      }

      if (ocrBody.usable === false) {
        track(POSTHOG_EVENTS.OCR_FAILED, {
          ...selectedLensAnalytics("rx_ocr"),
          order_id: orderId,
          reason: "ocr_not_usable",
          confidence: ocrBody.confidence ?? null,
          upload_duration_ms: uploadDurationMs,
        });
      }

      track(POSTHOG_EVENTS.RX_UPLOAD_COMPLETED, {
        ...selectedLensAnalytics("rx_upload_completed"),
        order_id: orderId,
        file_type: file.type || "unknown",
        file_size_bytes: file.size,
        upload_duration_ms: uploadDurationMs,
        ocr_usable: ocrBody.usable ?? null,
        confidence: ocrBody.confidence ?? null,
      });

      const params = new URLSearchParams({
        orderId,
      });

      if (rightLens) params.set("right", rightLens);
      if (leftLens) params.set("left", leftLens);

      router.push(`/upload-prescription/confirm?${params.toString()}`);
    } catch (err: unknown) {
      captureClientException(err, { source: "rx_upload_submit" });
      void captureClientError(err, {
        source: "rx_upload_submit",
        component: "UploadPrescriptionContent",
      });
      track(POSTHOG_EVENTS.RX_UPLOAD_FAILED, {
        ...selectedLensAnalytics("rx_upload_failed"),
        reason: err instanceof Error ? err.message : "Upload failed",
      });

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Upload failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header variant="shop" />

      <main>
        <section className="content-shell">
          <h2 className="rx-choice-title">
            How would you like to provide your prescription?
          </h2>

          <p
            style={{
              color: "rgba(255,255,255,0.78)",
              maxWidth: 760,
              lineHeight: 1.6,
              margin: "0 auto 22px",
              textAlign: "center",
            }}
          >
            A valid, unexpired contact lens prescription is required before
            lenses can ship. Uploading lets us read the prescription and prefill
            the next step; you will still review the details before checkout.
          </p>

          <div className="rx-choice-grid">
            {/* Upload Card */}

            <div
              className={`rx-choice-card rx-dropzone ${file ? "has-file" : ""}`}
              onClick={() => {
                recordRecentUserAction("rx_upload_dropzone_click", {
                  has_file: Boolean(file),
                  loading,
                });
                fileInputRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                recordRecentUserAction("rx_upload_drag_over", {
                  has_file: Boolean(file),
                });
              }}
              onDrop={(e) => {
                e.preventDefault();
                recordRecentUserAction("rx_upload_drop", {
                  file_count: e.dataTransfer.files?.length ?? 0,
                });
                const dropped = e.dataTransfer.files?.[0] ?? null;
                handleFileSelected(dropped);
              }}
            >
              <h3>Upload or take a photo</h3>

              <p className="rx-upload-subtitle">
                Upload a clear photo or PDF of the official prescription.
              </p>

              <p className="rx-upload-hint">
                OCR helps us read the document. If anything is unclear, we will
                guide you through review before fulfillment.
              </p>

              {file && (
                <div
                  style={{
                    marginTop: 20,
                    marginBottom: 24,
                    padding: 14,
                    borderRadius: 14,
                    background: "rgba(34,197,94,0.08)",
                    border: "1px solid rgba(34,197,94,0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <span style={{ fontSize: 18 }}>✔</span>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>
                      Prescription uploaded
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearFile();
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#f87171",
                      fontSize: 16,
                      cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={(e) =>
                  handleFileSelected(e.target.files?.[0] ?? null)
                }
                hidden
              />

              <button
                className="primary-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  recordRecentUserAction("rx_upload_cta_click", {
                    has_file: Boolean(file),
                    loading,
                  });
                  if (!file) {
                    void trackFunnelEvent(POSTHOG_EVENTS.RX_UPLOAD_FAILED, {
                      ...selectedLensAnalytics("rx_upload_cta_without_file"),
                      reason: "continue_clicked_without_file",
                    });
                    fileInputRef.current?.click();
                    return;
                  }
                  submitUpload();
                }}
                aria-disabled={!file || loading}
                style={{
                  opacity: !file || loading ? 0.72 : 1,
                  cursor: loading ? "wait" : "pointer",
                }}
              >
                {loading ? "Uploading…" : "Continue to cart"}
              </button>

              {error && <p className="order-error">{error}</p>}
            </div>

            {/* Manual Entry */}

            <div className="rx-choice-card rx-choice-manual">
              <h3>Enter it manually</h3>

              <p className="rx-manual-subtitle">
                Don’t have it with you right now?
              </p>

              <p className="rx-manual-hint">
                You can enter your prescription details manually. If we need to
                confirm details, we may contact your prescriber before shipping.
              </p>

              <Link
                href={manualEntryHref}
                className="primary-btn"
                onClick={() => {
                  recordRecentUserAction("rx_manual_entry_link_click", {
                    has_right_lens: Boolean(rightLens),
                    has_left_lens: Boolean(leftLens),
                  });
                  track(POSTHOG_EVENTS.RX_METHOD_SELECTED, {
                    ...selectedLensAnalytics("upload_prescription"),
                    verification_mode: "manual",
                  });
                }}
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  textAlign: "center",
                }}
              >
                Enter prescription manually
              </Link>
            </div>
          </div>

          <p className="order-fineprint">
            Prescription information is used to verify and fill your order.
            Payment and fulfillment only proceed after the required review.
          </p>
        </section>
      </main>
    </>
  );
}

export default function UploadPrescriptionPage() {
  return (
    <Suspense fallback={null}>
      <UploadPrescriptionContent />
    </Suspense>
  );
}
