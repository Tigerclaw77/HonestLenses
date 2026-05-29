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
import { getLensDisplayName } from "@/lib/cart/display";
import { getLensAnalyticsPropertiesByCoreId } from "@/lib/posthog/lensMetadata";
import {
  captureClientError,
  recordRecentUserAction,
  setCurrentUploadTelemetryState,
} from "@/lib/telemetry/clientErrors";
import { trackFunnelEvent } from "@/lib/telemetry/funnel";

const LS_ORDER_ID = "rx_upload_order_id";
const SS_PENDING_UPLOAD_INTENT = "hl_pending_upload_intent_v1";
const LS_PENDING_UPLOAD_INTENT = "hl_pending_upload_intent_v1";

const MAX_FILE_MB = 10;
const PENDING_UPLOAD_INTENT_MAX_AGE_MS = 30 * 60 * 1000;

type AuthStatus = "checking" | "authenticated" | "anonymous";
type UploadIntentTrigger =
  | "dropzone"
  | "cta_without_file"
  | "drop"
  | "file_selected_without_auth";

type PendingUploadIntent = {
  flow?: string;
  route?: string;
  right?: string | null;
  left?: string | null;
  trigger?: string;
  at?: number;
};

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

function safeFileExtension(file: File): string | null {
  const match = /\.([a-z0-9]{1,8})$/i.exec(file.name || "");
  return match ? match[1].toLowerCase() : null;
}

function safeFileTelemetry(file: File) {
  return {
    file_type: file.type || "unknown",
    file_extension: safeFileExtension(file),
    file_size_bucket: fileSizeBucket(file.size),
  };
}

function UploadPrescriptionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rightLens = searchParams.get("right")?.trim() || null;
  const leftLens = searchParams.get("left")?.trim() || null;
  const selectedLensSummary = (() => {
    if (rightLens && leftLens && rightLens === leftLens) {
      return `Both eyes: ${getLensDisplayName(rightLens, null)}`;
    }

    const parts = [
      rightLens ? `Right eye: ${getLensDisplayName(rightLens, null)}` : null,
      leftLens ? `Left eye: ${getLensDisplayName(leftLens, null)}` : null,
    ].filter((part): part is string => Boolean(part));

    return parts.join(" | ");
  })();
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
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [resumePromptVisible, setResumePromptVisible] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setAuthStatus(data.session ? "authenticated" : "anonymous");
      })
      .catch(() => {
        if (!active) return;
        setAuthStatus("anonymous");
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthStatus(session ? "authenticated" : "anonymous");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void trackFunnelEvent(POSTHOG_EVENTS.UPLOAD_PRESCRIPTION_VIEWED, {
      ...selectedLensAnalytics("upload_prescription_view"),
    });

    const pendingRaw =
      sessionStorage.getItem(SS_PENDING_UPLOAD_INTENT) ??
      localStorage.getItem(LS_PENDING_UPLOAD_INTENT);
    if (!pendingRaw) return;

    const pendingIntent = (() => {
      try {
        return JSON.parse(pendingRaw) as PendingUploadIntent;
      } catch {
        return null;
      }
    })();

    if (!isCurrentPendingUploadIntent(pendingIntent)) {
      clearPendingUploadIntent();
      return;
    }

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

        clearPendingUploadIntent();

        // Browsers intentionally do not persist selected local files through
        // a magic-link redirect. Surface a clear recovery path instead of
        // leaving the CTA disabled and producing dead-click noise.
        setError(null);
        setResumePromptVisible(true);
        void trackFunnelEvent(POSTHOG_EVENTS.UPLOAD_RESUME_AFTER_AUTH, {
          resumed: false,
          reason: "file_reselect_required",
          trigger: pendingIntent?.trigger ?? "unknown",
          ...selectedLensAnalytics("upload_resume_after_auth"),
        });
        void trackFunnelEvent(POSTHOG_EVENTS.RX_UPLOAD_RESUME_PROMPT_SHOWN, {
          trigger: pendingIntent?.trigger ?? "unknown",
          ...selectedLensAnalytics("rx_upload_resume_prompt"),
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

  function currentUploadRoute() {
    return window.location.pathname + window.location.search;
  }

  function clearPendingUploadIntent() {
    sessionStorage.removeItem(SS_PENDING_UPLOAD_INTENT);
    localStorage.removeItem(LS_PENDING_UPLOAD_INTENT);
  }

  function isCurrentPendingUploadIntent(intent: PendingUploadIntent | null) {
    if (intent?.flow !== "rx_upload") return false;
    if (intent.route && intent.route !== currentUploadRoute()) return false;
    if (typeof intent.at === "number") {
      return Date.now() - intent.at < PENDING_UPLOAD_INTENT_MAX_AGE_MS;
    }
    return true;
  }

  function persistPendingUploadIntent(trigger: UploadIntentTrigger) {
    const intent = JSON.stringify({
      flow: "rx_upload",
      route: currentUploadRoute(),
      right: rightLens,
      left: leftLens,
      trigger,
      at: Date.now(),
    });

    sessionStorage.setItem(SS_PENDING_UPLOAD_INTENT, intent);
    localStorage.setItem(LS_PENDING_UPLOAD_INTENT, intent);
  }

  function trackUploadMethodSelected(trigger: UploadIntentTrigger) {
    void trackFunnelEvent(POSTHOG_EVENTS.RX_METHOD_SELECTED, {
      ...selectedLensAnalytics("upload_prescription"),
      verification_mode: "upload",
      trigger,
    });
  }

  async function redirectToLoginForUpload(trigger: UploadIntentTrigger) {
    const next = currentUploadRoute();
    persistPendingUploadIntent(trigger);
    setFile(null);
    setError(null);
    setResumePromptVisible(false);

    void trackFunnelEvent(POSTHOG_EVENTS.RX_UPLOAD_AUTH_REQUIRED, {
      ...selectedLensAnalytics("rx_upload_auth_required"),
      reason: "auth_required_before_file_picker",
      next_route: next,
      trigger,
    });
    void trackFunnelEvent(POSTHOG_EVENTS.LOGIN_REDIRECT_STARTED, {
      ...selectedLensAnalytics("rx_upload_login_redirect"),
      reason: "rx_upload_requires_auth_before_file_picker",
      next_route: next,
      trigger,
    });

    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }

  async function ensureAuthenticatedForUpload(
    trigger: UploadIntentTrigger,
  ): Promise<boolean> {
    if (authStatus === "authenticated") return true;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        setAuthStatus("authenticated");
        return true;
      }
    } catch {
      // Treat session lookup failures as anonymous for this client-side gate.
    }

    setAuthStatus("anonymous");
    await redirectToLoginForUpload(trigger);
    return false;
  }

  function openFilePicker(trigger: UploadIntentTrigger) {
    recordRecentUserAction("rx_file_picker_opened", {
      trigger,
      has_file: Boolean(file),
    });
    void trackFunnelEvent(POSTHOG_EVENTS.RX_FILE_PICKER_OPENED, {
      ...selectedLensAnalytics("rx_file_picker"),
      trigger,
      has_file: Boolean(file),
    });
    fileInputRef.current?.click();
  }

  function requestFilePicker(trigger: UploadIntentTrigger) {
    recordRecentUserAction("rx_upload_method_selected", {
      trigger,
      auth_status: authStatus,
      has_file: Boolean(file),
    });
    trackUploadMethodSelected(trigger);

    if (resumePromptVisible) {
      void trackFunnelEvent(
        POSTHOG_EVENTS.RX_UPLOAD_RESELECT_AFTER_AUTH_CLICKED,
        {
          ...selectedLensAnalytics("rx_upload_resume"),
          trigger,
        },
      );
    }

    if (authStatus === "authenticated") {
      openFilePicker(trigger);
      return;
    }

    void ensureAuthenticatedForUpload(trigger).then((allowed) => {
      if (allowed) openFilePicker(trigger);
    });
  }

  function handleDroppedFile(selected: File | null) {
    if (!selected) return;
    trackUploadMethodSelected("drop");

    void ensureAuthenticatedForUpload("drop").then((allowed) => {
      if (allowed) handleFileSelected(selected);
    });
  }

  function validateFile(selected: File): string | null {
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/heic",
      "image/heif",
      "application/pdf",
    ];
    const allowedExtensions = new Set([
      "jpg",
      "jpeg",
      "png",
      "heic",
      "heif",
      "pdf",
    ]);

    const extension = safeFileExtension(selected);
    const isAllowedType = selected.type
      ? allowedTypes.includes(selected.type)
      : Boolean(extension && allowedExtensions.has(extension));

    if (!isAllowedType) {
      return "Please upload a JPG, PNG, HEIC, HEIF, or PDF file.";
    }

    if (selected.size > MAX_FILE_MB * 1024 * 1024) {
      return `File must be under ${MAX_FILE_MB}MB.`;
    }

    return null;
  }

  function handleFileSelected(selected: File | null) {
    if (!selected) return;

    recordRecentUserAction("rx_file_selected", {
      ...safeFileTelemetry(selected),
    });

    const validation = validateFile(selected);

    if (validation) {
      setError(validation);
      track(POSTHOG_EVENTS.VALIDATION_ERROR, {
        step: "rx_upload_file_select",
        reason: validation,
        ...safeFileTelemetry(selected),
      });
      return;
    }

    setError(null);
    setResumePromptVisible(false);
    setFile(selected);
    setCurrentUploadTelemetryState({
      stage: "file_selected",
      has_file: true,
      ...safeFileTelemetry(selected),
      verification_mode: "upload",
    });
    void trackFunnelEvent(POSTHOG_EVENTS.RX_FILE_SELECTED, {
      ...selectedLensAnalytics("rx_file_selected"),
      ...safeFileTelemetry(selected),
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
      ...safeFileTelemetry(file),
      verification_mode: "upload",
    });

    let uploadAttemptStarted = false;
    let uploadFailureTracked = false;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        await redirectToLoginForUpload("file_selected_without_auth");
        return;
      }

      const orderId = await getOrCreateDraftOrder(session.access_token);

      localStorage.setItem(LS_ORDER_ID, orderId);
      setCurrentUploadTelemetryState({
        stage: "order_ready",
        has_file: true,
        ...safeFileTelemetry(file),
        order_id: orderId,
        verification_mode: "upload",
      });

      const formData = new FormData();
      formData.append("file", file);

      markStepStart("rx_upload");
      uploadAttemptStarted = true;
      void trackFunnelEvent(POSTHOG_EVENTS.RX_UPLOAD_STARTED, {
        ...selectedLensAnalytics("rx_upload_started"),
        ...safeFileTelemetry(file),
        order_id: orderId,
      });

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
        uploadFailureTracked = true;
        track(POSTHOG_EVENTS.RX_UPLOAD_FAILED, {
          ...selectedLensAnalytics("rx_upload_failed"),
          ...safeFileTelemetry(file),
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
        ...safeFileTelemetry(file),
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
      if (uploadAttemptStarted && !uploadFailureTracked) {
        track(POSTHOG_EVENTS.RX_UPLOAD_FAILED, {
          ...selectedLensAnalytics("rx_upload_failed"),
          ...safeFileTelemetry(file),
          reason: err instanceof Error ? err.message : "Upload failed",
        });
      }

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Upload failed");
      }
    } finally {
      setLoading(false);
    }
  }

  const uploadButtonLabel = loading
    ? "Uploading..."
    : file
      ? "Continue to cart"
      : resumePromptVisible
        ? "Continue upload"
        : authStatus === "anonymous"
          ? "Sign in to upload"
          : "Choose prescription file";

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

          {selectedLensSummary && (
            <p
              style={{
                color: "rgba(255,255,255,0.7)",
                fontSize: 14,
                margin: "-8px auto 22px",
                textAlign: "center",
              }}
            >
              {selectedLensSummary}
            </p>
          )}

          <div className="rx-choice-grid">
            {/* Upload Card */}

            <div
              className={`rx-choice-card rx-dropzone ${file ? "has-file" : ""}`}
              onClick={() => {
                recordRecentUserAction("rx_upload_dropzone_click", {
                  has_file: Boolean(file),
                  loading,
                });
                requestFilePicker("dropzone");
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
                handleDroppedFile(dropped);
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

              {resumePromptVisible && !file && (
                <div
                  style={{
                    marginTop: 20,
                    marginBottom: 24,
                    padding: 14,
                    borderRadius: 14,
                    background: "rgba(59,130,246,0.09)",
                    border: "1px solid rgba(147,197,253,0.28)",
                    color: "rgba(255,255,255,0.9)",
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    Continue upload
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                    Choose your prescription file to continue. Your selected
                    lenses are still saved for this step.
                  </div>
                </div>
              )}

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
                    void trackFunnelEvent(
                      POSTHOG_EVENTS.RX_UPLOAD_CTA_CLICKED_WITHOUT_FILE,
                      {
                        ...selectedLensAnalytics("rx_upload_cta_without_file"),
                        trigger: "cta_without_file",
                      },
                    );
                    requestFilePicker("cta_without_file");
                    return;
                  }
                  submitUpload();
                }}
                aria-disabled={loading}
                style={{
                  opacity: loading ? 0.72 : 1,
                  cursor: loading ? "wait" : "pointer",
                }}
              >
                {uploadButtonLabel}
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
