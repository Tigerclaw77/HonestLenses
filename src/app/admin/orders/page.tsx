"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { supabase } from "@/lib/supabase-client";
import { getLensDisplayName } from "@/lib/cart/display";

/* =========================
   Types
========================= */

type RxValue = string | number | null | undefined;

type RxEye = {
  coreId?: string | null;
  sphere?: RxValue;
  sph?: RxValue;
  cylinder?: RxValue;
  cyl?: RxValue;
  axis?: RxValue;
  ax?: RxValue;
  add?: RxValue;
  base_curve?: RxValue;
  baseCurve?: RxValue;
  bc?: RxValue;
  diameter?: RxValue;
  dia?: RxValue;
  brand_raw?: string | null;
  brand?: string | null;
  color?: string | null;
};

type RxData = {
  left?: RxEye | null;
  right?: RxEye | null;
  expires?: string | null;
  expirationDate?: string | null;
  expiration_date?: string | null;
  brand_raw?: string | null;
  brand?: string | null;
  lens_brand?: string | null;
  raw_text?: string | null;
  text?: string | null;
  notes?: string | null;

  // Root-level fallbacks, if OCR/AI stores them globally
  base_curve?: RxValue;
  baseCurve?: RxValue;
  diameter?: RxValue;
  dia?: RxValue;
};

type Order = {
  id: string;
  status: string;
  verification_status: string;
  rx_status?: string | null;
  archived?: boolean;
  archived_at?: string | null;
  fulfillment_status?: FulfillmentStatus | null;
  payment_status?: PaymentStatus | null;
  stripe_payment_intent_status?: string | null;
  payment_status_source?: string | null;
  admin_notes?: string | null;
  needs_review?: boolean | null;
  verified?: boolean | null;
  passive_verified?: boolean | null;
  doctor_confirmed?: boolean | null;
  blocked?: boolean | null;

  total_amount_cents?: number;
  shipping_cents?: number | null;
  shipping_method?: "standard" | "express" | null;
  sku?: string;
  box_count?: number;
  total_box_count?: number;
  od_box_count?: number;
  os_box_count?: number;

  created_at?: string;
  updated_at?: string | null;

  rx: string | RxData | null;
  rx_ocr_raw?: unknown;
  rx_source?: string | null;

  rx_upload_path?: string | null;
  rx_lens_brand?: string | null;
  rx_expiration_date?: string | null;

  prescriber_name?: string | null;
  prescriber_email?: string | null;
  prescriber_phone?: string | null;

  shipping_first_name?: string | null;
  shipping_last_name?: string | null;
  shipping_phone?: string | null;
  shipping_email?: string | null;

  shipping_address1?: string | null;
  shipping_address2?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_zip?: string | null;

  patient_name?: string | null;
  patient_full_name?: string | null;

  payment_intent_id?: string | null;
  abandoned_checkout?: AbandonedCheckoutClassification;
};

type PaymentStatus = "authorized" | "captured" | "refunded" | "failed";

type FulfillmentStatus =
  | "review"
  | "ready_to_order"
  | "ordered"
  | "shipped"
  | "completed"
  | "hold"
  | "cancelled";

type VerificationFlag =
  | "needs_review"
  | "verified"
  | "passive_verified"
  | "doctor_confirmed"
  | "blocked";

type BadgeTone =
  | "good"
  | "warning"
  | "blocked"
  | "neutral"
  | "info"
  | "capture"
  | "refund";

type DerivedOrderStage = {
  stage: "READY" | "WAITING" | "ACTION" | "ORDERED" | "SHIPPED" | "COMPLETE";
  awaiting: string;
  tone: BadgeTone;
};

type OrderOperationalBucket =
  | "action_required"
  | "active_fulfillment"
  | "history_archive";

type NotesModalState = {
  orderId: string;
  patientName: string;
  notes: string;
};

type RxImageModalState = {
  orderId: string;
  patientName: string;
  path: string;
  url: string | null;
  loading: boolean;
  error: string | null;
  previewFailed: boolean;
};

type PermanentDeleteModalState = {
  orderId: string;
  patientName: string;
};

type AbandonedCheckoutReason =
  | "abandoned_no_payment_intent"
  | "abandoned_with_payment_intent"
  | "stale_checkout"
  | "incomplete_rx"
  | "incomplete_doctor_info";

type AbandonedCheckoutClassification = {
  isAbandoned: boolean;
  reasons: AbandonedCheckoutReason[];
  primaryReason: AbandonedCheckoutReason | null;
  ageHours: number | null;
  activityAt: string | null;
  thresholdHours: number;
  staleThresholdHours: number;
  rxMode: "uploaded" | "doctor" | "structured_rx" | "none";
};

type AbandonedAdminAction =
  | "archive"
  | "delete_permanently"
  | "draft_recovery_email";

type RecoveryEmailDraft = {
  to: string | null;
  subject: string;
  text: string;
  html: string;
};

type AdminApiPayload = {
  error?: string;
  code?: string;
  needsAction?: Order[];
  stalled?: Order[];
  pipeline?: Order[];
  archive?: Order[];
  abandoned?: Order[];
  draft?: RecoveryEmailDraft;
};

const FULFILLMENT_STATUSES: FulfillmentStatus[] = [
  "review",
  "ready_to_order",
  "ordered",
  "shipped",
  "completed",
  "hold",
  "cancelled",
];

const FULFILLMENT_PROGRESS_FLOW: FulfillmentStatus[] = [
  "review",
  "ready_to_order",
  "ordered",
  "shipped",
  "completed",
];

const HIGHLIGHT_MS = 120_000;
const RECENT_SHIPPED_DAYS = 7;
const STALE_INACTIVE_DAYS = 7;

const VERIFICATION_FLAGS: { key: VerificationFlag; label: string }[] = [
  { key: "needs_review", label: "Needs review" },
  { key: "verified", label: "Verified" },
  { key: "passive_verified", label: "Passive verified" },
  { key: "doctor_confirmed", label: "Doctor confirmed" },
  { key: "blocked", label: "Blocked" },
];

/* =========================
   Helpers
========================= */

function formatMoney(cents?: number): string {
  if (typeof cents !== "number") return "-";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString();
}

function formatAdminOrderDateTimeCentral(value?: string | null): {
  date: string;
  time: string;
} {
  if (!value) return { date: "-", time: "-" };

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "-", time: "-" };

  return {
    date: new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
    }).format(date),
    time: `${new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      minute: "2-digit",
    }).format(date)} CT`,
  };
}

function formatAge(hours?: number | null): string {
  if (typeof hours !== "number") return "-";
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function abandonedReasonLabel(reason: AbandonedCheckoutReason): string {
  const labels: Record<AbandonedCheckoutReason, string> = {
    abandoned_no_payment_intent: "No payment intent",
    abandoned_with_payment_intent: "Payment started",
    stale_checkout: "Stale checkout",
    incomplete_rx: "Incomplete Rx",
    incomplete_doctor_info: "Incomplete doctor info",
  };

  return labels[reason];
}

function rxModeLabel(mode?: AbandonedCheckoutClassification["rxMode"]): string {
  const labels: Record<AbandonedCheckoutClassification["rxMode"], string> = {
    uploaded: "Upload/OCR",
    doctor: "Doctor verification",
    structured_rx: "Entered Rx",
    none: "None",
  };

  return mode ? labels[mode] : "None";
}

function labelizeStatus(status: string): string {
  return status.replace(/_/g, " ").toUpperCase();
}

function isVerified(status?: string | null): boolean {
  return [
    "verified",
    "auto_verified",
    "manual_verified",
    "ocr_verified",
    "upload_verified",
    "passive_verified",
    "doctor_confirmed",
  ].includes(status ?? "");
}

function isFulfillmentStatus(value: unknown): value is FulfillmentStatus {
  return FULFILLMENT_STATUSES.includes(value as FulfillmentStatus);
}

function normalizedFulfillmentStatus(order: Order): FulfillmentStatus {
  if (isFulfillmentStatus(order.fulfillment_status)) {
    return order.fulfillment_status;
  }

  if (order.status === "completed") return "completed";
  if (order.status === "shipped") return "shipped";
  if (order.status === "cancelled") return "cancelled";
  return "review";
}

function normalizedPaymentStatus(order: Order): PaymentStatus {
  if (
    order.payment_status === "authorized" ||
    order.payment_status === "captured" ||
    order.payment_status === "refunded" ||
    order.payment_status === "failed"
  ) {
    return order.payment_status;
  }

  if (
    order.status === "captured" ||
    order.status === "paid" ||
    order.status === "shipped" ||
    order.status === "completed"
  ) {
    return "captured";
  }

  if (order.status === "refunded") return "refunded";
  if (order.status === "cancelled" || order.status === "failed") {
    return "failed";
  }

  return order.payment_intent_id ? "authorized" : "failed";
}

function orderVerificationComplete(order: Order): boolean {
  return Boolean(
    order.verified ||
      order.passive_verified ||
      order.doctor_confirmed ||
      isVerified(order.verification_status),
  );
}

function orderVerificationBlocked(order: Order): boolean {
  return Boolean(
    order.blocked ||
      order.verification_status === "blocked" ||
      order.verification_status === "rejected",
  );
}

function compareOperationalPriority(a: Order, b: Order): number {
  return orderActivityTime(b) - orderActivityTime(a);
}

function normalizedRxStatus(order: Order): string {
  return order.rx_status ?? (order.rx_upload_path ? "uploaded" : "none");
}

function orderHasRx(order: Order): boolean {
  const rxStatus = normalizedRxStatus(order);
  return (
    Boolean(order.rx_upload_path) ||
    rxStatus === "uploaded" ||
    rxStatus === "ocr_complete"
  );
}

function verificationPath(order: Order): { label: string; tone: BadgeTone } {
  if (orderHasRx(order)) return { label: "AUTO (Rx uploaded)", tone: "good" };
  if (order.prescriber_name)
    return { label: "DOCTOR REQUIRED", tone: "warning" };
  return { label: "BLOCKED", tone: "blocked" };
}

function paymentStatus(order: Order): { label: string; tone: BadgeTone } {
  const status = normalizedPaymentStatus(order);

  const tones: Record<PaymentStatus, BadgeTone> = {
    authorized: "warning",
    captured: "capture",
    refunded: "refund",
    failed: "blocked",
  };

  return { label: labelizeStatus(status), tone: tones[status] };
}

function rxTone(order: Order): BadgeTone {
  return normalizedRxStatus(order) === "none" ? "warning" : "good";
}

function verificationSummary(order: Order): { label: string; tone: BadgeTone } {
  if (orderVerificationBlocked(order)) return { label: "BLOCKED", tone: "blocked" };
  if (order.verified) return { label: "VERIFIED", tone: "good" };
  if (order.passive_verified)
    return { label: "PASSIVE VERIFIED", tone: "good" };
  if (order.doctor_confirmed)
    return { label: "DOCTOR CONFIRMED", tone: "good" };
  if (order.needs_review || order.verification_status === "requires_review") {
    return { label: "NEEDS REVIEW", tone: "warning" };
  }
  if (isVerified(order.verification_status)) {
    return {
      label: labelizeStatus(order.verification_status ?? "verified"),
      tone: "good",
    };
  }
  if (!order.verification_status || order.verification_status === "pending") {
    return { label: "PENDING", tone: "warning" };
  }
  return { label: labelizeStatus(order.verification_status), tone: "blocked" };
}

function fulfillmentTone(status: FulfillmentStatus): BadgeTone {
  if (status === "completed" || status === "shipped") return "good";
  if (status === "ordered" || status === "ready_to_order") return "info";
  if (status === "hold") return "warning";
  if (status === "cancelled") return "blocked";
  return "neutral";
}

function deriveOperationalReadiness(order: Order): {
  ready: boolean;
  label: string;
  tone: BadgeTone;
  reasons: string[];
} {
  const operational = getOperationalStatus(order);
  const actionability = getActionability(order);
  const ready = operational.stage === "READY";

  if (ready) {
    return {
      ready,
      label: "READY TO ORDER",
      tone: operational.tone,
      reasons: actionability.reasons,
    };
  }

  const label =
    operational.awaiting === "No action"
      ? operational.stage
      : `${operational.stage}: ${operational.awaiting.toUpperCase()}`;

  return {
    ready,
    label,
    tone: operational.tone,
    reasons: actionability.reasons,
  };
}

function isOperationallyComplete(order: Order): boolean {
  const fulfillment = normalizedFulfillmentStatus(order);
  return fulfillment === "shipped" || fulfillment === "completed";
}

function getVerificationStatus(order: Order): {
  complete: boolean;
  blocked: boolean;
  label: string;
  tone: BadgeTone;
} {
  if (isOperationallyComplete(order)) {
    return {
      complete: true,
      blocked: false,
      label: "CLOSED",
      tone: "neutral",
    };
  }

  const summary = verificationSummary(order);
  return {
    complete: orderVerificationComplete(order),
    blocked: orderVerificationBlocked(order),
    label: summary.label,
    tone: summary.tone,
  };
}

function getOperationalStatus(order: Order): DerivedOrderStage {
  const payment = normalizedPaymentStatus(order);
  const fulfillment = normalizedFulfillmentStatus(order);

  if (fulfillment === "completed") {
    return { stage: "COMPLETE", awaiting: "No action", tone: "good" };
  }

  if (fulfillment === "shipped") {
    return { stage: "SHIPPED", awaiting: "Completion", tone: "good" };
  }

  if (fulfillment === "ordered") {
    return { stage: "ORDERED", awaiting: "Shipment", tone: "info" };
  }

  if (fulfillment === "cancelled") {
    return { stage: "ACTION", awaiting: "Cancelled review", tone: "blocked" };
  }

  if (fulfillment === "hold") {
    return { stage: "ACTION", awaiting: "Hold resolution", tone: "warning" };
  }

  if (payment === "failed" || payment === "refunded") {
    return { stage: "ACTION", awaiting: "Payment fix", tone: "blocked" };
  }

  if (payment !== "captured") {
    return { stage: "WAITING", awaiting: "Capture", tone: "warning" };
  }

  if (orderVerificationBlocked(order)) {
    return {
      stage: "ACTION",
      awaiting: "Verification unblock",
      tone: "blocked",
    };
  }

  if (!orderHasRx(order)) {
    return { stage: "ACTION", awaiting: "Rx", tone: "warning" };
  }

  if (order.needs_review) {
    return { stage: "ACTION", awaiting: "Manual review", tone: "warning" };
  }

  if (!orderVerificationComplete(order)) {
    return { stage: "WAITING", awaiting: "Verification", tone: "warning" };
  }

  return { stage: "READY", awaiting: "Manufacturer order", tone: "good" };
}

function getActionability(order: Order): {
  actionable: boolean;
  reasons: string[];
} {
  if (isOperationallyComplete(order)) {
    return { actionable: false, reasons: [] };
  }

  const reasons: string[] = [];
  const payment = normalizedPaymentStatus(order);
  const fulfillment = normalizedFulfillmentStatus(order);

  if (fulfillment === "hold") reasons.push("hold");
  if (payment === "failed" || payment === "refunded") reasons.push(payment);
  if (payment !== "captured") reasons.push("capture");
  if (orderVerificationBlocked(order)) reasons.push("verification blocked");
  if (!orderHasRx(order)) reasons.push("rx missing");
  if (order.needs_review) reasons.push("review");
  if (!orderVerificationComplete(order)) reasons.push("verification");
  if (
    order.shipping_method === "express" &&
    fulfillment !== "ordered" &&
    fulfillment !== "shipped" &&
    fulfillment !== "completed"
  ) {
    reasons.push("express");
  }

  return { actionable: reasons.length > 0, reasons };
}

function paymentCaptureSummary(order: Order): { label: string; tone: BadgeTone } {
  const payment = normalizedPaymentStatus(order);

  if (payment === "captured") return { label: "Captured", tone: "capture" };
  if (payment === "authorized") {
    return { label: "Awaiting capture", tone: "warning" };
  }
  if (payment === "refunded") return { label: "Refunded", tone: "refund" };
  return { label: "Payment failed", tone: "blocked" };
}

function nextFulfillmentStatus(status: FulfillmentStatus): FulfillmentStatus | null {
  const currentIndex = FULFILLMENT_PROGRESS_FLOW.indexOf(status);
  if (currentIndex < 0) return null;
  return FULFILLMENT_PROGRESS_FLOW[currentIndex + 1] ?? null;
}

function previousFulfillmentStatus(
  status: FulfillmentStatus,
): FulfillmentStatus | null {
  const currentIndex = FULFILLMENT_PROGRESS_FLOW.indexOf(status);
  if (currentIndex <= 0) return null;
  return FULFILLMENT_PROGRESS_FLOW[currentIndex - 1] ?? null;
}

function workflowActionLabel(
  current: FulfillmentStatus,
  next: FulfillmentStatus,
): string {
  if (current === "review" && next === "ready_to_order") {
    return "Approve / Ready to Order";
  }

  if (current === "ready_to_order" && next === "ordered") {
    return "Place Vendor Order";
  }

  if (current === "ordered" && next === "shipped") {
    return "Mark Shipped";
  }

  if (current === "shipped" && next === "completed") {
    return "Complete Order";
  }

  return `Advance to ${labelizeStatus(next)}`;
}

function orderActivityTime(order: Order): number {
  return (
    Date.parse(order.updated_at ?? "") ||
    Date.parse(order.created_at ?? "") ||
    0
  );
}

function isWithinDays(order: Order, days: number): boolean {
  const activityTime = orderActivityTime(order);
  if (!activityTime) return false;

  return Date.now() - activityTime <= days * 24 * 60 * 60 * 1000;
}

function isRecentlyShipped(order: Order): boolean {
  return (
    normalizedFulfillmentStatus(order) === "shipped" &&
    isWithinDays(order, RECENT_SHIPPED_DAYS)
  );
}

function isOperatorArchived(order: Order): boolean {
  return Boolean(order.archived || order.archived_at);
}

function isActionRequired(order: Order): boolean {
  return getActionability(order).actionable;
}

function isArchiveOrder(order: Order): boolean {
  const fulfillment = normalizedFulfillmentStatus(order);
  const payment = normalizedPaymentStatus(order);

  if (order.abandoned_checkout?.isAbandoned) return true;
  if (isOperatorArchived(order)) {
    if (order.status === "draft" || !order.payment_intent_id) return true;
    return !getActionability(order).actionable;
  }
  if (fulfillment === "completed" || fulfillment === "cancelled") return true;
  if (fulfillment === "shipped") return !isRecentlyShipped(order);
  if (
    (payment === "failed" || payment === "refunded") &&
    !isWithinDays(order, STALE_INACTIVE_DAYS)
  ) {
    return true;
  }

  return false;
}

function getOrderOperationalBucket(order: Order): OrderOperationalBucket {
  if (isArchiveOrder(order)) return "history_archive";
  if (isActionRequired(order)) return "action_required";
  return "active_fulfillment";
}

function shouldDefaultCollapse(order: Order): boolean {
  return getOrderOperationalBucket(order) === "history_archive";
}

function archiveOrderStatus(order: Order): { label: string; tone: BadgeTone } {
  if (order.abandoned_checkout?.isAbandoned) {
    return { label: "ABANDONED", tone: "warning" };
  }

  const payment = normalizedPaymentStatus(order);
  const fulfillment = normalizedFulfillmentStatus(order);

  if (payment === "failed") return { label: "PAYMENT FAILED", tone: "blocked" };
  if (payment === "refunded") return { label: "REFUNDED", tone: "refund" };
  if (fulfillment === "cancelled") return { label: "CANCELLED", tone: "blocked" };
  if (fulfillment === "completed") return { label: "COMPLETED", tone: "good" };
  if (fulfillment === "shipped") return { label: "SHIPPED", tone: "good" };
  return { label: labelizeStatus(fulfillment), tone: fulfillmentTone(fulfillment) };
}

function archiveSort(a: Order, b: Order): number {
  return orderActivityTime(b) - orderActivityTime(a);
}

function compactTimeline(order: Order): { label: string; tone: BadgeTone }[] {
  const payment = normalizedPaymentStatus(order);
  const verification = getVerificationStatus(order);
  const fulfillment = normalizedFulfillmentStatus(order);
  const complete = isOperationallyComplete(order);

  return [
    { label: `Payment ${payment}`, tone: paymentStatus(order).tone },
    {
      label: complete ? "Rx closed" : orderHasRx(order) ? "Rx ready" : "Rx missing",
      tone: complete ? "neutral" : rxTone(order),
    },
    { label: `Verification ${verification.label.toLowerCase()}`, tone: verification.tone },
    { label: `Fulfillment ${fulfillment.replace(/_/g, " ")}`, tone: fulfillmentTone(fulfillment) },
  ];
}

function badgeStyle(tone: BadgeTone): CSSProperties {
  const colors = {
    good: { background: "#dcfce7", color: "#166534", border: "#86efac" },
    warning: { background: "#fef9c3", color: "#854d0e", border: "#fde68a" },
    blocked: { background: "#fee2e2", color: "#991b1b", border: "#fecaca" },
    neutral: { background: "#e2e8f0", color: "#334155", border: "#cbd5e1" },
    info: { background: "#dbeafe", color: "#1e40af", border: "#93c5fd" },
    capture: { background: "#ccfbf1", color: "#115e59", border: "#5eead4" },
    refund: { background: "#fce7f3", color: "#9d174d", border: "#f9a8d4" },
  }[tone];

  return {
    display: "inline-flex",
    alignItems: "center",
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    background: colors.background,
    color: colors.color,
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
    padding: "5px 7px",
    whiteSpace: "nowrap",
  };
}

function mutedPanelStyle(): CSSProperties {
  return {
    border: "1px solid rgba(148,163,184,0.25)",
    borderRadius: 8,
    background: "rgba(15,23,42,0.35)",
    padding: 12,
  };
}

function buttonStyle(extra?: CSSProperties): CSSProperties {
  return {
    padding: "4px 8px",
    borderRadius: 4,
    border: "1px solid rgba(148,163,184,0.45)",
    background: "rgba(15,23,42,0.65)",
    color: "inherit",
    cursor: "pointer",
    ...extra,
  };
}

function isPdfPath(path: string): boolean {
  return /\.pdf($|\?)/i.test(path);
}

function previewKind(path: string): "pdf" | "image" {
  return isPdfPath(path) ? "pdf" : "image";
}

function formatRxNumber(value: unknown, decimals: number): string {
  if (!hasValue(value)) return "-";

  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toFixed(decimals) : "-";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "-";
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric.toFixed(decimals) : trimmed;
  }

  return String(value);
}

function rxValueText(value: unknown, kind: "power" | "curve" | "plain"): string {
  if (kind === "power") return formatRxNumber(value, 2);
  if (kind === "curve") return formatRxNumber(value, 1);
  return valueText(value);
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function valueText(value: unknown): string {
  return hasValue(value) ? String(value) : "-";
}

function parseRxObject(value: unknown): RxData | null {
  if (!value) return null;

  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as RxData) : null;
    } catch {
      return null;
    }
  }

  return typeof value === "object" ? (value as RxData) : null;
}

function rawRxText(value: unknown): string | null {
  if (!hasValue(value)) return null;
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function eyeValue(
  eye: RxEye | null | undefined,
  keys: (keyof RxEye)[],
  kind: "power" | "curve" | "plain" = "plain",
): string {
  const value = keys
    .map((key) => eye?.[key])
    .find((v) => v !== null && v !== undefined && v !== "");
  return rxValueText(value, kind);
}

function rootValue(
  rx: RxData | null,
  keys: (keyof RxData)[],
  kind: "power" | "curve" | "plain" = "plain",
): string {
  const value = keys
    .map((key) => rx?.[key])
    .find((v) => v !== null && v !== undefined && v !== "");
  return rxValueText(value, kind);
}

function eyeValueWithRootFallback(
  eye: RxEye | null | undefined,
  eyeKeys: (keyof RxEye)[],
  rx: RxData | null,
  rootKeys: (keyof RxData)[],
  kind: "power" | "curve" | "plain" = "plain",
): string {
  const eyeVal = eyeValue(eye, eyeKeys, kind);
  if (eyeVal !== "-") return eyeVal;
  return rootValue(rx, rootKeys, kind);
}

function hasEyeDetails(eye: RxEye | null | undefined): boolean {
  return [
    "sphere",
    "sph",
    "cylinder",
    "cyl",
    "axis",
    "ax",
    "add",
    "base_curve",
    "baseCurve",
    "bc",
    "diameter",
    "dia",
    "brand_raw",
    "brand",
  ].some((key) => hasValue(eye?.[key as keyof RxEye]));
}

function fullRxDetails(order: Order): {
  rx: RxData | null;
  hasStructured: boolean;
  raw: string | null;
  expires: string | null;
  brand: string | null;
} {
  const rx = parseRxObject(order.rx) ?? parseRxObject(order.rx_ocr_raw);
  const right = rx?.right ?? null;
  const left = rx?.left ?? null;

  const brand =
    rx?.brand ??
    rx?.brand_raw ??
    rx?.lens_brand ??
    order.rx_lens_brand ??
    right?.brand ??
    right?.brand_raw ??
    left?.brand ??
    left?.brand_raw ??
    null;

  return {
    rx,
    hasStructured: hasEyeDetails(right) || hasEyeDetails(left),
    raw: rawRxText(order.rx_ocr_raw) ?? rawRxText(order.rx),
    expires:
      rx?.expires ??
      rx?.expirationDate ??
      rx?.expiration_date ??
      order.rx_expiration_date ??
      null,
    brand,
  };
}

function firstEyeValue(
  eye: RxEye | null | undefined,
  keys: (keyof RxEye)[],
): unknown {
  return keys
    .map((key) => eye?.[key])
    .find((value) => hasValue(value));
}

function firstRootValue(
  rx: RxData | null,
  keys: (keyof RxData)[],
): unknown {
  return keys
    .map((key) => rx?.[key])
    .find((value) => hasValue(value));
}

function firstEyeValueWithRootFallback(
  eye: RxEye | null | undefined,
  eyeKeys: (keyof RxEye)[],
  rx: RxData | null,
  rootKeys: (keyof RxData)[],
): unknown {
  return firstEyeValue(eye, eyeKeys) ?? firstRootValue(rx, rootKeys);
}

function normalizedCurve(value: unknown): string | null {
  const formatted = formatRxNumber(value, 1);
  return formatted === "-" ? null : formatted;
}

function normalizedPower(value: unknown): string | null {
  const formatted = formatRxNumber(value, 2);
  return formatted === "-" ? null : formatted;
}

function normalizedAxis(value: unknown): string | null {
  if (!hasValue(value)) return null;

  const numeric = Number(value);
  if (Number.isFinite(numeric)) return String(Math.round(numeric));

  const trimmed = String(value).trim();
  return trimmed || null;
}

function uniqueValues(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => !!value)));
}

function formatCollapsedRxLine(order: Order): string[] {
  const details = fullRxDetails(order);
  const rx = details.rx;
  const right = rx?.right ?? null;
  const left = rx?.left ?? null;
  const bcValues = [
    normalizedCurve(
      firstEyeValueWithRootFallback(
        right,
        ["base_curve", "baseCurve", "bc"],
        rx,
        ["base_curve", "baseCurve"],
      ),
    ),
    normalizedCurve(
      firstEyeValueWithRootFallback(
        left,
        ["base_curve", "baseCurve", "bc"],
        rx,
        ["base_curve", "baseCurve"],
      ),
    ),
  ];
  const diaValues = [
    normalizedCurve(
      firstEyeValueWithRootFallback(
        right,
        ["diameter", "dia"],
        rx,
        ["diameter", "dia"],
      ),
    ),
    normalizedCurve(
      firstEyeValueWithRootFallback(
        left,
        ["diameter", "dia"],
        rx,
        ["diameter", "dia"],
      ),
    ),
  ];
  const showBc = bcValues.some(Boolean);
  const showDia = uniqueValues(diaValues).length > 1;

  const formatEye = (
    label: "OD" | "OS",
    eye: RxEye | null,
    bc: string | null,
    dia: string | null,
  ): string | null => {
    if (!eye || !hasEyeDetails(eye)) return null;

    const sphere = normalizedPower(firstEyeValue(eye, ["sphere", "sph"]));
    const cylinder = normalizedPower(firstEyeValue(eye, ["cylinder", "cyl"]));
    const axis = normalizedAxis(firstEyeValue(eye, ["axis", "ax"]));
    const add = normalizedPower(firstEyeValue(eye, ["add"]));
    const pieces = [sphere ?? "-"];

    if (cylinder) pieces.push(cylinder);
    if (axis) pieces.push(`x${axis}`);
    if (add) pieces.push(`${add} add`);

    let line = `${label} ${pieces.join(" ")}`;
    if (showBc && bc) line += ` / ${bc}`;
    if (showDia && dia) line += ` / ${dia}`;
    if (eye.color) line += ` ${eye.color}`;
    return line;
  };

  const od = formatEye("OD", right, bcValues[0], diaValues[0]);
  const os = formatEye("OS", left, bcValues[1], diaValues[1]);

  if (od && os && od.replace(/^OD /, "") === os.replace(/^OS /, "")) {
    return [`OU ${od.replace(/^OD /, "")}`];
  }

  return [od, os].filter((line): line is string => Boolean(line));
}

function getOrderLensDisplayName(order: Order): string {
  const details = fullRxDetails(order);
  const rightCoreId = details.rx?.right?.coreId ?? null;
  const leftCoreId = details.rx?.left?.coreId ?? null;
  const displayFromCore = (coreId: string): string | null => {
    const displayName = getLensDisplayName(coreId, order.sku ?? null);
    return displayName === "Unknown Lens" ? null : displayName;
  };

  if (rightCoreId && leftCoreId && rightCoreId !== leftCoreId) {
    const rightName = displayFromCore(rightCoreId) ?? rightCoreId;
    const leftName = displayFromCore(leftCoreId) ?? leftCoreId;
    return `OD ${rightName} / OS ${leftName}`;
  }

  const coreId = rightCoreId ?? leftCoreId;
  if (coreId) {
    const displayName = displayFromCore(coreId);
    if (displayName) return displayName;
  }

  return details.brand ?? order.rx_lens_brand ?? order.sku ?? "Lens pending";
}

function copyToClipboard(value?: string | null): void {
  const text = value?.trim();
  if (!text) return;
  navigator.clipboard.writeText(text).catch(() => {
    // Clipboard writes can be blocked outside a direct user gesture.
  });
}

function isNewPaymentIntentOrder(order: Order): boolean {
  return Boolean(order.payment_intent_id);
}

async function readAdminApiPayload(response: Response): Promise<AdminApiPayload> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json().catch(() => ({}))) as AdminApiPayload;
  }

  const text = await response.text().catch(() => "");
  return text ? { error: text } : {};
}

function adminApiErrorMessage(
  payload: AdminApiPayload,
  fallback: string,
): string {
  return [payload.error ?? fallback, payload.code ? `(${payload.code})` : null]
    .filter(Boolean)
    .join(" ");
}

function parseRx(rxRaw: string | RxData | null): {
  od: string;
  os: string;
  exp: string | null;
} {
  try {
    const rx = parseRxObject(rxRaw);

    const od = rx?.right;
    const os = rx?.left;

    const formatEye = (eye?: RxEye | null) => {
      if (!eye) return "-";
      const parts = [eye.coreId ?? "", `SPH ${formatRxNumber(eye.sphere, 2)}`];
      if (hasValue(eye.cylinder))
        parts.push(`CYL ${formatRxNumber(eye.cylinder, 2)}`);
      if (hasValue(eye.cyl)) parts.push(`CYL ${formatRxNumber(eye.cyl, 2)}`);
      if (hasValue(eye.axis)) parts.push(`AX ${eye.axis}`);
      if (hasValue(eye.add)) parts.push(`ADD ${formatRxNumber(eye.add, 2)}`);
      if (hasValue(eye.base_curve))
        parts.push(`BC ${formatRxNumber(eye.base_curve, 1)}`);
      if (hasValue(eye.baseCurve))
        parts.push(`BC ${formatRxNumber(eye.baseCurve, 1)}`);
      if (hasValue(eye.diameter))
        parts.push(`DIA ${formatRxNumber(eye.diameter, 1)}`);
      if (hasValue(eye.dia)) parts.push(`DIA ${formatRxNumber(eye.dia, 1)}`);
      if (eye.color) parts.push(`Color: ${eye.color}`);
      return parts.filter(Boolean).join(" | ");
    };

    return {
      od: formatEye(od),
      os: formatEye(os),
      exp: rx?.expires ?? rx?.expirationDate ?? rx?.expiration_date ?? null,
    };
  } catch {
    return { od: "OD: -", os: "OS: -", exp: null };
  }
}

function RxDetailsPanel({ order }: { order: Order }) {
  const details = fullRxDetails(order);
  const rows = [
    { label: "OD", eye: details.rx?.right ?? null },
    { label: "OS", eye: details.rx?.left ?? null },
  ];

  const cellStyle: CSSProperties = {
    borderBottom: "1px solid rgba(148,163,184,0.2)",
    padding: "6px 8px",
    textAlign: "left",
  };

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        border: "1px solid rgba(148,163,184,0.25)",
        borderRadius: 8,
        background: "rgba(15,23,42,0.35)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Full Rx</div>

      {details.hasStructured ? (
        <>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr>
                <th style={cellStyle}>Eye</th>
                <th style={cellStyle}>Sphere</th>
                <th style={cellStyle}>Cyl</th>
                <th style={cellStyle}>Axis</th>
                <th style={cellStyle}>Add</th>
                <th style={cellStyle}>BC</th>
                <th style={cellStyle}>DIA</th>
                <th style={cellStyle}>Brand</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ label, eye }) => (
                <tr key={label}>
                  <td style={cellStyle}>{label}</td>
                  <td style={cellStyle}>{eyeValue(eye, ["sphere"], "power")}</td>
                  <td style={cellStyle}>
                    {eyeValue(eye, ["cylinder", "cyl"], "power")}
                  </td>
                  <td style={cellStyle}>{eyeValue(eye, ["axis"])}</td>
                  <td style={cellStyle}>{eyeValue(eye, ["add"], "power")}</td>
                  <td style={cellStyle}>
                    {eyeValueWithRootFallback(
                      eye,
                      ["base_curve", "baseCurve"],
                      details.rx,
                      ["base_curve", "baseCurve"],
                      "curve",
                    )}
                  </td>
                  <td style={cellStyle}>
                    {eyeValueWithRootFallback(
                      eye,
                      ["diameter", "dia"],
                      details.rx,
                      ["diameter", "dia"],
                      "curve",
                    )}
                  </td>
                  <td style={cellStyle}>
                    {valueText(eye?.brand ?? eye?.brand_raw ?? details.brand)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 8 }}>
            Expiration date: {valueText(details.expires)}
          </div>
          {details.brand && <div>Brand: {details.brand}</div>}
        </>
      ) : details.raw ? (
        <>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>Raw Rx (OCR)</div>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              overflowX: "auto",
              fontFamily: "monospace",
            }}
          >
            {details.raw}
          </pre>
        </>
      ) : (
        <div>No Rx details available.</div>
      )}
    </div>
  );
}

function CopyableValue({
  value,
  children,
  style,
}: {
  value?: string | null;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  if (!value) return null;

  return (
    <button
      type="button"
      title={`Copy ${value}`}
      onClick={(e) => {
        e.stopPropagation();
        copyToClipboard(value);
      }}
      style={{
        display: "inline",
        padding: 0,
        border: "none",
        background: "transparent",
        color: "inherit",
        font: "inherit",
        textAlign: "left",
        cursor: "copy",
        textDecoration: "underline dotted rgba(148,163,184,0.7)",
        textUnderlineOffset: 3,
        ...style,
      }}
    >
      {children ?? value}
    </button>
  );
}

/* =========================
   Component
========================= */

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [abandonedOrders, setAbandonedOrders] = useState<Order[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rxExpanded, setRxExpanded] = useState<string | null>(null);
  const [recoveryDrafts, setRecoveryDrafts] = useState<
    Record<string, RecoveryEmailDraft>
  >({});
  const [notesModal, setNotesModal] = useState<NotesModalState | null>(null);
  const [rxImageModal, setRxImageModal] = useState<RxImageModalState | null>(
    null,
  );
  const [permanentDeleteModal, setPermanentDeleteModal] =
    useState<PermanentDeleteModalState | null>(null);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [highlightedOrderIds, setHighlightedOrderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [adminError, setAdminError] = useState<string | null>(null);
  const knownPaymentIntentOrderIds = useRef<Set<string>>(new Set());
  const notifiedPaymentIntentOrderIds = useRef<Set<string>>(new Set());
  const highlightTimeouts = useRef<Map<string, number>>(new Map());
  const baseDocumentTitle = useRef<string | null>(null);
  const isInitialLoad = useRef(true);

  const authHeaders = useCallback(async (): Promise<HeadersInit> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    };
  }, []);

  const clearOrderHighlight = useCallback((orderId: string) => {
    const timeoutId = highlightTimeouts.current.get(orderId);
    if (timeoutId) window.clearTimeout(timeoutId);
    highlightTimeouts.current.delete(orderId);

    setHighlightedOrderIds((current) => {
      if (!current.has(orderId)) return current;
      const next = new Set(current);
      next.delete(orderId);
      return next;
    });
  }, []);

  const markHighlightedPaymentOrders = useCallback((newOrders: Order[]) => {
    if (newOrders.length === 0) return;

    setHighlightedOrderIds((current) => {
      const next = new Set(current);
      newOrders.forEach((order) => next.add(order.id));
      return next;
    });

    newOrders.forEach((order) => {
      const existingTimeout = highlightTimeouts.current.get(order.id);
      if (existingTimeout) window.clearTimeout(existingTimeout);

      const timeoutId = window.setTimeout(() => {
        clearOrderHighlight(order.id);
      }, HIGHLIGHT_MS);

      highlightTimeouts.current.set(order.id, timeoutId);
    });
  }, [clearOrderHighlight]);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/admin/orders", {
      headers: await authHeaders(),
      credentials: "same-origin",
    });
    const json = await readAdminApiPayload(res);

    if (!res.ok) {
      const message = adminApiErrorMessage(json, "Failed to fetch orders.");
      setAdminError(message);
      if (process.env.NODE_ENV !== "production") {
        console.warn("[AdminOrdersPage] orders fetch failed", {
          status: res.status,
          error: json.error,
          code: json.code,
        });
      }
      return;
    }

    setAdminError(null);

    const activeOrders: Order[] = [
      ...(json.needsAction ?? []),
      ...(json.stalled ?? []),
      ...(json.pipeline ?? []),
    ];
    const combined: Order[] = [...activeOrders, ...(json.archive ?? [])];
    const abandoned: Order[] = json.abandoned ?? [];

    const paymentIntentOrders = activeOrders.filter(isNewPaymentIntentOrder);

    if (!isInitialLoad.current) {
      const newPaymentIntentOrders = paymentIntentOrders.filter(
        (order) =>
          !knownPaymentIntentOrderIds.current.has(order.id) &&
          !notifiedPaymentIntentOrderIds.current.has(order.id),
      );

      markHighlightedPaymentOrders(newPaymentIntentOrders);

      for (const order of newPaymentIntentOrders) {
        const name =
          order.patient_name ||
          order.patient_full_name ||
          `${order.shipping_first_name ?? ""} ${order.shipping_last_name ?? ""}`.trim();

        const amount = formatMoney(order.total_amount_cents);
        notifiedPaymentIntentOrderIds.current.add(order.id);

        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("New Order", {
            body: `${name} - ${amount}`,
          });
        }
      }
    }

    paymentIntentOrders.forEach((o) =>
      knownPaymentIntentOrderIds.current.add(o.id),
    );
    isInitialLoad.current = false;

    setOrders(combined.sort(compareOperationalPriority));
    setAbandonedOrders(abandoned);
  }, [authHeaders, markHighlightedPaymentOrders]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!mounted) return;
      await fetchData();
    }

    init();

    const channel = supabase
      .channel("orders-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        () => {
          if (!mounted) return;
          fetchData();
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  useEffect(() => {
    const timeoutMap = highlightTimeouts.current;
    baseDocumentTitle.current = document.title || "Orders";

    return () => {
      timeoutMap.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutMap.clear();
      if (baseDocumentTitle.current) document.title = baseDocumentTitle.current;
    };
  }, []);

  useEffect(() => {
    const baseTitle = baseDocumentTitle.current ?? "Orders";
    const count = highlightedOrderIds.size;
    document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
  }, [highlightedOrderIds.size]);

  function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  async function updateAdminOrder(
    orderId: string,
    patch: Partial<
      Pick<
        Order,
        | "fulfillment_status"
        | "admin_notes"
        | "needs_review"
        | "verified"
        | "passive_verified"
        | "doctor_confirmed"
        | "blocked"
      >
    >,
  ): Promise<boolean> {
    setSavingOrderId(orderId);
    setAdminError(null);

    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: await authHeaders(),
        credentials: "same-origin",
        body: JSON.stringify(patch),
      });

      const json = await readAdminApiPayload(res);

      if (!res.ok) {
        const message = adminApiErrorMessage(json, "Order update failed.");
        setAdminError(message);
        if (process.env.NODE_ENV !== "production") {
          console.warn("[AdminOrdersPage] order update failed", {
            orderId,
            status: res.status,
            error: json.error,
            code: json.code,
          });
        }
        return false;
      }

      await fetchData();
      return true;
    } finally {
      setSavingOrderId(null);
    }
  }

  async function updateFulfillmentStatus(
    orderId: string,
    newStatus: FulfillmentStatus,
  ) {
    await updateAdminOrder(orderId, { fulfillment_status: newStatus });
  }

  async function updateVerificationFlag(
    orderId: string,
    key: VerificationFlag,
    value: boolean,
  ) {
    await updateAdminOrder(orderId, {
      [key]: value,
    } as Partial<Pick<Order, VerificationFlag>>);
  }

  function openNotes(order: Order, patientName: string) {
    setNotesModal({
      orderId: order.id,
      patientName,
      notes: order.admin_notes ?? "",
    });
  }

  function startReturnRefund(order: Order, patientName: string) {
    const existingNotes = order.admin_notes?.trim();
    setNotesModal({
      orderId: order.id,
      patientName,
      notes: [
        existingNotes,
        `[Return/refund started ${new Date().toLocaleDateString()}] `,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
  }

  async function saveNotes() {
    if (!notesModal) return;

    const ok = await updateAdminOrder(notesModal.orderId, {
      admin_notes: notesModal.notes,
    });
    if (ok) setNotesModal(null);
  }

  async function openRxImage(order: Order, patientName: string) {
    if (!order.rx_upload_path) return;

    setRxImageModal({
      orderId: order.id,
      patientName,
      path: order.rx_upload_path,
      url: null,
      loading: true,
      error: null,
      previewFailed: false,
    });

    const res = await fetch("/admin/orders/image-url", {
      method: "POST",
      headers: await authHeaders(),
      credentials: "same-origin",
      body: JSON.stringify({ path: order.rx_upload_path }),
    });

    const contentType = res.headers.get("content-type") ?? "";
    const json = (contentType.includes("application/json")
      ? await res.json().catch(() => ({}))
      : {
          error: await res.text().catch(() => ""),
          code: "non_json_response",
        }) as {
      url?: string;
      error?: string;
      code?: string;
    };

    if (!res.ok || !json.url) {
      const reason = [json.error, json.code].filter(Boolean).join(" ");
      setRxImageModal((current) =>
        current?.orderId === order.id
          ? {
              ...current,
              loading: false,
              error: reason || "Failed to load Rx image.",
            }
          : current,
      );
      return;
    }

    setRxImageModal((current) =>
      current?.orderId === order.id
        ? { ...current, url: json.url ?? null, loading: false }
        : current,
    );
  }

  async function archiveOrder(orderId: string) {
    if (!confirm("Archive this order and hide it from the operational queue?")) {
      return;
    }

    await fetch(`/api/orders/${orderId}/archive`, {
      method: "POST",
      headers: await authHeaders(),
      credentials: "same-origin",
      body: JSON.stringify({ archived: true }),
    });

    await fetchData();
  }

  async function runAbandonedAction(
    orderId: string,
    action: AbandonedAdminAction,
  ): Promise<boolean> {
    setAdminError(null);

    if (action === "archive" && !confirm("Archive this abandoned draft?")) {
      return false;
    }

    const res = await fetch(`/api/admin/abandoned-checkouts/${orderId}`, {
      method: "POST",
      headers: await authHeaders(),
      credentials: "same-origin",
      body: JSON.stringify({ action }),
    });

    const json = await readAdminApiPayload(res);

    if (!res.ok) {
      const message = adminApiErrorMessage(
        json,
        "Abandoned checkout action failed.",
      );
      setAdminError(message);
      if (process.env.NODE_ENV !== "production") {
        console.warn("[AdminOrdersPage] abandoned checkout action failed", {
          orderId,
          action,
          status: res.status,
          error: json.error,
          code: json.code,
        });
      }
      return false;
    }

    if (action === "draft_recovery_email" && json.draft) {
      const draft = json.draft;
      setRecoveryDrafts((prev) => ({ ...prev, [orderId]: draft }));

      try {
        await navigator.clipboard.writeText(draft.text);
      } catch {
        // Clipboard access can be blocked by the browser; the draft remains visible.
      }
      return true;
    }

    await fetchData();
    return true;
  }

  async function confirmPermanentDelete() {
    if (!permanentDeleteModal) return;

    const ok = await runAbandonedAction(
      permanentDeleteModal.orderId,
      "delete_permanently",
    );
    if (ok) setPermanentDeleteModal(null);
  }

  function copyOrderText(order: Order, rx: ReturnType<typeof parseRx>): void {
    const patientName =
      order.patient_name ||
      order.patient_full_name ||
      `${order.shipping_first_name ?? ""} ${order.shipping_last_name ?? ""}`.trim();

    const text = [
      `Order: ${order.id}`,
      `Customer: ${patientName}`,
      `Payment: ${normalizedPaymentStatus(order)}`,
      `Fulfillment: ${normalizedFulfillmentStatus(order)}`,
      `Verify: ${verificationSummary(order).label}`,
      `Amount: ${formatMoney(order.total_amount_cents)}`,
      `Shipping: ${order.shipping_method ?? "standard"} | ${formatMoney(
        order.shipping_cents ?? 0,
      )}`,
      `SKU: ${order.sku ?? "-"}`,
      `Boxes: OD ${order.od_box_count ?? order.box_count ?? "-"} | OS ${
        order.os_box_count ?? order.box_count ?? "-"
      } | Total ${order.total_box_count ?? order.box_count ?? "-"}`,
      `RX OD: ${rx.od}`,
      `RX OS: ${rx.os}`,
      `Expires: ${rx.exp ?? "-"}`,
      `Dr: ${order.prescriber_name ?? "-"}`,
      `Ship to: ${order.shipping_first_name ?? ""} ${order.shipping_last_name ?? ""}`,
      order.shipping_address1,
      order.shipping_address2,
      `${order.shipping_city}, ${order.shipping_state} ${order.shipping_zip}`,
      `Phone: ${order.shipping_phone ?? "-"}`,
      `Email: ${order.shipping_email ?? "-"}`,
    ]
      .filter(Boolean)
      .join("\n");

    navigator.clipboard.writeText(text);
  }

  const actionRequiredOrders = orders.filter(
    (order) => getOrderOperationalBucket(order) === "action_required",
  );
  const activeFulfillmentOrders = orders.filter(
    (order) => getOrderOperationalBucket(order) === "active_fulfillment",
  );
  const archiveOrders = orders.filter(shouldDefaultCollapse).sort(archiveSort);
  const sortSectionOrders = (sectionOrders: Order[]) =>
    [...sectionOrders].sort((a, b) => {
      const aOpen = expanded === a.id;
      const bOpen = expanded === b.id;
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      return orderActivityTime(b) - orderActivityTime(a);
    });
  const activeOrderSections: {
    key: Exclude<OrderOperationalBucket, "history_archive">;
    title: string;
    description: string;
    orders: Order[];
  }[] = [
    {
      key: "action_required",
      title: "Action Required",
      description: "Payment, Rx, verification, blocked, express, or manual attention.",
      orders: sortSectionOrders(actionRequiredOrders),
    },
    {
      key: "active_fulfillment",
      title: "Active Fulfillment",
      description: "Ready, ordered, and recent shipped work still in the operator lane.",
      orders: sortSectionOrders(activeFulfillmentOrders),
    },
  ];
  const archiveCount = archiveOrders.length + abandonedOrders.length;

  return (
    <main style={{ padding: 20 }} onClick={requestNotificationPermission}>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 20 }}>
        Orders
      </h1>

      {adminError && (
        <div
          role="status"
          style={{
            border: "1px solid rgba(248,113,113,0.5)",
            borderRadius: 8,
            background: "rgba(127,29,29,0.22)",
            color: "#fecaca",
            padding: "10px 12px",
            marginBottom: 12,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
          }}
        >
          <span>{adminError}</span>
          <button
            type="button"
            onClick={() => setAdminError(null)}
            style={buttonStyle({ color: "#fecaca" })}
          >
            Dismiss
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        {activeOrderSections.map((section) => (
          <section key={section.key}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "baseline",
                marginBottom: 10,
                paddingBottom: 8,
                borderBottom: "1px solid rgba(148,163,184,0.18)",
              }}
            >
              <div>
                <h2 style={{ fontSize: 16, margin: 0, fontWeight: 900 }}>
                  {section.title} ({section.orders.length})
                </h2>
                <div style={{ fontSize: 12, opacity: 0.68, marginTop: 3 }}>
                  {section.description}
                </div>
              </div>
            </div>

            {section.orders.length === 0 ? (
              <div
                style={{
                  border: "1px solid rgba(148,163,184,0.16)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  color: "rgba(226,232,240,0.6)",
                  fontSize: 13,
                }}
              >
                No orders in this queue.
              </div>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                {section.orders.map((o) => {
          const rx = parseRx(o.rx);
          const rxStatus = normalizedRxStatus(o);
          const payment = paymentStatus(o);
          const verification = getVerificationStatus(o);
          const fulfillment = normalizedFulfillmentStatus(o);
          const path = verificationPath(o);
          const dateTime = formatAdminOrderDateTimeCentral(
            o.updated_at ?? o.created_at,
          );
          const derivedStage = getOperationalStatus(o);
          const actionability = getActionability(o);
          const captureState = paymentCaptureSummary(o);
          const rxLines = formatCollapsedRxLine(o);
          const lensDisplay = getOrderLensDisplayName(o);
          const isHighlighted = highlightedOrderIds.has(o.id);
          const nextFulfillment = nextFulfillmentStatus(fulfillment);
          const previousFulfillment = previousFulfillmentStatus(fulfillment);

          const patientName =
            o.patient_name ||
            o.patient_full_name ||
            `${o.shipping_first_name ?? ""} ${
              o.shipping_last_name ?? ""
            }`.trim();

          const shippingName = `${o.shipping_first_name ?? ""} ${
            o.shipping_last_name ?? ""
          }`.trim();

          const sameName = patientName === shippingName;

          const flags = isOperationallyComplete(o)
            ? []
            : [
                !sameName ? "Name mismatch" : null,
                !o.prescriber_name &&
                normalizedPaymentStatus(o) === "authorized"
                  ? "No prescriber"
                  : null,
                !o.rx_upload_path && !o.prescriber_name
                  ? "No verification path"
                  : null,
                ...actionability.reasons,
              ].filter((flag): flag is string => Boolean(flag));

          const isOpen = expanded === o.id;
          const isRxOpen = rxExpanded === o.id;

          const odBoxes = o.od_box_count ?? o.box_count ?? "-";
          const osBoxes = o.os_box_count ?? o.box_count ?? "-";
          const totalBoxes = o.total_box_count ?? o.box_count ?? "-";
          const boxDisplay =
            odBoxes === osBoxes
              ? `${odBoxes} bx`
              : `OD ${odBoxes} / OS ${osBoxes} (${totalBoxes} total)`;

          return (
            <div
              key={o.id}
              style={{
                border: isHighlighted
                  ? "1px solid rgba(186,230,253,0.95)"
                  : "1px solid rgba(148,163,184,0.2)",
                borderRadius: 10,
                padding: "10px 12px",
                background: isOpen
                  ? "rgba(30,41,59,0.6)"
                  : isHighlighted
                    ? "rgba(14,165,233,0.08)"
                    : "transparent",
                boxShadow: isHighlighted
                  ? "0 0 0 1px rgba(186,230,253,0.18), 0 0 20px rgba(14,165,233,0.16)"
                  : "none",
                opacity: 1,
              }}
            >
              <div
                onClick={() => {
                  clearOrderHighlight(o.id);
                  setExpanded(isOpen ? null : o.id);
                }}
                style={{ cursor: "pointer" }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "112px minmax(260px, 1.35fr) minmax(260px, 1fr)",
                    gap: 12,
                    alignItems: "start",
                    fontSize: 12,
                    lineHeight: 1.35,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>
                      {dateTime.date}
                    </div>
                    <div style={{ opacity: 0.72 }}>{dateTime.time}</div>
                    <div style={{ marginTop: 8 }}>
                      <span style={badgeStyle(derivedStage.tone)}>
                        {derivedStage.stage}
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        color: "rgba(226,232,240,0.78)",
                      }}
                    >
                      Awaiting {derivedStage.awaiting}
                    </div>
                    {o.shipping_method === "express" && (
                      <div
                        style={{
                          marginTop: 7,
                          padding: "5px 7px",
                          borderRadius: 6,
                          border: "1px solid rgba(251,191,36,0.7)",
                          background: "rgba(251,191,36,0.14)",
                          color: "#fde68a",
                          fontWeight: 800,
                          letterSpacing: 0,
                        }}
                      >
                        EXPRESS
                      </div>
                    )}
                    {isHighlighted && (
                      <div
                        style={{
                          marginTop: 6,
                          color: "#bae6fd",
                          fontWeight: 700,
                        }}
                      >
                        New payment
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>
                      {patientName || shippingName || "Unknown customer"}
                    </div>
                    {!sameName && shippingName && (
                      <div style={{ opacity: 0.72 }}>Ship: {shippingName}</div>
                    )}
                    <div style={{ marginTop: 6 }}>
                      <CopyableValue value={o.shipping_address1} />
                    </div>
                    {o.shipping_address2 && (
                      <div>
                        <CopyableValue value={o.shipping_address2} />
                      </div>
                    )}
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                        alignItems: "baseline",
                      }}
                    >
                      <CopyableValue value={o.shipping_city} />
                      {o.shipping_state && (
                        <span style={{ opacity: 0.75 }}>
                          {o.shipping_state}
                        </span>
                      )}
                      <CopyableValue value={o.shipping_zip} />
                    </div>
                    {o.shipping_email && (
                      <div style={{ marginTop: 3 }}>
                        <CopyableValue value={o.shipping_email} />
                      </div>
                    )}
                  </div>

                  <div>
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={badgeStyle(captureState.tone)}>
                        {captureState.label}
                      </span>
                      <span style={{ opacity: 0.72 }}>
                        {formatMoney(o.total_amount_cents)}
                      </span>
                    </div>

                    <div style={{ marginTop: 7, fontWeight: 800 }}>
                      {lensDisplay}
                    </div>

                    <div
                      style={{
                        marginTop: 3,
                        color: "rgba(226,232,240,0.85)",
                      }}
                    >
                      {rxLines.length > 0 ? (
                        rxLines.map((line) => <div key={line}>{line}</div>)
                      ) : (
                        <div>Rx pending</div>
                      )}
                    </div>

                    <div style={{ marginTop: 5, opacity: 0.76 }}>
                      {boxDisplay}
                    </div>

                    <div style={{ marginTop: 2, opacity: 0.76 }}>
                      {o.shipping_method === "express" ? "Express" : "Standard"}{" "}
                      shipping {formatMoney(o.shipping_cents ?? 0)}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        marginTop: 8,
                      }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRxExpanded(isRxOpen ? null : o.id);
                        }}
                        style={buttonStyle({ fontSize: 12 })}
                      >
                        {isRxOpen ? "Hide Rx" : "View Rx"}
                      </button>

                      {o.rx_upload_path && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openRxImage(o, patientName || "Unknown customer");
                          }}
                          style={buttonStyle({ fontSize: 12 })}
                        >
                          View Rx Image
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          clearOrderHighlight(o.id);
                          setExpanded(isOpen ? null : o.id);
                        }}
                        style={buttonStyle({ fontSize: 12 })}
                        aria-expanded={isOpen}
                      >
                        {isOpen ? "Hide Details" : "Details"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {isRxOpen && !isOpen && <RxDetailsPanel order={o} />}

              {isOpen && (
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 13,
                    opacity: 0.85,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      marginBottom: 10,
                    }}
                  >
                    <span style={badgeStyle(payment.tone)}>
                      Payment: {payment.label}
                    </span>
                    <span
                      style={badgeStyle(
                        isOperationallyComplete(o) ? "neutral" : rxTone(o),
                      )}
                    >
                      Rx: {isOperationallyComplete(o) ? "closed" : rxStatus}
                    </span>
                    {!isOperationallyComplete(o) && (
                      <span style={badgeStyle(path.tone)}>
                        Path: {path.label}
                      </span>
                    )}
                    <span style={badgeStyle(verification.tone)}>
                      Verification: {verification.label}
                    </span>
                    <span style={badgeStyle(fulfillmentTone(fulfillment))}>
                      Fulfillment: {labelizeStatus(fulfillment)}
                    </span>
                    {flags.map((flag) => (
                      <span key={flag} style={badgeStyle("warning")}>
                        {flag}
                      </span>
                    ))}
                  </div>

                  <OperationalTimeline order={o} />

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 10,
                      marginTop: 12,
                      marginBottom: 12,
                    }}
                  >
                    <div style={mutedPanelStyle()}>
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>
                        Customer / Shipping
                      </div>
                      {o.shipping_phone && <div>Phone: {o.shipping_phone}</div>}
                      {o.shipping_email && <div>Email: {o.shipping_email}</div>}
                      <div>
                        Ship to: {shippingName || patientName || "Unknown"}
                      </div>
                      <div>{o.shipping_address1 ?? "-"}</div>
                      {o.shipping_address2 && <div>{o.shipping_address2}</div>}
                      <div>
                        {[o.shipping_city, o.shipping_state, o.shipping_zip]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    </div>

                    <div style={mutedPanelStyle()}>
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>
                        Payment / Stripe
                      </div>
                      <div>Status: {normalizedPaymentStatus(o)}</div>
                      <div>Total: {formatMoney(o.total_amount_cents)}</div>
                      <div>
                        Shipping:{" "}
                        {o.shipping_method === "express"
                          ? "Express"
                          : "Standard"}{" "}
                        {formatMoney(o.shipping_cents ?? 0)}
                      </div>
                      {o.payment_intent_id && <div>PI: {o.payment_intent_id}</div>}
                      {o.stripe_payment_intent_status && (
                        <div>Stripe: {o.stripe_payment_intent_status}</div>
                      )}
                      {o.payment_status_source && (
                        <div>Source: {o.payment_status_source}</div>
                      )}
                    </div>

                    <div style={mutedPanelStyle()}>
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>
                        Prescriber
                      </div>
                      <div>Name: {o.prescriber_name ?? "-"}</div>
                      <div>Email: {o.prescriber_email ?? "-"}</div>
                      <div>Phone: {o.prescriber_phone ?? "-"}</div>
                    </div>

                    <div style={mutedPanelStyle()}>
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>
                        Internal / Audit
                      </div>
                      <div>Order: {o.id}</div>
                      <div>Backend: {labelizeStatus(o.status)}</div>
                      <div>Created: {formatDateTime(o.created_at)}</div>
                      <div>Updated: {formatDateTime(o.updated_at)}</div>
                      <div>Rx status: {rxStatus}</div>
                      <div>Rx source: {o.rx_source ?? "-"}</div>
                      {rx.exp && <div>Rx exp: {rx.exp}</div>}
                    </div>
                  </div>

                  {o.rx_upload_path && (
                    <div style={{ ...mutedPanelStyle(), marginBottom: 12 }}>
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>
                        Uploaded Rx Image
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openRxImage(o, patientName || "Unknown customer");
                        }}
                        style={buttonStyle()}
                      >
                        View Rx Image
                      </button>
                      <div style={{ marginTop: 6, opacity: 0.72 }}>
                        {o.rx_upload_path}
                      </div>
                    </div>
                  )}

                  <RxDetailsPanel order={o} />

                  <div
                    style={{
                      ...mutedPanelStyle(),
                      display: "grid",
                      gap: 10,
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      {previousFulfillment && (
                        <button
                          type="button"
                          disabled={savingOrderId === o.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateFulfillmentStatus(o.id, previousFulfillment);
                          }}
                          style={buttonStyle()}
                        >
                          Undo to {labelizeStatus(previousFulfillment)}
                        </button>
                      )}

                      {nextFulfillment && (
                        <button
                          type="button"
                          disabled={savingOrderId === o.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateFulfillmentStatus(o.id, nextFulfillment);
                          }}
                          style={buttonStyle({
                            background: "rgba(20,184,166,0.22)",
                          })}
                        >
                          {workflowActionLabel(fulfillment, nextFulfillment)}
                        </button>
                      )}

                      {fulfillment === "completed" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startReturnRefund(
                              o,
                              patientName || "Unknown customer",
                            );
                          }}
                          style={buttonStyle({
                            background: "rgba(236,72,153,0.18)",
                          })}
                        >
                          Start Return / Refund
                        </button>
                      )}

                      <label style={{ fontWeight: 700 }}>
                        Advanced override
                        <select
                          value={fulfillment}
                          disabled={savingOrderId === o.id}
                          onChange={(e) => {
                            e.stopPropagation();
                            const next = e.target.value;
                            if (isFulfillmentStatus(next)) {
                              updateFulfillmentStatus(o.id, next);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            marginLeft: 8,
                            padding: "4px 8px",
                            borderRadius: 4,
                          }}
                        >
                          {FULFILLMENT_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>

                      {savingOrderId === o.id && <span>Saving...</span>}
                    </div>

                    <VerificationControls
                      order={o}
                      onToggle={updateVerificationFlag}
                    />
                  </div>

                  <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openNotes(o, patientName || "Unknown customer");
                      }}
                      onClickCapture={(e) => e.stopPropagation()}
                      style={buttonStyle()}
                    >
                      Notes
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyOrderText(o, rx);
                      }}
                      onClickCapture={(e) => e.stopPropagation()}
                      style={buttonStyle()}
                    >
                      Copy Order
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        archiveOrder(o.id);
                      }}
                      onClickCapture={(e) => e.stopPropagation()}
                      style={buttonStyle({ color: "#fbbf24" })}
                    >
                      Archive
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
                })}
              </div>
            )}
          </section>
        ))}
      </div>

      <section style={{ marginTop: 34 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
          History / Archive ({archiveCount})
        </h2>
        <p style={{ marginTop: 0, opacity: 0.72, fontSize: 13 }}>
          Shipped, completed, cancelled, abandoned, and stale inactive orders are
          compressed by default.
        </p>
        {archiveCount === 0 ? (
          <div style={{ ...mutedPanelStyle(), opacity: 0.72 }}>
            No historical orders yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {archiveOrders.map((o) => {
              const status = archiveOrderStatus(o);
              const isOpen = expanded === o.id;
              const dateTime = formatAdminOrderDateTimeCentral(
                o.updated_at ?? o.created_at,
              );
              const patientName =
                o.patient_name ||
                o.patient_full_name ||
                `${o.shipping_first_name ?? ""} ${
                  o.shipping_last_name ?? ""
                }`.trim() ||
                "Unknown customer";
              const rx = parseRx(o.rx);

              return (
                <div key={o.id}>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : o.id)}
                    aria-expanded={isOpen}
                    style={{
                      width: "100%",
                      minHeight: 34,
                      display: "grid",
                      gridTemplateColumns:
                        "92px minmax(160px, 1fr) 100px 150px 80px",
                      gap: 10,
                      alignItems: "center",
                      border: "1px solid rgba(148,163,184,0.14)",
                      borderRadius: 8,
                      background: isOpen
                        ? "rgba(30,41,59,0.45)"
                        : "rgba(15,23,42,0.22)",
                      color: "inherit",
                      padding: "6px 10px",
                      textAlign: "left",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontWeight: 800 }}>{dateTime.date}</span>
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {patientName}
                    </span>
                    <span>{formatMoney(o.total_amount_cents)}</span>
                    <span style={badgeStyle(status.tone)}>{status.label}</span>
                    <span style={{ textAlign: "right", opacity: 0.7 }}>
                      {isOpen ? "Hide" : "Details"}
                    </span>
                  </button>

                  {isOpen && (
                    <div
                      style={{
                        ...mutedPanelStyle(),
                        marginTop: 6,
                        marginBottom: 8,
                        fontSize: 13,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(220px, 1fr))",
                          gap: 10,
                          marginBottom: 12,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 800, marginBottom: 4 }}>
                            Order
                          </div>
                          <div>Status: {status.label}</div>
                          <div>Total: {formatMoney(o.total_amount_cents)}</div>
                          <div>
                            Payment: {normalizedPaymentStatus(o)}
                          </div>
                          <div>
                            Fulfillment:{" "}
                            {labelizeStatus(normalizedFulfillmentStatus(o))}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontWeight: 800, marginBottom: 4 }}>
                            Customer
                          </div>
                          <div>{patientName}</div>
                          <div>{o.shipping_email ?? "-"}</div>
                          <div>
                            {[o.shipping_city, o.shipping_state, o.shipping_zip]
                              .filter(Boolean)
                              .join(", ") || "-"}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontWeight: 800, marginBottom: 4 }}>
                            Rx / Fulfillment
                          </div>
                          <div>{getOrderLensDisplayName(o)}</div>
                          <div>
                            {o.total_box_count ?? o.box_count ?? "-"} boxes
                          </div>
                          <div>
                            {o.shipping_method === "express"
                              ? "Express"
                              : "Standard"}{" "}
                            shipping {formatMoney(o.shipping_cents ?? 0)}
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          marginBottom: 12,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setRxExpanded(rxExpanded === o.id ? null : o.id)}
                          style={buttonStyle()}
                        >
                          {rxExpanded === o.id ? "Hide Rx" : "View Rx"}
                        </button>
                        {o.rx_upload_path && (
                          <button
                            type="button"
                            onClick={() => openRxImage(o, patientName)}
                            style={buttonStyle()}
                          >
                            View Rx Image
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openNotes(o, patientName)}
                          style={buttonStyle()}
                        >
                          Notes
                        </button>
                        <button
                          type="button"
                          onClick={() => copyOrderText(o, rx)}
                          style={buttonStyle()}
                        >
                          Copy Order
                        </button>
                      </div>

                      {rxExpanded === o.id && <RxDetailsPanel order={o} />}
                    </div>
                  )}
                </div>
              );
            })}

            {abandonedOrders.map((o) => {
              const info = o.abandoned_checkout;
              const reasons = info?.reasons ?? [];
              const patientName =
                o.patient_name ||
                o.patient_full_name ||
                `${o.shipping_first_name ?? ""} ${
                  o.shipping_last_name ?? ""
                }`.trim() ||
                "Unknown customer";
              const draft = recoveryDrafts[o.id];
              const rowId = `abandoned:${o.id}`;
              const isOpen = expanded === rowId;
              const dateTime = formatAdminOrderDateTimeCentral(
                info?.activityAt ?? o.updated_at ?? o.created_at,
              );
              const primaryReason = info?.primaryReason
                ? abandonedReasonLabel(info.primaryReason)
                : "ABANDONED";

              return (
                <div key={`abandoned-${o.id}`}>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : rowId)}
                    aria-expanded={isOpen}
                    style={{
                      width: "100%",
                      minHeight: 34,
                      display: "grid",
                      gridTemplateColumns:
                        "92px minmax(160px, 1fr) 100px 150px 80px",
                      gap: 10,
                      alignItems: "center",
                      border: "1px solid rgba(251,191,36,0.24)",
                      borderRadius: 8,
                      background: isOpen
                        ? "rgba(120,53,15,0.22)"
                        : "rgba(120,53,15,0.1)",
                      color: "inherit",
                      padding: "6px 10px",
                      textAlign: "left",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontWeight: 800 }}>{dateTime.date}</span>
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {patientName}
                    </span>
                    <span>{formatMoney(o.total_amount_cents)}</span>
                    <span style={badgeStyle("warning")}>{primaryReason}</span>
                    <span style={{ textAlign: "right", opacity: 0.7 }}>
                      {isOpen ? "Hide" : "Details"}
                    </span>
                  </button>

                  {isOpen && (
                    <div
                      style={{
                        ...mutedPanelStyle(),
                        marginTop: 6,
                        marginBottom: 8,
                        background: "rgba(120,53,15,0.12)",
                        fontSize: 13,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap",
                          marginBottom: 10,
                        }}
                      >
                        {reasons.map((reason) => (
                          <span key={reason} style={badgeStyle("warning")}>
                            {abandonedReasonLabel(reason)}
                          </span>
                        ))}
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(220px, 1fr))",
                          gap: 10,
                          marginBottom: 12,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 800, marginBottom: 4 }}>
                            Draft
                          </div>
                          <div>Created: {formatDateTime(o.created_at)}</div>
                          <div>Updated: {formatDateTime(o.updated_at)}</div>
                          <div>Age: {formatAge(info?.ageHours)}</div>
                        </div>

                        <div>
                          <div style={{ fontWeight: 800, marginBottom: 4 }}>
                            Customer
                          </div>
                          <div>{patientName}</div>
                          <div>Email: {o.shipping_email ?? "-"}</div>
                          <div>Rx mode: {rxModeLabel(info?.rxMode)}</div>
                        </div>

                        <div>
                          <div style={{ fontWeight: 800, marginBottom: 4 }}>
                            Payment
                          </div>
                          <div>Total: {formatMoney(o.total_amount_cents)}</div>
                          <div>
                            Payment intent: {o.payment_intent_id ? "yes" : "no"}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          onClick={() => runAbandonedAction(o.id, "archive")}
                          style={{ padding: "4px 8px", borderRadius: 4 }}
                        >
                          Archive
                        </button>
                        <button
                          onClick={() =>
                            runAbandonedAction(o.id, "draft_recovery_email")
                          }
                          style={{ padding: "4px 8px", borderRadius: 4 }}
                        >
                          Draft recovery email
                        </button>
                        {!o.payment_intent_id && (
                          <button
                            onClick={() =>
                              setPermanentDeleteModal({
                                orderId: o.id,
                                patientName,
                              })
                            }
                            style={{
                              padding: "4px 8px",
                              borderRadius: 4,
                              color: "#fecaca",
                              border: "1px solid rgba(248,113,113,0.45)",
                              background: "rgba(127,29,29,0.2)",
                            }}
                          >
                            Delete permanently
                          </button>
                        )}
                      </div>

                      {draft && (
                        <div
                        style={{
                            marginTop: 12,
                            padding: 12,
                            borderRadius: 8,
                            border: "1px solid rgba(148,163,184,0.25)",
                            background: "rgba(15,23,42,0.35)",
                        }}
                        >
                          <div style={{ fontWeight: 700 }}>{draft.subject}</div>
                          <div style={{ opacity: 0.75 }}>
                            To: {draft.to ?? "-"}
                          </div>
                          <pre
                            style={{
                              whiteSpace: "pre-wrap",
                              marginBottom: 0,
                              fontFamily: "monospace",
                            }}
                          >
                            {draft.text}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {permanentDeleteModal && (
        <div
          onClick={() => setPermanentDeleteModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 55,
            background: "rgba(2,6,23,0.78)",
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(520px, 100%)",
              ...mutedPanelStyle(),
              background: "#0f172a",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 8 }}>
              Delete permanently?
            </div>
            <p style={{ marginTop: 0, color: "rgba(226,232,240,0.8)" }}>
              This will permanently delete the abandoned no-payment draft for{" "}
              {permanentDeleteModal.patientName} and remove any uploaded Rx file.
              This cannot be undone.
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                type="button"
                style={buttonStyle()}
                onClick={() => setPermanentDeleteModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                style={buttonStyle({
                  color: "#fecaca",
                  border: "1px solid rgba(248,113,113,0.45)",
                  background: "rgba(127,29,29,0.32)",
                })}
                onClick={confirmPermanentDelete}
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {notesModal && (
        <div
          onClick={() => setNotesModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(2,6,23,0.78)",
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(720px, 100%)",
              ...mutedPanelStyle(),
              background: "#0f172a",
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 8 }}>
              Notes: {notesModal.patientName}
            </div>
            <textarea
              value={notesModal.notes}
              onChange={(e) =>
                setNotesModal((current) =>
                  current ? { ...current, notes: e.target.value } : current,
                )
              }
              rows={8}
              style={{
                width: "100%",
                boxSizing: "border-box",
                borderRadius: 6,
                border: "1px solid rgba(148,163,184,0.35)",
                background: "rgba(2,6,23,0.75)",
                color: "inherit",
                padding: 10,
                resize: "vertical",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 12,
              }}
            >
              <button style={buttonStyle()} onClick={() => setNotesModal(null)}>
                Cancel
              </button>
              <button
                style={buttonStyle({ background: "rgba(20,184,166,0.25)" })}
                onClick={saveNotes}
                disabled={savingOrderId === notesModal.orderId}
              >
                {savingOrderId === notesModal.orderId ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {rxImageModal && (
        <div
          onClick={() => setRxImageModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(2,6,23,0.84)",
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(960px, 100%)",
              maxHeight: "92vh",
              ...mutedPanelStyle(),
              background: "#0f172a",
              overflow: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <div style={{ fontWeight: 800 }}>
                Rx Image: {rxImageModal.patientName}
              </div>
              <button
                style={buttonStyle()}
                onClick={() => setRxImageModal(null)}
              >
                Close
              </button>
            </div>

            {rxImageModal.loading && <div>Loading...</div>}
            {rxImageModal.error && (
              <div style={{ color: "#fca5a5" }}>{rxImageModal.error}</div>
            )}
            {rxImageModal.url && !rxImageModal.previewFailed && (
              previewKind(rxImageModal.path) === "pdf" ? (
                <iframe
                  src={rxImageModal.url}
                  title="Rx PDF preview"
                  style={{
                    width: "100%",
                    height: "76vh",
                    border: "1px solid rgba(148,163,184,0.25)",
                    borderRadius: 6,
                    background: "#020617",
                  }}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs are short-lived.
                <img
                  src={rxImageModal.url}
                  alt="Uploaded prescription"
                  onError={() =>
                    setRxImageModal((current) =>
                      current ? { ...current, previewFailed: true } : current,
                    )
                  }
                  style={{
                    display: "block",
                    maxWidth: "100%",
                    maxHeight: "76vh",
                    margin: "0 auto",
                    borderRadius: 6,
                  }}
                />
              )
            )}

            {rxImageModal.url && rxImageModal.previewFailed && (
                <div style={{ marginTop: 12 }}>
                  <a
                    href={rxImageModal.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#67e8f9", fontWeight: 700 }}
                  >
                    Open signed preview
                  </a>
                </div>
              )}
          </div>
        </div>
      )}
    </main>
  );
}

function OperationalTimeline({ order }: { order: Order }) {
  const readiness = deriveOperationalReadiness(order);
  const timeline = compactTimeline(order);

  return (
    <div style={{ ...mutedPanelStyle(), marginTop: 10 }}>
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <span style={badgeStyle(readiness.tone)}>{readiness.label}</span>
        {readiness.reasons.slice(1, 4).map((reason) => (
          <span key={reason} style={badgeStyle("neutral")}>
            {reason.toUpperCase()}
          </span>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 8,
        }}
      >
        {timeline.map((step) => (
          <div
            key={step.label}
            style={{
              borderTop: `3px solid ${
                step.tone === "blocked"
                  ? "#ef4444"
                  : step.tone === "warning"
                    ? "#f59e0b"
                    : step.tone === "capture"
                      ? "#14b8a6"
                      : "#22c55e"
              }`,
              paddingTop: 6,
              color: "rgba(226,232,240,0.9)",
              fontSize: 12,
              minWidth: 0,
            }}
          >
            {step.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function VerificationControls({
  order,
  onToggle,
}: {
  order: Order;
  onToggle: (orderId: string, key: VerificationFlag, value: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {VERIFICATION_FLAGS.map((flag) => (
        <label
          key={flag.key}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 8px",
            border: "1px solid rgba(148,163,184,0.25)",
            borderRadius: 6,
            background: "rgba(15,23,42,0.4)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={Boolean(order[flag.key])}
            onChange={(e) => onToggle(order.id, flag.key, e.target.checked)}
          />
          {flag.label}
        </label>
      ))}
    </div>
  );
}
