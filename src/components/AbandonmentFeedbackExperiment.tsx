"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  POSTHOG_EVENTS,
  track,
} from "@/lib/posthog/client";
import {
  ABANDONMENT_FEEDBACK_REASONS,
  ABANDONMENT_FEEDBACK_MIN_CART_CENTS,
} from "@/lib/abandonmentFeedback";

type GuestVsAuthenticated = "guest" | "authenticated";

type EligibilityResponse = {
  eligible?: boolean;
  orderId?: string;
  cartValueCents?: number;
  guestVsAuthenticated?: GuestVsAuthenticated;
};

type SubmitResponse = {
  ok?: boolean;
  error?: string;
  feedback_credit_cents?: number;
  amount_due_cents?: number;
};

type AbandonmentFeedbackExperimentProps = {
  orderId: string;
  cartValueCents: number;
  orderStatus: string;
  hasPrescription: boolean;
  feedbackCreditCents?: number | null;
  feedbackSurveyCompletedAt?: string | null;
  onCreditApplied?: (creditCents: number, amountDueCents: number) => void;
};

const LOWER_PRICE_REASON = "Found a lower price elsewhere";

function getSessionKey(kind: string, orderId: string) {
  return `hl_abandonment_feedback:${kind}:${orderId}`;
}

function getLocalKey(kind: string, orderId: string) {
  return `hl_abandonment_feedback:${kind}:${orderId}`;
}

function canUseStorage() {
  return typeof window !== "undefined";
}

function wasShownOrCompleted(orderId: string): boolean {
  if (!canUseStorage()) return true;

  return (
    window.localStorage.getItem(getLocalKey("shown", orderId)) === "1" ||
    window.localStorage.getItem(getLocalKey("submitted", orderId)) === "1" ||
    window.sessionStorage.getItem(getSessionKey("dismissed", orderId)) === "1" ||
    window.sessionStorage.getItem("hl_abandonment_feedback:session_shown") ===
      "1"
  );
}

export default function AbandonmentFeedbackExperiment({
  orderId,
  cartValueCents,
  orderStatus,
  hasPrescription,
  feedbackCreditCents,
  feedbackSurveyCompletedAt,
  onCreditApplied,
}: AbandonmentFeedbackExperimentProps) {
  const [eligible, setEligible] = useState(false);
  const [effectiveCartValueCents, setEffectiveCartValueCents] =
    useState(cartValueCents);
  const [guestVsAuthenticated, setGuestVsAuthenticated] =
    useState<GuestVsAuthenticated>("guest");
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reason, setReason] = useState("");
  const [lowerPriceSource, setLowerPriceSource] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingNavigationUrl, setPendingNavigationUrl] = useState<
    string | null
  >(null);

  const locallyEligible = useMemo(() => {
    return (
      orderStatus === "draft" &&
      hasPrescription &&
      cartValueCents >= ABANDONMENT_FEEDBACK_MIN_CART_CENTS &&
      !feedbackSurveyCompletedAt &&
      !feedbackCreditCents
    );
  }, [
    cartValueCents,
    feedbackCreditCents,
    feedbackSurveyCompletedAt,
    hasPrescription,
    orderStatus,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function checkEligibility() {
      if (!locallyEligible || wasShownOrCompleted(orderId)) return;

      const params = new URLSearchParams({ orderId });
      const res = await fetch(`/api/abandonment-feedback/eligibility?${params}`, {
        cache: "no-store",
      });
      const body: EligibilityResponse = await res.json().catch(() => ({}));

      if (cancelled || !body.eligible) return;

      setEligible(true);
      setEffectiveCartValueCents(
        typeof body.cartValueCents === "number"
          ? body.cartValueCents
          : cartValueCents,
      );
      setGuestVsAuthenticated(body.guestVsAuthenticated ?? "guest");
    }

    void checkEligibility();

    return () => {
      cancelled = true;
    };
  }, [cartValueCents, locallyEligible, orderId]);

  const showSurvey = useCallback(
    async (trigger: "exit_intent" | "back_navigation" | "leave_page") => {
      if (!eligible || open || wasShownOrCompleted(orderId)) return;

      const res = await fetch("/api/abandonment-feedback/shown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, trigger }),
      });

      if (!res.ok) return;

      window.localStorage.setItem(getLocalKey("shown", orderId), "1");
      window.sessionStorage.setItem(
        "hl_abandonment_feedback:session_shown",
        "1",
      );

      setOpen(true);
    },
    [eligible, open, orderId],
  );

  useEffect(() => {
    if (!eligible) return;

    function onMouseOut(event: MouseEvent) {
      if (event.clientY <= 0 && event.relatedTarget === null) {
        void showSurvey("exit_intent");
      }
    }

    document.addEventListener("mouseout", onMouseOut);
    return () => document.removeEventListener("mouseout", onMouseOut);
  }, [eligible, showSurvey]);

  useEffect(() => {
    if (!eligible) return;

    const isMobile =
      window.innerWidth < 768 ||
      window.matchMedia("(pointer: coarse)").matches;

    if (!isMobile) return;

    window.history.pushState({ hlAbandonmentFeedbackGuard: true }, "");

    function onPopState() {
      if (!open && !wasShownOrCompleted(orderId)) {
        window.history.pushState({ hlAbandonmentFeedbackGuard: true }, "");
        void showSurvey("back_navigation");
      }
    }

    function onDocumentClick(event: MouseEvent) {
      if (open || wasShownOrCompleted(orderId)) return;
      if (!(event.target instanceof Element)) return;

      const link = event.target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target && link.target !== "_self") return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const nextUrl = new URL(link.href, window.location.href);
      if (nextUrl.href === window.location.href) return;

      event.preventDefault();
      setPendingNavigationUrl(nextUrl.href);
      void showSurvey("leave_page");
    }

    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onDocumentClick, true);

    return () => {
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, [eligible, open, orderId, showSurvey]);

  const handleDismiss = useCallback(() => {
    const navigationUrl = pendingNavigationUrl;
    window.sessionStorage.setItem(getSessionKey("dismissed", orderId), "1");
    setPendingNavigationUrl(null);
    setOpen(false);
    track(POSTHOG_EVENTS.ABANDONMENT_SURVEY_DISMISSED, {
      order_id: orderId,
      cart_value: effectiveCartValueCents,
      cart_value_cents: effectiveCartValueCents,
      selected_reason: reason || null,
      guest_vs_authenticated: guestVsAuthenticated,
    });

    if (navigationUrl) {
      window.location.assign(navigationUrl);
    }
  }, [
    effectiveCartValueCents,
    guestVsAuthenticated,
    orderId,
    pendingNavigationUrl,
    reason,
  ]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") handleDismiss();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [handleDismiss, open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!reason || submitting) return;

    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/abandonment-feedback/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        reason,
        lowerPriceSource,
        notes,
      }),
    });

    const body: SubmitResponse = await res.json().catch(() => ({}));

    if (!res.ok || !body.ok) {
      setError(body.error ?? "Feedback could not be submitted.");
      setSubmitting(false);
      return;
    }

    const creditCents = body.feedback_credit_cents ?? 1000;
    const amountDueCents = body.amount_due_cents ?? 0;

    window.localStorage.setItem(getLocalKey("submitted", orderId), "1");
    setPendingNavigationUrl(null);
    setSubmitted(true);
    setSubmitting(false);
    onCreditApplied?.(creditCents, amountDueCents);
  }

  if (!open) return null;

  return (
    <div
      className="abandonment-feedback-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleDismiss();
      }}
    >
      <section
        className="abandonment-feedback-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="abandonment-feedback-title"
      >
        {submitted ? (
          <>
            <h2 id="abandonment-feedback-title">
              Thank you for helping us improve Honest Lenses.
            </h2>
            <p>A $10 credit has been applied to this order.</p>
            <button
              type="button"
              className="primary-btn abandonment-feedback-primary"
              onClick={() => setOpen(false)}
            >
              Continue
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2 id="abandonment-feedback-title">
              Can you help us improve Honest Lenses?
            </h2>
            <p className="abandonment-feedback-body">
              What stopped you from completing your order today?
            </p>
            <p className="abandonment-feedback-thanks">
              As a thank-you for your feedback, we&apos;ll apply a $10 credit
              to this order.
            </p>

            <div className="abandonment-feedback-options">
              {ABANDONMENT_FEEDBACK_REASONS.map((option) => (
                <label key={option} className="abandonment-feedback-option">
                  <input
                    type="radio"
                    name="abandonment-feedback-reason"
                    value={option}
                    checked={reason === option}
                    onChange={() => setReason(option)}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>

            {reason === LOWER_PRICE_REASON && (
              <label className="abandonment-feedback-field">
                <span>Where did you find it?</span>
                <input
                  value={lowerPriceSource}
                  onChange={(event) => setLowerPriceSource(event.target.value)}
                  maxLength={240}
                />
              </label>
            )}

            <label className="abandonment-feedback-field">
              <span>Anything else you&apos;d like us to know?</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={1000}
                rows={3}
              />
            </label>

            {error && <p className="abandonment-feedback-error">{error}</p>}

            <div className="abandonment-feedback-actions">
              <button
                type="submit"
                className="primary-btn abandonment-feedback-primary"
                disabled={!reason || submitting}
              >
                {submitting ? "Submitting..." : "Submit Feedback"}
              </button>
              <button
                type="button"
                className="abandonment-feedback-secondary"
                onClick={handleDismiss}
              >
                Not Now
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
