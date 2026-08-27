"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { supabase } from "@/lib/supabase-client";
import { getLensDisplayName } from "@/lib/cart/display";
import {
  formatAdminActivity,
  formatAdminDateTime,
  formatAdminDateTimeParts,
} from "@/lib/admin/time";
import {
  getNextAction,
  getPaymentState,
  getRxSourceState,
  getVerificationState,
  type PaymentLifecycleStatus,
} from "@/lib/orders/getNextAction";
import {
  ADMIN_WORK_QUEUE_SECTIONS,
  isMerchantQueueBucket,
  type OperationalQueueBucket,
  type OperationalQueueClassification,
  type OperationalQueueIntegrityIssue,
} from "@/lib/orders/operationalQueue";
import {
  assessAdminFulfillmentTransition,
  getAdminFulfillmentStatus,
  type AdminFulfillmentStatus,
} from "@/lib/orders/adminWorkflow";
import {
  getAdminExceptionBadges,
  type AdminExceptionBadge,
} from "@/lib/orders/adminPresentation";
import {
  authorizationRiskPriority,
  getAuthorizationRisk,
  type AuthorizationRisk,
} from "@/lib/orders/authorizationRisk";
import { getAdminPaymentDisplay } from "@/lib/orders/adminPaymentDisplay";
import type { ManualVerificationAttemptMethod } from "@/lib/orders/verificationAttempts";
import { isOrderRowControlTarget } from "@/lib/admin/orderRowInteraction";
import { lenses } from "@/LensCore";
import { CORE_TO_SKUS } from "@/lib/pricing/resolveDefaultSku";

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
  verification_sent_at?: string | null;
  verification_phone_attempted_at?: string | null;
  verification_fax_attempted_at?: string | null;
  rx_status?: string | null;
  archived?: boolean;
  archived_at?: string | null;
  fulfillment_status?: string | null;
  payment_status?: PaymentStatus | null;
  stripe_payment_intent_status?: string | null;
  stripe_authorized_amount_cents?: number | null;
  stripe_captured_amount_cents?: number | null;
  stripe_authorized_at?: string | null;
  stripe_capture_before?: string | null;
  payment_status_source?: string | null;
  operational_queue: OperationalQueueClassification;
  email_delivery_status?: string | null;
  email_last_event?: string | null;
  email_last_event_at?: string | null;
  email_failure_reason?: string | null;
  email_delivery_requires_attention?: boolean | null;
  confirmation_email_sent_at?: string | null;
  confirmation_email_delivered_at?: string | null;
  admin_notes?: string | null;

  total_amount_cents?: number | null;
  capture_amount_cents?: number | null;
  capture_adjustment_reason?: CaptureAdjustmentReason | string | null;
  capture_adjusted_by?: string | null;
  capture_adjusted_at?: string | null;
  shipping_cents?: number | null;
  shipping_method?: "standard" | "express" | null;
  sku?: string;
  box_count?: number | null;
  total_box_count?: number | null;
  right_box_count?: number | null;
  left_box_count?: number | null;
  od_box_count?: number | null;
  os_box_count?: number | null;
  adjusted_right_box_count?: number | null;
  adjusted_left_box_count?: number | null;
  adjusted_total_box_count?: number | null;
  order_quantity_adjustment_reason?: OrderQuantityAdjustmentReason | string | null;
  order_quantity_adjusted_by?: string | null;
  order_quantity_adjusted_at?: string | null;

  created_at?: string;
  updated_at?: string | null;
  lastOperationalActivityAt?: string | null;
  lastOperationalActivityReason?: string | null;

  rx: string | RxData | null;
  rx_ocr_raw?: unknown;
  rx_source?: string | null;

  rx_upload_path?: string | null;
  rx_lens_brand?: string | null;
  rx_expiration_date?: string | null;

  prescriber_name?: string | null;
  prescriber_email?: string | null;
  prescriber_phone?: string | null;
  prescriber_fax?: string | null;

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
  patient_first_name?: string | null;
  patient_middle_name?: string | null;
  patient_last_name?: string | null;
  rx_patient_name?: string | null;

  payment_intent_id?: string | null;
  abandoned_checkout?: AbandonedCheckoutClassification;
};

type PaymentStatus = PaymentLifecycleStatus;

type FulfillmentStatus = AdminFulfillmentStatus;

type CaptureAdjustmentReason =
  | "Quantity correction"
  | "Prescription correction"
  | "Shipping adjustment"
  | "Inventory adjustment"
  | "Customer service accommodation"
  | "Other";

type OrderQuantityAdjustmentReason =
  | "Quantity correction"
  | "Customer requested change"
  | "Prescription correction"
  | "Inventory adjustment"
  | "Other";

type BadgeTone =
  | "good"
  | "warning"
  | "blocked"
  | "neutral"
  | "info"
  | "capture"
  | "refund";

type OrderStatusFlag = AdminExceptionBadge;

type NotesModalState = {
  orderId: string;
  patientName: string;
  notes: string;
};

type CaptureAdjustmentModalState = {
  orderId: string;
  patientName: string;
  authorizedAmountCents: number;
  amount: string;
  reason: CaptureAdjustmentReason;
  error: string | null;
};

type OrderQuantityAdjustmentModalState = {
  orderId: string;
  patientName: string;
  rightBoxes: string;
  leftBoxes: string;
  reason: OrderQuantityAdjustmentReason;
  error: string | null;
};

type LensCorrectionEyeForm = {
  sphere: string;
  cylinder: string;
  axis: string;
  add: string;
  base_curve: string;
  diameter: string;
};

type LensCorrectionModalState = {
  orderId: string;
  patientName: string;
  coreId: string;
  sku: string;
  expires: string;
  right: LensCorrectionEyeForm;
  left: LensCorrectionEyeForm;
  rightBoxes: string;
  leftBoxes: string;
  sharedPackForBothEyes: boolean;
  reason: string;
  customerApprovedSubstitution: boolean;
  paymentAlreadyCaptured: boolean;
  capturedAmount: string;
  supplierOrderAlreadyPlaced: boolean;
  error: string | null;
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
  orderIds: string[];
  label: string;
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

type AdminNotice = {
  tone: "info" | "success";
  message: string;
};

type AdminQueueIntegrityIssue = OperationalQueueIntegrityIssue & {
  orderId: string;
  customerName: string;
};

type OptimisticOrdersSnapshot = {
  orders: Order[];
  abandonedOrders: Order[];
  selectedAbandonedOrderIds: Set<string>;
  expanded: string | null;
  recoveryDrafts: Record<string, RecoveryEmailDraft>;
};

type AdminApiPayload = {
  error?: string;
  code?: string;
  payment_captured?: boolean;
  payment_status?: string;
  retryable?: boolean;
  reauthorization_required?: boolean;
  order?: Order;
  awaiting_verification?: Order[];
  founder_review?: Order[];
  ready_to_order?: Order[];
  resolve_exception?: Order[];
  archive?: Order[];
  abandoned?: Order[];
  draft?: RecoveryEmailDraft;
  warnings?: string[];
  event_logged?: boolean;
  integrity_issues?: AdminQueueIntegrityIssue[];
};

const FULFILLMENT_PROGRESS_FLOW: FulfillmentStatus[] = [
  "review",
  "ordered",
];

const HIGHLIGHT_MS = 120_000;

const CAPTURE_ADJUSTMENT_REASONS: CaptureAdjustmentReason[] = [
  "Quantity correction",
  "Prescription correction",
  "Shipping adjustment",
  "Inventory adjustment",
  "Customer service accommodation",
  "Other",
];

const ORDER_QUANTITY_ADJUSTMENT_REASONS: OrderQuantityAdjustmentReason[] = [
  "Quantity correction",
  "Customer requested change",
  "Prescription correction",
  "Inventory adjustment",
  "Other",
];

function isCaptureAdjustmentReason(
  value: unknown,
): value is CaptureAdjustmentReason {
  return CAPTURE_ADJUSTMENT_REASONS.includes(
    value as CaptureAdjustmentReason,
  );
}

function isOrderQuantityAdjustmentReason(
  value: unknown,
): value is OrderQuantityAdjustmentReason {
  return ORDER_QUANTITY_ADJUSTMENT_REASONS.includes(
    value as OrderQuantityAdjustmentReason,
  );
}

/* =========================
   Helpers
========================= */

function formatMoney(cents?: number | null): string {
  if (typeof cents !== "number") return "-";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatSignedMoney(cents?: number | null): string {
  if (typeof cents !== "number") return "-";
  if (cents === 0) return "$0.00";

  const prefix = cents < 0 ? "-" : "+";
  return `${prefix}${formatMoney(Math.abs(cents))}`;
}

function finiteCount(value?: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatBoxCount(count: number): string {
  return `${count} ${count === 1 ? "box" : "boxes"}`;
}

function formatSubmittedOrderQuantity(order: Order): string {
  const right = finiteCount(order.right_box_count ?? order.od_box_count);
  const left = finiteCount(order.left_box_count ?? order.os_box_count);
  const sideTotal =
    right !== null && left !== null
      ? right + left
      : right !== null
        ? right
        : left;
  const storedTotal = finiteCount(order.total_box_count ?? order.box_count);
  const total = storedTotal ?? sideTotal;

  if (total === null) return "Quantity pending";

  const sideLabel =
    right !== null || left !== null
      ? `OD ${right ?? "-"} / OS ${left ?? "-"}`
      : null;

  if (sideLabel && sideTotal !== null && storedTotal !== null && sideTotal !== storedTotal) {
    return `${formatBoxCount(storedTotal)} (${sideLabel}; count conflict)`;
  }

  return sideLabel
    ? `${formatBoxCount(total)} (${sideLabel})`
    : formatBoxCount(total);
}

function hasAdjustedOrderQuantity(order: Order): boolean {
  return (
    finiteCount(order.adjusted_right_box_count) !== null &&
    finiteCount(order.adjusted_left_box_count) !== null &&
    finiteCount(order.adjusted_total_box_count) !== null
  );
}

function formatAdjustedOrderQuantity(order: Order): string {
  const right = finiteCount(order.adjusted_right_box_count);
  const left = finiteCount(order.adjusted_left_box_count);
  const total = finiteCount(order.adjusted_total_box_count);

  if (right === null || left === null || total === null) {
    return "Corrected quantity pending";
  }

  const expectedTotal = right + left;
  const sideLabel = `OD ${right} / OS ${left}`;

  if (expectedTotal !== total) {
    return `${formatBoxCount(total)} (${sideLabel}; count conflict)`;
  }

  return `${formatBoxCount(total)} (${sideLabel})`;
}

function formatOrderQuantitySummary(order: Order): string {
  if (!hasAdjustedOrderQuantity(order)) return formatSubmittedOrderQuantity(order);

  return `Corrected quantity: ${formatAdjustedOrderQuantity(
    order,
  )} | Submitted quantity: ${formatSubmittedOrderQuantity(order)}`;
}

function getOperationalCardQuantity(order: Order): {
  total: string;
  right: string;
  left: string;
} {
  if (hasAdjustedOrderQuantity(order)) {
    return {
      total: String(order.adjusted_total_box_count),
      right: String(order.adjusted_right_box_count),
      left: String(order.adjusted_left_box_count),
    };
  }

  const right = finiteCount(order.right_box_count ?? order.od_box_count);
  const left = finiteCount(order.left_box_count ?? order.os_box_count);
  const storedTotal = finiteCount(order.total_box_count ?? order.box_count);
  const total = storedTotal ??
    (right !== null || left !== null ? (right ?? 0) + (left ?? 0) : null);

  return {
    total: total === null ? "—" : String(total),
    right: right === null ? "—" : String(right),
    left: left === null ? "—" : String(left),
  };
}

function parseBoxCountInput(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const count = Number(trimmed);
  return Number.isSafeInteger(count) ? count : null;
}

function correctionEyeForm(eye: RxEye | null | undefined): LensCorrectionEyeForm {
  const text = (value: RxValue) =>
    value === null || value === undefined ? "" : String(value);
  return {
    sphere: text(eye?.sphere ?? eye?.sph),
    cylinder: text(eye?.cylinder ?? eye?.cyl),
    axis: text(eye?.axis ?? eye?.ax),
    add: text(eye?.add),
    base_curve: text(eye?.base_curve ?? eye?.baseCurve ?? eye?.bc),
    diameter: text(eye?.diameter ?? eye?.dia),
  };
}

function displayNameFromLensIdentifier(
  identifier?: string | null,
  sku?: string | null,
): string | null {
  const value = identifier?.trim();
  if (!value) return null;

  const skuForPack = /_\d+$/.test(value) ? value : (sku ?? null);
  const coreId = value.replace(/_\d+$/, "");
  const candidates = [coreId, value];

  for (const candidate of candidates) {
    const displayName = getLensDisplayName(candidate, skuForPack);
    if (displayName !== "Unknown Lens") return displayName;
  }

  return null;
}

function formatLensIdentifier(
  identifier?: string | null,
  sku?: string | null,
): string | null {
  const value = identifier?.trim();
  if (!value) return null;
  return displayNameFromLensIdentifier(value, sku) ?? value;
}

function formatMoneyInput(cents?: number | null): string {
  return typeof cents === "number" ? (cents / 100).toFixed(2) : "";
}

function parseDollarAmountToCents(value: string): number | null {
  const normalized = value.trim().replace(/^\$/, "");

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;

  const [dollars, cents = ""] = normalized.split(".");
  const dollarsCents = Number(dollars) * 100;
  const fractionalCents = Number(cents.padEnd(2, "0"));
  const totalCents = dollarsCents + fractionalCents;

  return Number.isSafeInteger(totalCents) ? totalCents : null;
}

function effectiveCaptureAmountCents(order: Order): number | undefined {
  if (typeof order.capture_amount_cents === "number") {
    return order.capture_amount_cents;
  }

  return typeof order.total_amount_cents === "number"
    ? order.total_amount_cents
    : undefined;
}

function formatOrderCreatedDate(order: Order): {
  date: string;
  time: string;
} {
  return formatAdminDateTimeParts(order.created_at);
}

function getTimestamp(value?: string | null): number {
  return Date.parse(value ?? "") || 0;
}

function getOrderCreatedTimestamp(order: Order): number {
  return getTimestamp(order.created_at);
}

function getLastOperationalActivityTimestamp(order: Order): number {
  return (
    getTimestamp(order.lastOperationalActivityAt) ||
    getOrderCreatedTimestamp(order)
  );
}

function getOperationalSortTimestamp(order: Order): number {
  return getLastOperationalActivityTimestamp(order);
}

function formatOrderActivitySummary(order: Order): {
  date: string;
  detail: string;
} {
  const activityAt = getLastOperationalActivityTimestamp(order);
  return formatAdminActivity(
    activityAt ? new Date(activityAt).toISOString() : null,
  );
}

function formatAge(hours?: number | null): string {
  if (typeof hours !== "number") return "-";
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "unknown";
  const absoluteMs = Math.abs(ms);
  const totalMinutes = Math.max(1, Math.ceil(absoluteMs / 60_000));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const totalHours = Math.ceil(totalMinutes / 60);
  if (totalHours < 48) return `${totalHours}h`;
  return `${Math.ceil(totalHours / 24)}d`;
}

function authorizationRisk(order: Order, now = new Date()): AuthorizationRisk {
  return getAuthorizationRisk(
    {
      stripePaymentIntentStatus: order.stripe_payment_intent_status,
      authorizedAt: order.stripe_authorized_at,
      captureBefore: order.stripe_capture_before,
    },
    now,
  );
}

function compactName(
  ...parts: Array<string | null | undefined>
): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedName(value?: string | null): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function namesDiffer(a?: string | null, b?: string | null): boolean {
  const left = normalizedName(a);
  const right = normalizedName(b);
  return Boolean(left && right && left !== right);
}

function getPatientName(order: Order): string {
  return (
    order.patient_name?.trim() ||
    order.patient_full_name?.trim() ||
    order.rx_patient_name?.trim() ||
    compactName(
      order.patient_first_name,
      order.patient_middle_name,
      order.patient_last_name,
    )
  );
}

function getShippingName(order: Order): string {
  return compactName(order.shipping_first_name, order.shipping_last_name);
}

function getShippingEmail(order: Order): string {
  return order.shipping_email?.trim() ?? "";
}

function getCustomerName(order: Order): string {
  const knownName =
    getShippingName(order) || getPatientName(order) || getShippingEmail(order);
  if (knownName) return knownName;

  if (order.status === "draft" && !order.payment_intent_id) {
    return "Awaiting customer info";
  }

  return "Unknown customer";
}

function orderSupportsAdminNotes(order: Order): boolean {
  return Object.prototype.hasOwnProperty.call(order, "admin_notes");
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

function normalizedFulfillmentStatus(order: Order): FulfillmentStatus {
  return getAdminFulfillmentStatus(order);
}

function normalizedPaymentStatus(order: Order): PaymentStatus {
  return getPaymentState(order).status;
}

function compareOperationalPriority(a: Order, b: Order): number {
  const aRisk = authorizationRisk(a);
  const bRisk = authorizationRisk(b);
  const riskDifference =
    authorizationRiskPriority(aRisk.level) -
    authorizationRiskPriority(bRisk.level);
  if (riskDifference !== 0) return riskDifference;

  if (aRisk.remainingMs !== null && bRisk.remainingMs !== null) {
    const deadlineDifference = aRisk.remainingMs - bRisk.remainingMs;
    if (deadlineDifference !== 0) return deadlineDifference;
  }

  return getOperationalSortTimestamp(b) - getOperationalSortTimestamp(a);
}

function normalizedRxStatus(order: Order): string {
  return order.rx_status ?? (order.rx_upload_path ? "file_available" : "none");
}

function displayRxStatus(order: Order): string {
  const source = getRxSourceState(order);

  if (source.hasUpload) return "Rx File Available";
  if (source.status === "manual_entry") return "Manual Prescription Entered";
  if (source.status === "doctor_verification") {
    return "Prescription Verification Requested";
  }
  const rxStatus = normalizedRxStatus(order);
  if (
    source.hasRxEvidence ||
    (rxStatus !== "none" && rxStatus !== "uploaded")
  ) {
    return "Prescription Information Available";
  }

  return "Prescription Information Missing";
}

function paymentTone(status: PaymentStatus): BadgeTone {
  const tones: Record<PaymentStatus, BadgeTone> = {
    draft: "info",
    authorized: "warning",
    captured: "capture",
    refunded: "refund",
    cancelled: "blocked",
    failed: "blocked",
  };

  return tones[status];
}

function paymentStatus(order: Order): { label: string; tone: BadgeTone } {
  const payment = getPaymentState(order);

  return { label: payment.label, tone: paymentTone(payment.status) };
}

function verificationSummary(order: Order): { label: string; tone: BadgeTone } {
  const verification = getVerificationState(order);
  const tone = verification.blocked
    ? "blocked"
    : verification.severity === "success"
      ? "good"
      : verification.severity;

  return { label: verification.label, tone };
}

function fulfillmentTone(status: FulfillmentStatus): BadgeTone {
  if (status === "ordered") return "good";
  if (status === "hold") return "warning";
  if (status === "cancelled") return "blocked";
  return "neutral";
}


function getOrderStatusFlags(order: Order): OrderStatusFlag[] {
  return getAdminExceptionBadges(order);
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
  if (current === "review" && next === "ordered") {
    return "Record manufacturer/distributor order placed";
  }
  return `Advance to ${labelizeStatus(next)}`;
}

function canPermanentlyDelete(order: Order): boolean {
  return Boolean(
    order.abandoned_checkout?.isAbandoned &&
      order.status === "draft" &&
      !order.payment_intent_id,
  );
}

function getOrderOperationalClassification(
  order: Order,
): OperationalQueueClassification {
  return order.operational_queue;
}

function getOrderOperationalBucket(order: Order): OperationalQueueBucket {
  return getOrderOperationalClassification(order).bucket;
}

function shouldDefaultCollapse(order: Order): boolean {
  return !isMerchantQueueBucket(getOrderOperationalBucket(order));
}

function archiveOrderStatus(order: Order): { label: string; tone: BadgeTone } {
  if (order.abandoned_checkout?.isAbandoned) {
    return { label: "ABANDONED", tone: "warning" };
  }

  const payment = normalizedPaymentStatus(order);
  const fulfillment = normalizedFulfillmentStatus(order);
  const rawFulfillment = order.fulfillment_status?.trim().toLowerCase();

  if (payment === "failed") return { label: "PAYMENT FAILED", tone: "blocked" };
  if (payment === "refunded") return { label: "REFUNDED", tone: "refund" };
  if (payment === "cancelled") return { label: "PAYMENT CANCELLED", tone: "blocked" };
  if (rawFulfillment === "backordered") {
    return { label: "BACKORDERED — ARMORY", tone: "warning" };
  }
  if (rawFulfillment === "delivered") {
    return { label: "DELIVERED", tone: "good" };
  }
  if (fulfillment === "cancelled") return { label: "CANCELLED", tone: "blocked" };
  return { label: labelizeStatus(fulfillment), tone: fulfillmentTone(fulfillment) };
}

function archiveSort(a: Order, b: Order): number {
  return getOrderCreatedTimestamp(b) - getOrderCreatedTimestamp(a);
}

function mergeOrderLists(
  current: Order[],
  restored: Order[],
  sort: (a: Order, b: Order) => number,
): Order[] {
  if (restored.length === 0) return current;

  const byId = new Map(current.map((order) => [order.id, order]));
  restored.forEach((order) => byId.set(order.id, order));
  return [...byId.values()].sort(sort);
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

function compactBadgeStyle(tone: BadgeTone): CSSProperties {
  return {
    ...badgeStyle(tone),
    borderRadius: 5,
    fontSize: 10,
    fontWeight: 900,
    padding: "3px 5px",
    minHeight: 18,
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

function getEyeLensDisplayName(
  order: Order,
  eye: RxEye | null | undefined,
  details = fullRxDetails(order),
): string {
  return (
    displayNameFromLensIdentifier(eye?.coreId, order.sku ?? null) ??
    formatLensIdentifier(eye?.brand, order.sku ?? null) ??
    formatLensIdentifier(eye?.brand_raw, order.sku ?? null) ??
    formatLensIdentifier(details.brand, order.sku ?? null) ??
    formatLensIdentifier(order.rx_lens_brand, order.sku ?? null) ??
    formatLensIdentifier(order.sku, order.sku ?? null) ??
    "Lens pending"
  );
}

function getOrderLensDisplayName(order: Order): string {
  const details = fullRxDetails(order);
  const rightCoreId = details.rx?.right?.coreId ?? null;
  const leftCoreId = details.rx?.left?.coreId ?? null;

  if (rightCoreId && leftCoreId && rightCoreId !== leftCoreId) {
    const rightName = getEyeLensDisplayName(order, details.rx?.right, details);
    const leftName = getEyeLensDisplayName(order, details.rx?.left, details);
    return `OD ${rightName} / OS ${leftName}`;
  }

  const coreId = rightCoreId ?? leftCoreId;
  if (coreId) {
    const displayName = displayNameFromLensIdentifier(coreId, order.sku ?? null);
    if (displayName) return displayName;
  }

  return (
    formatLensIdentifier(details.brand, order.sku ?? null) ??
    formatLensIdentifier(order.rx_lens_brand, order.sku ?? null) ??
    formatLensIdentifier(order.sku, order.sku ?? null) ??
    "Lens pending"
  );
}

async function copyToClipboard(value?: string | null): Promise<boolean> {
  const text = value?.trim();
  if (!text || !navigator.clipboard) return false;

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
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
function parseRx(order: Order): {
  od: string;
  os: string;
  exp: string | null;
} {
  try {
    const details = fullRxDetails(order);
    const rx = details.rx;

    const od = rx?.right;
    const os = rx?.left;

    const formatEye = (eye?: RxEye | null) => {
      if (!eye) return "-";
      const parts = [
        getEyeLensDisplayName(order, eye, details),
        `SPH ${formatRxNumber(eye.sphere ?? eye.sph, 2)}`,
      ];
      if (hasValue(eye.cylinder))
        parts.push(`CYL ${formatRxNumber(eye.cylinder, 2)}`);
      if (hasValue(eye.cyl)) parts.push(`CYL ${formatRxNumber(eye.cyl, 2)}`);
      if (hasValue(eye.axis)) parts.push(`AX ${eye.axis}`);
      if (hasValue(eye.ax)) parts.push(`AX ${eye.ax}`);
      if (hasValue(eye.add)) parts.push(`ADD ${formatRxNumber(eye.add, 2)}`);
      if (hasValue(eye.base_curve))
        parts.push(`BC ${formatRxNumber(eye.base_curve, 1)}`);
      if (hasValue(eye.baseCurve))
        parts.push(`BC ${formatRxNumber(eye.baseCurve, 1)}`);
      if (hasValue(eye.bc))
        parts.push(`BC ${formatRxNumber(eye.bc, 1)}`);
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

function RxDetailsPanel({
  order,
  heading = "Full Rx",
}: {
  order: Order;
  heading?: string;
}) {
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
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{heading}</div>

      {details.hasStructured ? (
        <>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr>
                <th style={cellStyle}>Eye</th>
                <th style={cellStyle}>Lens</th>
                <th style={cellStyle}>Sphere</th>
                <th style={cellStyle}>Cyl</th>
                <th style={cellStyle}>Axis</th>
                <th style={cellStyle}>Add</th>
                <th style={cellStyle}>BC</th>
                <th style={cellStyle}>DIA</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ label, eye }) => (
                <tr key={label}>
                  <td style={cellStyle}>{label}</td>
                  <td style={cellStyle}>
                    {getEyeLensDisplayName(order, eye, details)}
                  </td>
                  <td style={cellStyle}>
                    {eyeValue(eye, ["sphere", "sph"], "power")}
                  </td>
                  <td style={cellStyle}>
                    {eyeValue(eye, ["cylinder", "cyl"], "power")}
                  </td>
                  <td style={cellStyle}>{eyeValue(eye, ["axis", "ax"])}</td>
                  <td style={cellStyle}>{eyeValue(eye, ["add"], "power")}</td>
                  <td style={cellStyle}>
                    {eyeValueWithRootFallback(
                      eye,
                      ["base_curve", "baseCurve", "bc"],
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
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 8 }}>
            Expiration date: {valueText(details.expires)}
          </div>
          <div>Lens: {getOrderLensDisplayName(order)}</div>
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
  label,
  children,
  style,
}: {
  value?: string | null;
  label?: string;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const text = value?.trim();

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!text) return null;

  return (
    <button
      type="button"
      className="admin-copyable-value"
      data-copied={copied ? "true" : "false"}
      title={`Copy ${label ?? text}`}
      aria-label={`Copy ${label ?? text}`}
      onClick={async (e) => {
        e.stopPropagation();
        const copiedSuccessfully = await copyToClipboard(text);
        if (!copiedSuccessfully) return;
        setCopied(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCopied(false), 1000);
      }}
      style={style}
    >
      <span className="admin-copyable-value__text">{children ?? text}</span>
      <span
        className="admin-copyable-value__indicator"
        aria-live="polite"
      >
        {copied ? (
          <span className="admin-copyable-value__feedback">Copied</span>
        ) : (
          <svg
            className="admin-copyable-value__icon"
            aria-hidden="true"
            viewBox="0 0 16 16"
            fill="none"
          >
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
            <path d="M10.5 5.5V3A1.5 1.5 0 0 0 9 1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h2.5" />
          </svg>
        )}
      </span>
    </button>
  );
}


function VerificationAttemptRow({
  label,
  timestamp,
  method,
  contactAvailable = true,
  saving,
  onRecord,
}: {
  label: string;
  timestamp?: string | null;
  method?: ManualVerificationAttemptMethod;
  contactAvailable?: boolean;
  saving: boolean;
  onRecord?: (method: ManualVerificationAttemptMethod) => void;
}) {
  const complete = Boolean(timestamp);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "18px minmax(0, 1fr) auto",
        gap: 6,
        alignItems: "center",
        minHeight: 32,
        fontSize: 12,
      }}
    >
      <span
        aria-hidden="true"
        style={{ color: complete ? "#86efac" : "rgba(226,232,240,0.55)" }}
      >
        {complete ? "✓" : "□"}
      </span>
      <span style={{ fontWeight: 700 }}>{label}</span>
      {method && onRecord ? (
        <button
          type="button"
          disabled={saving || !contactAvailable}
          onClick={() => onRecord(method)}
          title={
            contactAvailable
              ? `Record ${method} attempt now`
              : `No prescriber ${method} available`
          }
          style={buttonStyle({
            padding: "3px 7px",
            fontSize: 11,
            opacity: contactAvailable ? 1 : 0.45,
          })}
        >
          {saving ? "Saving..." : complete ? "Log again" : "Log now"}
        </button>
      ) : (
        <span />
      )}
      <span
        style={{
          gridColumn: "2 / -1",
          opacity: timestamp ? 0.8 : 0.52,
          fontSize: 11,
        }}
      >
        {timestamp ? formatAdminDateTime(timestamp) : "Not attempted"}
      </span>
    </div>
  );
}

function PrescriberVerificationTracker({
  order,
  savingAttempt,
  onRecordAttempt,
}: {
  order: Order;
  savingAttempt: string | null;
  onRecordAttempt: (method: ManualVerificationAttemptMethod) => void;
}) {
  return (
    <div style={mutedPanelStyle()}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "3px 10px",
          fontSize: 12,
        }}
      >
        <div>Name: {order.prescriber_name ?? "-"}</div>
        <div>Phone: {order.prescriber_phone ?? "-"}</div>
        <div>Fax: {order.prescriber_fax ?? "-"}</div>
        <div>Email: {order.prescriber_email ?? "-"}</div>
      </div>

      <div
        style={{
          borderTop: "1px solid rgba(148,163,184,0.2)",
          marginTop: 6,
          paddingTop: 5,
          display: "grid",
          gridTemplateColumns:
            "minmax(125px, 0.65fr) repeat(3, minmax(0, 1fr))",
          gap: 8,
          alignItems: "center",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 12 }}>
          Verification Attempts
        </div>
        <VerificationAttemptRow
          label="Verification email sent"
          timestamp={order.verification_sent_at}
          saving={false}
        />
        <VerificationAttemptRow
          label="Phone attempted"
          timestamp={order.verification_phone_attempted_at}
          method="phone"
          contactAvailable={Boolean(order.prescriber_phone?.trim())}
          saving={savingAttempt === `${order.id}:phone`}
          onRecord={onRecordAttempt}
        />
        <VerificationAttemptRow
          label="Fax attempted"
          timestamp={order.verification_fax_attempted_at}
          method="fax"
          contactAvailable={Boolean(order.prescriber_fax?.trim())}
          saving={savingAttempt === `${order.id}:fax`}
          onRecord={onRecordAttempt}
        />
      </div>
    </div>
  );
}

function AuthorizationReviewBanner({ order }: { order: Order }) {
  const risk = authorizationRisk(order);
  const automationReason = order.rx_status?.startsWith("automation_review_")
    ? order.rx_status
        .slice("automation_review_".length)
        .replaceAll("_", " ")
    : null;
  const urgent =
    risk.level === "urgent" || risk.level === "expired";
  const warning = urgent || risk.level === "warning";
  const ageLabel =
    risk.ageMs === null ? "unknown" : formatDuration(risk.ageMs);
  const deadlineLabel =
    risk.captureBefore === null
      ? "Stripe did not provide a capture deadline"
      : risk.level === "expired"
        ? `Stripe deadline passed ${formatDuration(risk.remainingMs)} ago`
        : `${formatDuration(risk.remainingMs)} remaining · ${formatAdminDateTime(
            risk.captureBefore,
          )}`;

  return (
    <div
      data-testid="authorized-rx-review-banner"
      role={warning ? "alert" : "status"}
      style={{
        border: `1px solid ${urgent ? "rgba(248,113,113,0.75)" : warning ? "rgba(251,191,36,0.68)" : "rgba(56,189,248,0.56)"}`,
        borderRadius: 7,
        background: urgent
          ? "rgba(127,29,29,0.3)"
          : warning
            ? "rgba(120,53,15,0.25)"
            : "rgba(12,74,110,0.24)",
        color: urgent ? "#fecaca" : warning ? "#fde68a" : "#bae6fd",
        padding: "8px 10px",
        marginBottom: 9,
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <strong style={{ fontSize: 12, letterSpacing: "0.02em" }}>
        AUTHORIZED — RX REVIEW REQUIRED
      </strong>
      <span style={{ fontSize: 11, fontWeight: warning ? 850 : 700 }}>
        {automationReason ? `Exception: ${automationReason} · ` : ""}
        Authorized {ageLabel} ago · {deadlineLabel}
      </span>
    </div>
  );
}

function TotalBoxesStrip({
  quantity,
  isExpress,
}: {
  quantity: ReturnType<typeof getOperationalCardQuantity>;
  isExpress: boolean;
}) {
  const totalBoxesLabel =
    quantity.total === "—" ? "—" : formatBoxCount(Number(quantity.total));

  return (
    <div
      data-testid="operational-quantity"
      style={{
        display: "flex",
        alignItems: "baseline",
        flexWrap: "wrap",
        gap: "5px 13px",
        padding: "7px 9px",
        borderRadius: 6,
        background: isExpress ? "#dc2626" : "rgba(14, 165, 233, 0.12)",
        color: isExpress ? "#ffffff" : "#e0f2fe",
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 800, opacity: 0.82 }}>
        TOTAL BOXES
      </span>
      <strong style={{ fontSize: 15 }}>{totalBoxesLabel}</strong>
      <span style={{ fontSize: 12, fontWeight: 800 }}>OD: {quantity.right}</span>
      <span style={{ fontSize: 12, fontWeight: 800 }}>OS: {quantity.left}</span>
      {isExpress && (
        <strong
          style={{
            marginLeft: "auto",
            fontSize: 13,
            letterSpacing: "0.08em",
          }}
        >
          EXPRESS
        </strong>
      )}
    </div>
  );
}



function ActiveOrderCard({
  order,
  isOpen,
  isHighlighted,
  savingOrderId,
  savingVerificationAttempt,
  onToggleProcess,
  onOpenDetails,
  onOpenRxImage,
  onRecordVerificationAttempt,
  onAdvanceFulfillment,
  onVerifyPrescription,
  onFounderCompleteArchive,
  verificationFailure,
}: {
  order: Order;
  isOpen: boolean;
  isHighlighted: boolean;
  savingOrderId: string | null;
  savingVerificationAttempt: string | null;
  onToggleProcess: () => void;
  onOpenDetails: () => void;
  onOpenRxImage: () => void;
  onRecordVerificationAttempt: (
    method: ManualVerificationAttemptMethod,
  ) => void;
  onAdvanceFulfillment: (status: FulfillmentStatus) => void;
  onVerifyPrescription: () => void;
  onFounderCompleteArchive: () => void;
  verificationFailure?: string | null;
}) {
  const customerName = getCustomerName(order);
  const lensDisplay = getOrderLensDisplayName(order);
  const activity = formatOrderActivitySummary(order);
  const verification = getVerificationState(order);
  const fulfillment = normalizedFulfillmentStatus(order);
  const nextFulfillment = nextFulfillmentStatus(fulfillment);
  const previousFulfillment = previousFulfillmentStatus(fulfillment);
  const nextAction = getNextAction(order);
  const classification = getOrderOperationalClassification(order);
  const quantity = getOperationalCardQuantity(order);
  const isFounderReview = classification.bucket === "founder_review";
  const isExpress = order.shipping_method === "express";
  const processingPanelId = `order-processing-${order.id}`;

  return (
    <article
      data-active-order-card
      data-testid="admin-queue-card"
      data-order-id={order.id}
      onClick={(event) => {
        if (isOpen || isOrderRowControlTarget(event.target)) return;
        onToggleProcess();
      }}
      style={{
        border: isHighlighted
          ? "1px solid rgba(186,230,253,0.95)"
          : "1px solid rgba(148,163,184,0.2)",
        borderRadius: 9,
        padding: "9px 11px",
        background: isOpen ? "rgba(30,41,59,0.55)" : "transparent",
        boxShadow: isHighlighted
          ? "0 0 0 1px rgba(186,230,253,0.18)"
          : "none",
        cursor: isOpen ? "default" : "pointer",
      }}
    >
      {isFounderReview && <AuthorizationReviewBanner order={order} />}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(150px, 1.1fr) minmax(180px, 1.35fr) minmax(90px, 0.62fr) minmax(110px, 0.7fr) auto",
          gap: 10,
          alignItems: "center",
          fontSize: 12,
        }}
      >
        <button
          type="button"
          data-testid="admin-queue-row-toggle"
          className="admin-order-row-trigger"
          onClick={onToggleProcess}
          aria-expanded={isOpen}
          aria-controls={processingPanelId}
          aria-label={`${isOpen ? "Collapse" : "Expand"} processing for ${customerName}`}
          style={{
            gridColumn: "1 / 5",
            display: "grid",
            gridTemplateColumns:
              "minmax(150px, 1.1fr) minmax(180px, 1.35fr) minmax(90px, 0.62fr) minmax(110px, 0.7fr)",
            gap: 10,
            alignItems: "center",
            width: "100%",
            minWidth: 0,
            padding: 0,
            border: "none",
            borderRadius: 6,
            background: "transparent",
            color: "inherit",
            font: "inherit",
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <div>
            <div style={{ opacity: 0.56, fontSize: 10 }}>Customer</div>
            <div style={{ fontWeight: 850, fontSize: 13 }}>{customerName}</div>
          </div>

          <div>
            <div style={{ opacity: 0.56, fontSize: 10 }}>Product</div>
            <div style={{ fontWeight: 850, fontSize: 13 }}>{lensDisplay}</div>
          </div>

          <div>
            <div style={{ opacity: 0.56, fontSize: 10 }}>Amount</div>
            <div style={{ fontWeight: 850, fontSize: 13 }}>
              {formatMoney(order.total_amount_cents)}
            </div>
          </div>

          <div>
            <div style={{ opacity: 0.56, fontSize: 10 }}>Activity</div>
            <div style={{ fontWeight: 800 }}>{activity.date}</div>
            <div style={{ opacity: 0.68, fontSize: 10 }}>{activity.detail}</div>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <TotalBoxesStrip quantity={quantity} isExpress={isExpress} />
          </div>

          {classification.bucket === "resolve_exception" && (
            <div
              data-testid="attention-reason"
              style={{
                gridColumn: "1 / -1",
                color: "#fde68a",
                fontSize: 10,
                lineHeight: 1.25,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={classification.reasons.join("; ")}
            >
              Issue: {classification.reasons[0]}
            </div>
          )}
        </button>

        <div
          style={{
            display: "flex",
            gap: 6,
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onOpenDetails}
            style={buttonStyle({ fontSize: 11, opacity: 0.8 })}
          >
            Details
          </button>
          <button
            type="button"
            onClick={onFounderCompleteArchive}
            style={buttonStyle({ fontSize: 11, color: "#fbbf24" })}
          >
            Mark completed / archive
          </button>
        </div>
      </div>

      {isOpen && (
        <div
          id={processingPanelId}
          style={{
            borderTop: "1px solid rgba(148,163,184,0.18)",
            marginTop: 8,
            paddingTop: 8,
            display: "grid",
            gridTemplateColumns: "minmax(460px, 1.35fr) minmax(240px, 0.65fr)",
            gap: 10,
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <CustomerInformationBlock order={order} />

            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 6,
                fontSize: 12,
              }}
            >
              <strong>Verification: {verification.label}</strong>
              {order.rx_upload_path && (
                <button
                  type="button"
                  onClick={onOpenRxImage}
                  style={buttonStyle({ fontSize: 11 })}
                >
                  View Rx Image
                </button>
              )}
            </div>

            <RxDetailsPanel order={order} heading="Prescription" />

            <TotalBoxesStrip quantity={quantity} isExpress={isExpress} />

            <PrescriberVerificationTracker
              order={order}
              savingAttempt={savingVerificationAttempt}
              onRecordAttempt={onRecordVerificationAttempt}
            />
          </div>

          <div
            style={{
              ...mutedPanelStyle(),
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 12,
            }}
            >
              <div>
                <div style={{ opacity: 0.58, fontSize: 10 }}>NEXT ACTION</div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 15,
                  fontWeight: 900,
                  color: "#bae6fd",
                }}
                >
                  {nextAction.label}
                </div>
                {classification.reasons.length > 0 && (
                  <div
                    style={{
                      marginTop: 6,
                      color: "#fde68a",
                      fontSize: 11,
                      lineHeight: 1.35,
                    }}
                  >
                    Reason: {classification.reasons.join("; ")}
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gap: 7 }}>
                {isFounderReview && (
                  <button
                    type="button"
                    disabled={savingOrderId === order.id}
                    onClick={onVerifyPrescription}
                    style={buttonStyle({
                      width: "100%",
                      padding: "10px 11px",
                      fontSize: 13,
                      fontWeight: 900,
                      background: "rgba(20,184,166,0.34)",
                      border: "1px solid rgba(94,234,212,0.72)",
                    })}
                  >
                    {savingOrderId === order.id
                      ? "Verifying and capturing..."
                      : "Verify prescription & capture payment"}
                  </button>
                )}

                {verificationFailure && (
                  <div
                    role="alert"
                    data-testid="verification-capture-failure"
                    style={{
                      border: "1px solid rgba(248,113,113,0.72)",
                      borderRadius: 6,
                      background: "rgba(127,29,29,0.32)",
                      color: "#fecaca",
                      padding: "8px 9px",
                      fontSize: 11,
                      fontWeight: 800,
                      lineHeight: 1.4,
                    }}
                  >
                    CAPTURE/VERIFICATION NOT COMPLETE: {verificationFailure}
                  </div>
                )}

                {!isFounderReview && nextFulfillment && (
                  <button
                    type="button"
                    disabled={savingOrderId === order.id}
                    onClick={() => onAdvanceFulfillment(nextFulfillment)}
                    style={buttonStyle({
                      width: "100%",
                      padding: "9px 10px",
                      fontSize: 12,
                      fontWeight: 850,
                      background: "rgba(20,184,166,0.28)",
                    })}
                  >
                    {workflowActionLabel(fulfillment, nextFulfillment)}
                  </button>
                )}

                {previousFulfillment && (
                  <button
                    type="button"
                    disabled={savingOrderId === order.id}
                    onClick={() => onAdvanceFulfillment(previousFulfillment)}
                    style={buttonStyle({ width: "100%", fontSize: 11 })}
                  >
                    Undo to {labelizeStatus(previousFulfillment)}
                  </button>
                )}

                {(fulfillment === "hold" || fulfillment === "cancelled") && (
                  <button
                    type="button"
                    disabled={savingOrderId === order.id}
                    onClick={() => onAdvanceFulfillment("review")}
                    style={buttonStyle({
                      width: "100%",
                      fontSize: 11,
                      background: "rgba(20,184,166,0.2)",
                    })}
                  >
                    Return to Review
                  </button>
                )}

                <label style={{ display: "grid", gap: 4, fontSize: 10 }}>
                  <span style={{ opacity: 0.62 }}>Administrative action</span>
                  <select
                    aria-label="Administrative action"
                    value=""
                    disabled={savingOrderId === order.id}
                    onChange={(event) => {
                      const status = event.target.value;
                      if (status === "hold" || status === "cancelled") {
                        onAdvanceFulfillment(status);
                      }
                    }}
                    style={{ padding: "6px 7px", borderRadius: 4 }}
                  >
                    <option value="">Choose rare action...</option>
                    {fulfillment !== "hold" && (
                      <option value="hold">Place on hold</option>
                    )}
                    {fulfillment !== "cancelled" && (
                      <option value="cancelled">Cancel order</option>
                    )}
                  </select>
                </label>

                {savingOrderId === order.id && (
                  <span style={{ fontSize: 11, opacity: 0.72 }}>Saving...</span>
                )}
              </div>
            </div>
        </div>
      )}
    </article>
  );
}

function CopyableCustomerValue({
  label,
  value,
  style,
}: {
  label: string;
  value?: string | null;
  style?: CSSProperties;
}) {
  if (!value?.trim()) return null;

  return (
    <CopyableValue
      value={value}
      label={label}
      style={{ maxWidth: "100%", overflowWrap: "anywhere", ...style }}
    />
  );
}

function CustomerInformationBlock({
  order,
  heading = "Customer information",
  patientName,
}: {
  order: Order;
  heading?: string;
  patientName?: string | null;
}) {
  const firstName = order.shipping_first_name?.trim();
  const lastName = order.shipping_last_name?.trim();
  const street = order.shipping_address1?.trim();
  const apartment = order.shipping_address2?.trim();
  const city = order.shipping_city?.trim();
  const state = order.shipping_state?.trim();
  const zip = order.shipping_zip?.trim();
  const phone = order.shipping_phone?.trim();
  const email = order.shipping_email?.trim();
  const hasLocality = Boolean(city || state || zip);

  return (
    <div style={mutedPanelStyle()}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{heading}</div>
      {patientName && (
        <div style={{ marginBottom: 8, fontSize: 12 }}>Patient: {patientName}</div>
      )}
      <address
        style={{
          fontStyle: "normal",
          fontSize: 12,
          lineHeight: 1.55,
        }}
      >
        {(firstName || lastName) && (
          <div data-customer-line="name" style={{ fontWeight: 750 }}>
            <CopyableCustomerValue label="First name" value={firstName} />
            {firstName && lastName ? " " : null}
            <CopyableCustomerValue label="Last name" value={lastName} />
          </div>
        )}

        {(street || apartment || hasLocality) && (
          <div data-customer-line="address" style={{ marginTop: 8 }}>
            {street && (
              <div>
                <CopyableCustomerValue label="Street address" value={street} />
              </div>
            )}
            {apartment && (
              <div>
                <CopyableCustomerValue label="Apt / Suite" value={apartment} />
              </div>
            )}
            {hasLocality && (
              <div>
                <CopyableCustomerValue label="City" value={city} />
                {city && (state || zip) ? ", " : null}
                <CopyableCustomerValue label="State" value={state} />
                {state && zip ? " " : null}
                <CopyableCustomerValue label="ZIP" value={zip} />
              </div>
            )}
          </div>
        )}

        {(phone || email) && (
          <div data-customer-line="contact" style={{ marginTop: 8 }}>
            {phone && (
              <div>
                <CopyableCustomerValue label="Phone" value={phone} />
              </div>
            )}
            {email && (
              <div>
                <CopyableCustomerValue label="Email" value={email} />
              </div>
            )}
          </div>
        )}
      </address>
    </div>
  );
}

function OrderDetailsModal({
  order,
  onClose,
  onOpenRxImage,
  onOpenNotes,
  onCopyOrder,
  onFounderCompleteArchive,
  onAdjustQuantity,
  onAdjustCapture,
  onCorrectLens,
}: {
  order: Order;
  onClose: () => void;
  onOpenRxImage: () => void;
  onOpenNotes: () => void;
  onCopyOrder: () => void;
  onFounderCompleteArchive: () => void;
  onAdjustQuantity: () => void;
  onAdjustCapture: () => void;
  onCorrectLens: () => void;
}) {
  const customerName = getCustomerName(order);
  const patientName = getPatientName(order);
  const showPatientName = namesDiffer(patientName, customerName);
  const payment = getPaymentState(order);
  const paymentDisplay = getAdminPaymentDisplay(order);
  const verification = getVerificationState(order);
  const fulfillment = normalizedFulfillmentStatus(order);
  const rxSource = getRxSourceState(order);
  const rxStatus = displayRxStatus(order);
  const flags = getOrderStatusFlags(order);
  const isMerchantLane = isMerchantQueueBucket(
    getOrderOperationalClassification(order).bucket,
  );

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 48,
        background: "rgba(2,6,23,0.82)",
        display: "grid",
        placeItems: "center",
        padding: 18,
      }}
    >
      <section
        role="dialog"
        data-testid="order-details-modal"
        aria-modal="true"
        aria-label={`Order details for ${customerName}`}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(1040px, 100%)",
          maxHeight: "92vh",
          overflow: "auto",
          ...mutedPanelStyle(),
          background: "#0f172a",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "start",
            marginBottom: 12,
          }}
        >
          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Order Details</h2>
            <div style={{ marginTop: 3, color: "#94a3b8", fontSize: 12 }}>
              {customerName} · {order.id}
            </div>
            {flags.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: 5,
                  flexWrap: "wrap",
                  marginTop: 7,
                }}
              >
                {flags.map((flag) => (
                  <span
                    key={`${order.id}-details-${flag.label}`}
                    style={compactBadgeStyle(flag.tone)}
                    title={flag.title}
                  >
                    {flag.label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button type="button" style={buttonStyle()} onClick={onClose}>
            Close
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 10,
          }}
        >
          <div style={mutedPanelStyle()}>
            <div style={{ fontWeight: 800, marginBottom: 5 }}>
              Order Summary
            </div>
            <div>Product: {getOrderLensDisplayName(order)}</div>
            <div>
              Submitted quantity: {formatSubmittedOrderQuantity(order)}
            </div>
            {hasAdjustedOrderQuantity(order) && (
              <div>
                Adjusted quantity: {formatAdjustedOrderQuantity(order)}
              </div>
            )}
            <div>
              Shipping: {labelizeStatus(order.shipping_method ?? "standard")}
            </div>
            <div>Total: {formatMoney(order.total_amount_cents)}</div>
          </div>

          <CustomerInformationBlock
            order={order}
            heading="Customer / Shipping"
            patientName={showPatientName ? patientName : null}
          />

          <div style={mutedPanelStyle()}>
            <div style={{ fontWeight: 800, marginBottom: 5 }}>
              Payment Record
            </div>
            <div>Status: {payment.label}</div>
            <div>
              Authorized: {paymentDisplay.authorizedAmountCents === null
                ? "—"
                : formatMoney(paymentDisplay.authorizedAmountCents)}
            </div>
            <div>
              Capture: {paymentDisplay.capturedAmountCents === null
                ? "Not captured"
                : formatMoney(paymentDisplay.capturedAmountCents)}
            </div>
            <div>Stripe: {order.stripe_payment_intent_status ?? "-"}</div>
            <div style={{ marginTop: 5, overflowWrap: "anywhere" }}>
              PaymentIntent: {order.payment_intent_id ?? "-"}
            </div>
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                marginTop: 9,
              }}
            >
              {isMerchantLane && (
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={onAdjustQuantity}
                  style={buttonStyle({ fontSize: 11 })}
                >
                  Adjust Quantity
                </button>
                <button
                  type="button"
                  onClick={onAdjustCapture}
                  style={buttonStyle({ fontSize: 11 })}
                >
                  Adjust Capture
                </button>
              </div>
              )}
              <button
                type="button"
                onClick={onCorrectLens}
                style={buttonStyle({ fontSize: 11 })}
              >
                Correct Lens / Rx
              </button>
            </div>
          </div>

          <div style={mutedPanelStyle()}>
            <div style={{ fontWeight: 800, marginBottom: 5 }}>
              Processing History
            </div>
            <div>Verification: {verification.label}</div>
            <div>Fulfillment: {labelizeStatus(fulfillment)}</div>
            <div>Rx source: {rxSource.label}</div>
            <div>Rx detail: {rxStatus}</div>
            <div style={{ marginTop: 5 }}>
              Created: {formatAdminDateTime(order.created_at)}
            </div>
            <div>Updated: {formatAdminDateTime(order.updated_at)}</div>
          </div>
        </div>

        <RxDetailsPanel order={order} />

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 12,
          }}
        >
          {order.rx_upload_path && (
            <button type="button" onClick={onOpenRxImage} style={buttonStyle()}>
              View Rx Image
            </button>
          )}
          {orderSupportsAdminNotes(order) && (
            <button type="button" onClick={onOpenNotes} style={buttonStyle()}>
              Notes
            </button>
          )}
          <button type="button" onClick={onCopyOrder} style={buttonStyle()}>
            Copy Order
          </button>
          <button
            type="button"
            onClick={onFounderCompleteArchive}
            style={buttonStyle({ color: "#fbbf24" })}
          >
            Mark completed / archive
          </button>
        </div>
      </section>
    </div>
  );
}

/* =========================
   Component
========================= */

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [abandonedOrders, setAbandonedOrders] = useState<Order[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detailsOrderId, setDetailsOrderId] = useState<string | null>(null);
  const [recoveryDrafts, setRecoveryDrafts] = useState<
    Record<string, RecoveryEmailDraft>
  >({});
  const [notesModal, setNotesModal] = useState<NotesModalState | null>(null);
  const [captureAdjustmentModal, setCaptureAdjustmentModal] =
    useState<CaptureAdjustmentModalState | null>(null);
  const [orderQuantityAdjustmentModal, setOrderQuantityAdjustmentModal] =
    useState<OrderQuantityAdjustmentModalState | null>(null);
  const [lensCorrectionModal, setLensCorrectionModal] =
    useState<LensCorrectionModalState | null>(null);
  const [rxImageModal, setRxImageModal] = useState<RxImageModalState | null>(
    null,
  );
  const [permanentDeleteModal, setPermanentDeleteModal] =
    useState<PermanentDeleteModalState | null>(null);
  const [selectedAbandonedOrderIds, setSelectedAbandonedOrderIds] = useState<
    Set<string>
  >(() => new Set());
  const [pendingAbandonedOrderIds, setPendingAbandonedOrderIds] = useState<
    Set<string>
  >(() => new Set());
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [savingVerificationAttempt, setSavingVerificationAttempt] = useState<
    string | null
  >(null);
  const [highlightedOrderIds, setHighlightedOrderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminNotice, setAdminNotice] = useState<AdminNotice | null>(null);
  const [verificationFailures, setVerificationFailures] = useState<
    Record<string, string>
  >({});
  const [queueIntegrityIssues, setQueueIntegrityIssues] = useState<
    AdminQueueIntegrityIssue[]
  >([]);
  const knownPaymentIntentOrderIds = useRef<Set<string>>(new Set());
  const notifiedPaymentIntentOrderIds = useRef<Set<string>>(new Set());
  const optimisticallyHiddenOrderIds = useRef<Set<string>>(new Set());
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
    setQueueIntegrityIssues(json.integrity_issues ?? []);

    const activeOrders: Order[] = [
      ...(json.awaiting_verification ?? []),
      ...(json.founder_review ?? []),
      ...(json.ready_to_order ?? []),
      ...(json.resolve_exception ?? []),
    ];
    const hiddenIds = optimisticallyHiddenOrderIds.current;
    const combined: Order[] = [...activeOrders, ...(json.archive ?? [])].filter(
      (order) => !hiddenIds.has(order.id),
    );
    const abandoned: Order[] = [];

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
    setAbandonedOrders([...abandoned].sort(archiveSort));
    setSelectedAbandonedOrderIds((current) => {
      const visibleIds = new Set(abandoned.map((order) => order.id));
      return new Set([...current].filter((id) => visibleIds.has(id)));
    });
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

      if (json.warnings?.length) {
        setAdminNotice({
          tone: "info",
          message: `Admin override saved. Warning: ${json.warnings.join(" ")}`,
        });
      }

      if (json.event_logged === false) {
        setAdminNotice({
          tone: "info",
          message:
            "Order updated, but its audit event could not be recorded. Review server logs.",
        });
      }

      await fetchData();
      return true;
    } finally {
      setSavingOrderId(null);
    }
  }

  async function updateFulfillmentStatus(
    order: Order,
    newStatus: FulfillmentStatus,
  ) {
    if (
      getOrderOperationalBucket(order) === "founder_review" &&
      newStatus !== "review" &&
      newStatus !== "hold" &&
      newStatus !== "cancelled"
    ) {
      setAdminError(
        "Review the uploaded prescription and use Verify prescription & capture payment before advancing fulfillment.",
      );
      return;
    }

    const transition = assessAdminFulfillmentTransition(order, newStatus);
    if (!transition.valid || !transition.allowed) {
      setAdminError("Invalid fulfillment status.");
      return;
    }

    if (
      transition.warnings.length > 0 &&
      !window.confirm(
        [
          `Override fulfillment to ${newStatus.replace(/_/g, " ")}?`,
          "",
          ...transition.warnings.map((warning) => `• ${warning}`),
          "",
          "This warning will not block the admin override.",
        ].join("\n"),
      )
    ) {
      return;
    }

    await updateAdminOrder(order.id, { fulfillment_status: newStatus });
  }

  async function verifyUploadedPrescription(order: Order) {
    if (getOrderOperationalBucket(order) !== "founder_review") {
      setAdminError("This order is not awaiting prescription review.");
      return;
    }

    const captureAmount = formatMoney(effectiveCaptureAmountCents(order));
    if (
      !window.confirm(
        [
          "Confirm prescription review?",
          "",
          "This confirms that you reviewed the uploaded prescription and found it valid for this order.",
          `Stripe will capture ${captureAmount} immediately.`,
        ].join("\n"),
      )
    ) {
      return;
    }

    setSavingOrderId(order.id);
    setExpanded(order.id);
    setAdminError(null);
    setVerificationFailures((current) => {
      const next = { ...current };
      delete next[order.id];
      return next;
    });

    try {
      const response = await fetch(`/api/orders/${order.id}/verify`, {
        method: "POST",
        headers: await authHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({}),
      });
      const payload = await readAdminApiPayload(response);

      if (!response.ok) {
        const message = adminApiErrorMessage(
          payload,
          "Verification and capture did not complete. Refresh Stripe status and retry.",
        );
        setVerificationFailures((current) => ({
          ...current,
          [order.id]: message,
        }));
        setAdminError(
          payload.payment_captured
            ? `Payment may already be captured for ${order.id}, but local verification did not complete. Retry the same Verify action to reconcile it.`
            : `Verification/capture failed for ${order.id}. The order remains blocked; review Stripe status and retry.`,
        );
        await fetchData();
        return;
      }

      await fetchData();
      setVerificationFailures((current) => {
        const next = { ...current };
        delete next[order.id];
        return next;
      });
      setAdminNotice({
        tone: payload.event_logged === false ? "info" : "success",
        message:
          payload.event_logged === false
            ? "Prescription verified and payment captured, but the audit event was not recorded."
            : "Prescription verified and payment captured. The order is ready to place.",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The verification request could not be completed.";
      setVerificationFailures((current) => ({
        ...current,
        [order.id]: `${message} Refresh payment status and retry; the order remains blocked until confirmed.`,
      }));
      setAdminError(
        `Verification/capture could not be confirmed for ${order.id}. Review Stripe status and retry.`,
      );
      await fetchData();
    } finally {
      setSavingOrderId(null);
    }
  }

  function openNotes(order: Order, patientName: string) {
    setNotesModal({
      orderId: order.id,
      patientName,
      notes: order.admin_notes ?? "",
    });
  }


  async function saveNotes() {
    if (!notesModal) return;

    const ok = await updateAdminOrder(notesModal.orderId, {
      admin_notes: notesModal.notes,
    });
    if (ok) setNotesModal(null);
  }

  async function recordVerificationAttempt(
    orderId: string,
    method: ManualVerificationAttemptMethod,
  ) {
    const attemptKey = `${orderId}:${method}`;
    setSavingVerificationAttempt(attemptKey);
    setAdminError(null);

    try {
      const response = await fetch(
        `/api/admin/orders/${orderId}/verification-attempt`,
        {
          method: "POST",
          headers: await authHeaders(),
          credentials: "same-origin",
          body: JSON.stringify({ method }),
        },
      );
      const payload = await readAdminApiPayload(response);

      if (!response.ok) {
        setAdminError(
          adminApiErrorMessage(
            payload,
            `Unable to record the ${method} verification attempt.`,
          ),
        );
        return;
      }

      await fetchData();
      setAdminNotice({
        tone: "success",
        message: `Prescriber ${method} attempt recorded.`,
      });
    } finally {
      setSavingVerificationAttempt(null);
    }
  }

  function openCaptureAdjustment(order: Order, patientName: string) {
    if (
      typeof order.total_amount_cents !== "number" ||
      order.total_amount_cents <= 0
    ) {
      setAdminError("Order is missing a valid authorized amount.");
      return;
    }

    const captureAmount =
      effectiveCaptureAmountCents(order) ?? order.total_amount_cents;
    const reason = isCaptureAdjustmentReason(order.capture_adjustment_reason)
      ? order.capture_adjustment_reason
      : "Quantity correction";

    setCaptureAdjustmentModal({
      orderId: order.id,
      patientName,
      authorizedAmountCents: order.total_amount_cents,
      amount: formatMoneyInput(captureAmount),
      reason,
      error: null,
    });
  }

  async function saveCaptureAdjustment() {
    if (!captureAdjustmentModal) return;

    const amountCents = parseDollarAmountToCents(
      captureAdjustmentModal.amount,
    );

    if (amountCents === null) {
      setCaptureAdjustmentModal((current) =>
        current
          ? {
              ...current,
              error: "Use dollars and cents, for example 101.99.",
            }
          : current,
      );
      return;
    }

    if (amountCents <= 0) {
      setCaptureAdjustmentModal((current) =>
        current
          ? { ...current, error: "Capture amount must be greater than $0.00." }
          : current,
      );
      return;
    }

    if (amountCents > captureAdjustmentModal.authorizedAmountCents) {
      setCaptureAdjustmentModal((current) =>
        current
          ? {
              ...current,
              error: `Capture amount cannot exceed the authorized amount of ${formatMoney(
                current.authorizedAmountCents,
              )}.`,
            }
          : current,
      );
      return;
    }

    setSavingOrderId(captureAdjustmentModal.orderId);
    setAdminError(null);

    try {
      const res = await fetch("/api/admin/orders/adjust-capture-amount", {
        method: "POST",
        headers: await authHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({
          orderId: captureAdjustmentModal.orderId,
          capture_amount_cents: amountCents,
          reason: captureAdjustmentModal.reason,
        }),
      });

      const json = await readAdminApiPayload(res);

      if (!res.ok) {
        const message = adminApiErrorMessage(
          json,
          "Capture amount adjustment failed.",
        );
        setCaptureAdjustmentModal((current) =>
          current ? { ...current, error: message } : current,
        );
        return;
      }

      await fetchData();
      setCaptureAdjustmentModal(null);
      setAdminNotice({
        tone: "success",
        message: "Capture amount adjustment saved.",
      });
    } finally {
      setSavingOrderId(null);
    }
  }

  function openOrderQuantityAdjustment(order: Order, patientName: string) {
    const reason = isOrderQuantityAdjustmentReason(
      order.order_quantity_adjustment_reason,
    )
      ? order.order_quantity_adjustment_reason
      : "Quantity correction";

    const right =
      finiteCount(order.adjusted_right_box_count) ??
      finiteCount(order.right_box_count ?? order.od_box_count) ??
      0;
    const left =
      finiteCount(order.adjusted_left_box_count) ??
      finiteCount(order.left_box_count ?? order.os_box_count) ??
      0;

    setOrderQuantityAdjustmentModal({
      orderId: order.id,
      patientName,
      rightBoxes: String(right),
      leftBoxes: String(left),
      reason,
      error: null,
    });
  }

  async function saveOrderQuantityAdjustment() {
    if (!orderQuantityAdjustmentModal) return;

    const rightBoxes = parseBoxCountInput(
      orderQuantityAdjustmentModal.rightBoxes,
    );
    const leftBoxes = parseBoxCountInput(
      orderQuantityAdjustmentModal.leftBoxes,
    );

    if (rightBoxes === null) {
      setOrderQuantityAdjustmentModal((current) =>
        current
          ? {
              ...current,
              error:
                "Right Eye Boxes must be an integer greater than or equal to 0.",
            }
          : current,
      );
      return;
    }

    if (leftBoxes === null) {
      setOrderQuantityAdjustmentModal((current) =>
        current
          ? {
              ...current,
              error:
                "Left Eye Boxes must be an integer greater than or equal to 0.",
            }
          : current,
      );
      return;
    }

    if (rightBoxes + leftBoxes <= 0) {
      setOrderQuantityAdjustmentModal((current) =>
        current
          ? {
              ...current,
              error: "Corrected order quantity must be at least 1 box.",
            }
          : current,
      );
      return;
    }

    setSavingOrderId(orderQuantityAdjustmentModal.orderId);
    setAdminError(null);

    try {
      const res = await fetch("/api/admin/orders/adjust-order-quantity", {
        method: "POST",
        headers: await authHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({
          orderId: orderQuantityAdjustmentModal.orderId,
          adjusted_right_box_count: rightBoxes,
          adjusted_left_box_count: leftBoxes,
          reason: orderQuantityAdjustmentModal.reason,
        }),
      });

      const json = await readAdminApiPayload(res);

      if (!res.ok) {
        const message = adminApiErrorMessage(
          json,
          "Order quantity adjustment failed.",
        );
        setOrderQuantityAdjustmentModal((current) =>
          current ? { ...current, error: message } : current,
        );
        return;
      }

      await fetchData();
      setOrderQuantityAdjustmentModal(null);
      setAdminNotice({
        tone: "success",
        message: json.reauthorization_required
          ? "Quantity and price updated. The prior authorization was cancelled; the customer must approve the updated total."
          : "Order quantity and billing amount updated.",
      });
    } finally {
      setSavingOrderId(null);
    }
  }

  function openLensCorrection(order: Order, patientName: string) {
    const details = fullRxDetails(order);
    const right = details.rx?.right ?? null;
    const left = details.rx?.left ?? null;
    const coreId = right?.coreId ?? left?.coreId ?? "MYDAY";
    const skus = CORE_TO_SKUS[coreId] ?? [];
    const currentSku = order.sku && skus.includes(order.sku) ? order.sku : skus[0] ?? "";
    const paymentDisplay = getAdminPaymentDisplay(order);
    const paymentAlreadyCaptured =
      getPaymentState(order).status === "captured" ||
      order.stripe_payment_intent_status?.trim().toLowerCase() === "succeeded";
    const capturedAmount = paymentDisplay.capturedAmountCents ??
      (paymentAlreadyCaptured ? order.capture_amount_cents ?? null : null);
    setLensCorrectionModal({
      orderId: order.id,
      patientName,
      coreId,
      sku: currentSku,
      expires: String(details.expires ?? ""),
      right: correctionEyeForm(right),
      left: correctionEyeForm(left),
      rightBoxes: String(finiteCount(order.adjusted_right_box_count) ?? finiteCount(order.right_box_count) ?? 1),
      leftBoxes: String(finiteCount(order.adjusted_left_box_count) ?? finiteCount(order.left_box_count) ?? 0),
      sharedPackForBothEyes: false,
      reason: "",
      customerApprovedSubstitution: false,
      paymentAlreadyCaptured,
      capturedAmount: capturedAmount === null ? "" : formatMoneyInput(capturedAmount),
      supplierOrderAlreadyPlaced: normalizedFulfillmentStatus(order) === "ordered",
      error: null,
    });
  }

  function correctionEyePayload(eye: LensCorrectionEyeForm) {
    if (!eye.sphere.trim()) return null;
    const requiredSphere = Number(eye.sphere);
    if (!Number.isFinite(requiredSphere)) return null;
    const optionalNumber = (value: string): number | null | undefined => {
      if (!value.trim()) return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    const cylinder = optionalNumber(eye.cylinder);
    const axis = optionalNumber(eye.axis);
    const base_curve = optionalNumber(eye.base_curve);
    const diameter = optionalNumber(eye.diameter);
    if ([cylinder, axis, base_curve, diameter].some((value) => value === undefined)) return null;
    return { sphere: requiredSphere, cylinder, axis, base_curve, diameter, add: eye.add.trim() || null };
  }

  async function saveLensCorrection() {
    if (!lensCorrectionModal) return;
    const right = correctionEyePayload(lensCorrectionModal.right);
    const left = correctionEyePayload(lensCorrectionModal.left);
    const rightBoxes = parseBoxCountInput(lensCorrectionModal.rightBoxes);
    const leftBoxes = parseBoxCountInput(lensCorrectionModal.leftBoxes);
    const capturedAmountCents = lensCorrectionModal.paymentAlreadyCaptured
      ? parseDollarAmountToCents(lensCorrectionModal.capturedAmount)
      : null;
    if (!right || !left || rightBoxes === null || leftBoxes === null || !lensCorrectionModal.sku || !lensCorrectionModal.reason.trim()) {
      setLensCorrectionModal((current) => current ? { ...current, error: "Enter a reason, lens SKU, numeric Rx values, and valid box counts." } : current);
      return;
    }
    if (lensCorrectionModal.paymentAlreadyCaptured && (capturedAmountCents === null || capturedAmountCents <= 0)) {
      setLensCorrectionModal((current) => current ? { ...current, error: "Enter the actual historical captured amount." } : current);
      return;
    }
    setSavingOrderId(lensCorrectionModal.orderId);
    setAdminError(null);
    try {
      const res = await fetch("/api/admin/orders/correct-lens", {
        method: "POST",
        headers: await authHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({
          orderId: lensCorrectionModal.orderId,
          coreId: lensCorrectionModal.coreId,
          sku: lensCorrectionModal.sku,
          expires: lensCorrectionModal.expires,
          right, left,
          right_box_count: rightBoxes,
          left_box_count: leftBoxes,
          shared_pack_for_both_eyes: lensCorrectionModal.sharedPackForBothEyes,
          reason: lensCorrectionModal.reason,
          customer_approved_substitution: lensCorrectionModal.customerApprovedSubstitution,
          payment_already_captured: lensCorrectionModal.paymentAlreadyCaptured,
          captured_amount_cents: capturedAmountCents,
          supplier_order_already_placed: lensCorrectionModal.supplierOrderAlreadyPlaced,
        }),
      });
      const json = await readAdminApiPayload(res);
      if (!res.ok) {
        setLensCorrectionModal((current) => current ? { ...current, error: adminApiErrorMessage(json, "Lens correction failed.") } : current);
        return;
      }
      await fetchData();
      setLensCorrectionModal(null);
      setAdminNotice({
        tone: json.event_logged === false ? "info" : "success",
        message: json.event_logged === false
          ? "Lens/Rx correction saved, but its audit event could not be recorded."
          : "Lens/Rx record correction saved. No Stripe or supplier action was performed.",
      });
    } finally {
      setSavingOrderId(null);
    }
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

  function setAbandonedPending(orderIds: string[], pending: boolean) {
    setPendingAbandonedOrderIds((current) => {
      const next = new Set(current);
      orderIds.forEach((orderId) => {
        if (pending) next.add(orderId);
        else next.delete(orderId);
      });
      return next;
    });
  }

  function removeOrderOptimistically(
    orderIds: string[],
  ): OptimisticOrdersSnapshot {
    const idSet = new Set(orderIds);
    const snapshot = {
      orders,
      abandonedOrders,
      selectedAbandonedOrderIds,
      expanded,
      recoveryDrafts,
    };

    orderIds.forEach((orderId) =>
      optimisticallyHiddenOrderIds.current.add(orderId),
    );

    setOrders((current) => current.filter((order) => !idSet.has(order.id)));
    setAbandonedOrders((current) =>
      current.filter((order) => !idSet.has(order.id)),
    );
    setSelectedAbandonedOrderIds((current) =>
      new Set([...current].filter((orderId) => !idSet.has(orderId))),
    );
    setRecoveryDrafts((current) => {
      const next = { ...current };
      orderIds.forEach((orderId) => delete next[orderId]);
      return next;
    });
    setExpanded((current) => {
      if (!current) return current;
      if (idSet.has(current)) return null;
      if (
        current.startsWith("abandoned:") &&
        idSet.has(current.replace("abandoned:", ""))
      ) {
        return null;
      }
      return current;
    });

    return snapshot;
  }

  function restoreOrderAfterActionFailure(
    snapshot: OptimisticOrdersSnapshot,
    failedOrderIds: string[],
  ) {
    const failedIdSet = new Set(failedOrderIds);

    failedOrderIds.forEach((orderId) =>
      optimisticallyHiddenOrderIds.current.delete(orderId),
    );

    const restoredOrders = snapshot.orders.filter((order) =>
      failedIdSet.has(order.id),
    );
    const restoredAbandonedOrders = snapshot.abandonedOrders.filter((order) =>
      failedIdSet.has(order.id),
    );

    setOrders((current) =>
      mergeOrderLists(current, restoredOrders, compareOperationalPriority),
    );
    setAbandonedOrders((current) =>
      mergeOrderLists(current, restoredAbandonedOrders, archiveSort),
    );
    setSelectedAbandonedOrderIds((current) => {
      const next = new Set(current);
      snapshot.selectedAbandonedOrderIds.forEach((orderId) => {
        if (failedIdSet.has(orderId)) next.add(orderId);
      });
      return next;
    });
    setRecoveryDrafts((current) => {
      const next = { ...current };
      Object.entries(snapshot.recoveryDrafts).forEach(([orderId, draft]) => {
        if (failedIdSet.has(orderId)) next[orderId] = draft;
      });
      return next;
    });
    setExpanded((current) => current ?? snapshot.expanded);
  }

  async function archiveOrder(orderId: string) {
    if (!confirm(
      "Mark this order completed / archive by founder override?\n\nThis removes it from active queues and preserves its payment, prescription, verification, supplier, and event history. It will not charge, refund, capture, submit, cancel, or email anyone.",
    )) {
      return;
    }

    const snapshot = removeOrderOptimistically([orderId]);
    setAdminError(null);
    setAdminNotice({ tone: "info", message: "Applying founder complete/archive override..." });

    const res = await fetch(`/api/orders/${orderId}/archive`, {
      method: "POST",
      headers: await authHeaders(),
      credentials: "same-origin",
    });
    const json = await readAdminApiPayload(res);

    if (!res.ok) {
      restoreOrderAfterActionFailure(snapshot, [orderId]);
      setAdminNotice(null);
      setAdminError(adminApiErrorMessage(json, "Founder complete/archive failed."));
      return;
    }

    setAdminNotice({ tone: "success", message: "Order completed / archived by founder override." });
  }

  async function runAbandonedAction(
    orderId: string,
    action: AbandonedAdminAction,
  ): Promise<boolean> {
    return runAbandonedActions([orderId], action);
  }

  async function postAbandonedAction(
    orderId: string,
    action: AbandonedAdminAction,
  ): Promise<{ ok: boolean; status: number; json: AdminApiPayload }> {
    const res = await fetch(`/api/admin/abandoned-checkouts/${orderId}`, {
      method: "POST",
      headers: await authHeaders(),
      credentials: "same-origin",
      body: JSON.stringify({ action }),
    });

    return {
      ok: res.ok,
      status: res.status,
      json: await readAdminApiPayload(res),
    };
  }

  async function runAbandonedActions(
    orderIds: string[],
    action: AbandonedAdminAction,
  ): Promise<boolean> {
    const uniqueOrderIds = [...new Set(orderIds)];
    if (uniqueOrderIds.length === 0) return true;

    setAdminError(null);

    if (action === "draft_recovery_email") {
      const [orderId] = uniqueOrderIds;
      const result = await postAbandonedAction(orderId, action);

      if (!result.ok) {
        const message = adminApiErrorMessage(
          result.json,
          "Abandoned checkout action failed.",
        );
        setAdminError(message);
        if (process.env.NODE_ENV !== "production") {
          console.warn("[AdminOrdersPage] abandoned checkout action failed", {
            orderId,
            action,
            status: result.status,
            error: result.json.error,
            code: result.json.code,
          });
        }
        return false;
      }

      if (result.json.draft) {
        const draft = result.json.draft;
        setRecoveryDrafts((prev) => ({ ...prev, [orderId]: draft }));

        try {
          await navigator.clipboard.writeText(draft.text);
        } catch {
          // Clipboard access can be blocked by the browser; the draft remains visible.
        }
      }

      return true;
    }

    const snapshot = removeOrderOptimistically(uniqueOrderIds);
    setAbandonedPending(uniqueOrderIds, true);
    setAdminNotice({
      tone: "info",
      message:
        action === "archive"
          ? `Archiving ${uniqueOrderIds.length} abandoned draft${
              uniqueOrderIds.length === 1 ? "" : "s"
            }...`
          : `Deleting ${uniqueOrderIds.length} abandoned draft${
              uniqueOrderIds.length === 1 ? "" : "s"
            }...`,
    });

    const results = await Promise.all(
      uniqueOrderIds.map(async (orderId) => ({
        orderId,
        ...(await postAbandonedAction(orderId, action)),
      })),
    );
    setAbandonedPending(uniqueOrderIds, false);

    const failed = results.filter((result) => !result.ok);

    if (failed.length > 0) {
      restoreOrderAfterActionFailure(
        snapshot,
        failed.map((result) => result.orderId),
      );
      const firstFailure = failed[0];
      const message = adminApiErrorMessage(
        firstFailure.json,
        `${failed.length} abandoned checkout action${
          failed.length === 1 ? "" : "s"
        } failed.`,
      );
      setAdminNotice(null);
      setAdminError(message);

      if (process.env.NODE_ENV !== "production") {
        console.warn("[AdminOrdersPage] abandoned checkout action failed", {
          action,
          failed_order_ids: failed.map((result) => result.orderId),
          status: firstFailure.status,
          error: firstFailure.json.error,
          code: firstFailure.json.code,
        });
      }

      return false;
    }

    setAdminNotice({
      tone: "success",
      message:
        action === "archive"
          ? `Archived ${uniqueOrderIds.length} abandoned draft${
              uniqueOrderIds.length === 1 ? "" : "s"
            }.`
          : `Deleted ${uniqueOrderIds.length} abandoned draft${
              uniqueOrderIds.length === 1 ? "" : "s"
            }.`,
    });
    return true;
  }

  async function confirmPermanentDelete() {
    if (!permanentDeleteModal) return;

    const { orderIds } = permanentDeleteModal;
    setPermanentDeleteModal(null);
    void runAbandonedActions(orderIds, "delete_permanently");
  }

  function toggleSelectedAbandonedOrder(orderId: string, checked: boolean) {
    setSelectedAbandonedOrderIds((current) => {
      const next = new Set(current);
      if (checked) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  }

  function selectAllVisibleAbandonedOrders() {
    setSelectedAbandonedOrderIds(
      new Set(abandonedOrders.map((order) => order.id)),
    );
  }

  function clearSelectedAbandonedOrders() {
    setSelectedAbandonedOrderIds(new Set<string>());
  }

  function batchArchiveOrders() {
    void runAbandonedActions([...selectedAbandonedOrderIds], "archive");
  }

  function batchDeleteOrders() {
    const selectedOrders = abandonedOrders.filter((order) =>
      selectedAbandonedOrderIds.has(order.id),
    );
    const deletableOrders = selectedOrders.filter(canPermanentlyDelete);

    if (
      selectedOrders.length === 0 ||
      deletableOrders.length !== selectedOrders.length
    ) {
      setAdminError(
        "Permanent delete is only available for selected abandoned drafts with no payment intent.",
      );
      return;
    }

    setPermanentDeleteModal({
      orderIds: deletableOrders.map((order) => order.id),
      label: `${deletableOrders.length} selected abandoned draft${
        deletableOrders.length === 1 ? "" : "s"
      }`,
    });
  }

  function copyOrderText(order: Order, rx: ReturnType<typeof parseRx>): void {
    const customerName = getCustomerName(order);
    const patientName = getPatientName(order);
    const payment = paymentStatus(order);
    const verification = verificationSummary(order);

    const text = [
      `Order: ${order.id}`,
      `Customer: ${customerName}`,
      namesDiffer(patientName, customerName) ? `Patient: ${patientName}` : null,
      `Payment: ${payment.label}`,
      `Fulfillment: ${normalizedFulfillmentStatus(order)}`,
      `Verify: ${verification.label}`,
      `Authorized Amount: ${formatMoney(order.total_amount_cents)}`,
      `Capture Amount: ${formatMoney(effectiveCaptureAmountCents(order))}`,
      `Shipping: ${order.shipping_method ?? "standard"} | ${formatMoney(
        order.shipping_cents ?? 0,
      )}`,
      `Lens: ${getOrderLensDisplayName(order)}`,
      `Quantity: ${formatOrderQuantitySummary(order)}`,
      `RX OD: ${rx.od}`,
      `RX OS: ${rx.os}`,
      `Expires: ${rx.exp ?? "-"}`,
      `Dr: ${order.prescriber_name ?? "-"}`,
      `Ship to: ${customerName}`,
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

  const awaitingVerificationOrders = orders.filter(
    (order) => getOrderOperationalBucket(order) === "awaiting_verification",
  );
  const founderReviewOrders = orders.filter(
    (order) => getOrderOperationalBucket(order) === "founder_review",
  );
  const readyToOrderOrders = orders.filter(
    (order) => getOrderOperationalBucket(order) === "ready_to_order",
  );
  const resolveExceptionOrders = orders.filter(
    (order) => getOrderOperationalBucket(order) === "resolve_exception",
  );
  const archiveOrders = orders.filter(shouldDefaultCollapse).sort(archiveSort);
  const sortSectionOrders = (sectionOrders: Order[]) =>
    [...sectionOrders].sort((a, b) => {
      const aOpen = expanded === a.id;
      const bOpen = expanded === b.id;
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      return getOperationalSortTimestamp(b) - getOperationalSortTimestamp(a);
    });
  const activeOrdersByBucket = {
    awaiting_verification: awaitingVerificationOrders,
    founder_review: founderReviewOrders,
    ready_to_order: readyToOrderOrders,
    resolve_exception: resolveExceptionOrders,
  };
  const activeOrderSections = ADMIN_WORK_QUEUE_SECTIONS.map((section) => ({
    ...section,
    orders: sortSectionOrders(activeOrdersByBucket[section.key]),
  }));
  const archiveCount = archiveOrders.length + abandonedOrders.length;
  const detailsOrder =
    orders.find((order) => order.id === detailsOrderId) ??
    abandonedOrders.find((order) => order.id === detailsOrderId) ??
    null;
  const selectedAbandonedOrders = abandonedOrders.filter((order) =>
    selectedAbandonedOrderIds.has(order.id),
  );
  const selectedAbandonedCount = selectedAbandonedOrders.length;
  const selectedDeleteAllowed =
    selectedAbandonedCount > 0 &&
    selectedAbandonedOrders.every(canPermanentlyDelete);
  const pendingAbandonedCount = pendingAbandonedOrderIds.size;
  const captureAdjustmentPreviewCents = captureAdjustmentModal
    ? parseDollarAmountToCents(captureAdjustmentModal.amount)
    : null;
  const captureAdjustmentDifference =
    captureAdjustmentModal && captureAdjustmentPreviewCents !== null
      ? captureAdjustmentPreviewCents -
        captureAdjustmentModal.authorizedAmountCents
      : null;
  const captureAdjustmentLowerBy =
    typeof captureAdjustmentDifference === "number" &&
    captureAdjustmentDifference < 0
      ? Math.abs(captureAdjustmentDifference)
      : null;

  return (
    <main style={{ padding: 20 }} onClick={requestNotificationPermission}>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 20 }}>
        Order Work Queue
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

      {adminNotice && (
        <div
          role="status"
          style={{
            border:
              adminNotice.tone === "success"
                ? "1px solid rgba(34,197,94,0.42)"
                : "1px solid rgba(56,189,248,0.38)",
            borderRadius: 8,
            background:
              adminNotice.tone === "success"
                ? "rgba(20,83,45,0.2)"
                : "rgba(12,74,110,0.2)",
            color: adminNotice.tone === "success" ? "#bbf7d0" : "#bae6fd",
            padding: "8px 10px",
            marginBottom: 12,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            fontSize: 13,
          }}
        >
          <span>{adminNotice.message}</span>
          <button
            type="button"
            onClick={() => setAdminNotice(null)}
            style={buttonStyle({ color: "inherit" })}
          >
            Dismiss
          </button>
        </div>
      )}

      {queueIntegrityIssues.length > 0 && (
        <div
          role="status"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            border: "1px solid rgba(148,163,184,0.2)",
            borderRadius: 7,
            background: "rgba(15,23,42,0.4)",
            color: "#cbd5e1",
            padding: "5px 8px",
            marginBottom: 12,
            fontSize: 12,
          }}
        >
          <span style={{ fontWeight: 750 }}>
            Operational Issues ({queueIntegrityIssues.length})
          </span>
          <a href="/admin/system-health" style={{ color: "#7dd3fc" }}>
            Review
          </a>
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
                No orders in this section.
              </div>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                {section.orders.map((o) => (
                  <ActiveOrderCard
                    key={o.id}
                    order={o}
                    isOpen={expanded === o.id}
                    isHighlighted={highlightedOrderIds.has(o.id)}
                    savingOrderId={savingOrderId}
                    savingVerificationAttempt={savingVerificationAttempt}
                    onToggleProcess={() => {
                      clearOrderHighlight(o.id);
                      setExpanded(expanded === o.id ? null : o.id);
                    }}
                    onOpenDetails={() => setDetailsOrderId(o.id)}
                    onOpenRxImage={() => openRxImage(o, getCustomerName(o))}
                    onRecordVerificationAttempt={(method) =>
                      recordVerificationAttempt(o.id, method)
                    }
                    onAdvanceFulfillment={(status) =>
                      updateFulfillmentStatus(o, status)
                    }
                    onVerifyPrescription={() =>
                      verifyUploadedPrescription(o)
                    }
                    onFounderCompleteArchive={() => archiveOrder(o.id)}
                    verificationFailure={verificationFailures[o.id]}
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      <section id="order-history" style={{ marginTop: 34 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
          History / Archive ({archiveCount})
        </h2>
        <p style={{ marginTop: 0, opacity: 0.72, fontSize: 13 }}>
          Supplier-managed orders, customer-blocked checkouts, drafts, and
          terminal orders stay outside the active work queue and are compressed
          here.
        </p>
        {archiveCount === 0 ? (
          <div style={{ ...mutedPanelStyle(), opacity: 0.72 }}>
            No historical orders yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {abandonedOrders.length > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  padding: "8px 10px",
                  border: "1px solid rgba(251,191,36,0.2)",
                  borderRadius: 8,
                  background: "rgba(120,53,15,0.08)",
                  fontSize: 12,
                }}
              >
                <span style={{ fontWeight: 800 }}>
                  {selectedAbandonedCount > 0
                    ? `${selectedAbandonedCount} selected`
                    : "Abandoned drafts"}
                </span>
                <button
                  type="button"
                  onClick={selectAllVisibleAbandonedOrders}
                  style={buttonStyle()}
                >
                  Select all
                </button>
                <button
                  type="button"
                  disabled={selectedAbandonedCount === 0}
                  onClick={clearSelectedAbandonedOrders}
                  style={buttonStyle({
                    opacity: selectedAbandonedCount === 0 ? 0.5 : 1,
                  })}
                >
                  Clear
                </button>
                <button
                  type="button"
                  disabled={selectedAbandonedCount === 0}
                  onClick={batchArchiveOrders}
                  style={buttonStyle({
                    opacity: selectedAbandonedCount === 0 ? 0.5 : 1,
                  })}
                >
                  Archive selected
                </button>
                <button
                  type="button"
                  disabled={!selectedDeleteAllowed}
                  title={
                    selectedDeleteAllowed
                      ? "Delete selected abandoned no-payment drafts"
                      : "Permanent delete only applies to selected no-payment abandoned drafts"
                  }
                  onClick={batchDeleteOrders}
                  style={buttonStyle({
                    color: "#fecaca",
                    border: "1px solid rgba(248,113,113,0.45)",
                    background: "rgba(127,29,29,0.2)",
                    opacity: selectedDeleteAllowed ? 1 : 0.5,
                  })}
                >
                  Delete selected
                </button>
                {pendingAbandonedCount > 0 && (
                  <span style={{ color: "#bae6fd", opacity: 0.82 }}>
                    Syncing {pendingAbandonedCount}
                  </span>
                )}
              </div>
            )}

            {archiveOrders.map((o) => {
              const status = archiveOrderStatus(o);
              const dateTime = formatOrderCreatedDate(o);
              const customerName = getCustomerName(o);
              const patientName = getPatientName(o);
              const showPatientName = namesDiffer(patientName, customerName);

              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setDetailsOrderId(o.id)}
                  aria-haspopup="dialog"
                  style={{
                    width: "100%",
                    minHeight: 44,
                    display: "grid",
                    gridTemplateColumns:
                      "92px minmax(260px, 1fr) 100px 150px 110px",
                    gap: 10,
                    alignItems: "center",
                    border: "1px solid rgba(148,163,184,0.14)",
                    borderRadius: 8,
                    background: "rgba(15,23,42,0.22)",
                    color: "inherit",
                    padding: "6px 10px",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  <span style={{ fontWeight: 800 }}>{dateTime.date}</span>
                  <span>
                    <span style={{ display: "block", fontWeight: 800 }}>
                      {customerName}
                    </span>
                    {showPatientName && (
                      <span style={{ display: "block", opacity: 0.72 }}>
                        Patient: {patientName}
                      </span>
                    )}
                  </span>
                  <span>{formatMoney(o.total_amount_cents)}</span>
                  <span style={badgeStyle(status.tone)}>{status.label}</span>
                  <span style={{ textAlign: "right", color: "#7dd3fc" }}>
                    Details
                  </span>
                </button>
              );
            })}

            {abandonedOrders.map((o) => {
              const info = o.abandoned_checkout;
              const reasons = info?.reasons ?? [];
              const patientName = getCustomerName(o);
              const draft = recoveryDrafts[o.id];
              const rowId = `abandoned:${o.id}`;
              const isOpen = expanded === rowId;
              const dateTime = formatOrderCreatedDate(o);
              const isSelected = selectedAbandonedOrderIds.has(o.id);
              const isPending = pendingAbandonedOrderIds.has(o.id);
              const primaryReason = info?.primaryReason
                ? abandonedReasonLabel(info.primaryReason)
                : "ABANDONED";

              return (
                <div key={`abandoned-${o.id}`}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "28px minmax(0, 1fr)",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select abandoned order for ${patientName}`}
                      checked={isSelected}
                      disabled={isPending}
                      onChange={(event) =>
                        toggleSelectedAbandonedOrder(o.id, event.target.checked)
                      }
                    />
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
                        border: isSelected
                          ? "1px solid rgba(251,191,36,0.55)"
                          : "1px solid rgba(251,191,36,0.24)",
                        borderRadius: 8,
                        background: isOpen
                          ? "rgba(120,53,15,0.22)"
                          : isSelected
                            ? "rgba(251,191,36,0.14)"
                            : "rgba(120,53,15,0.1)",
                        color: "inherit",
                        padding: "6px 10px",
                        textAlign: "left",
                        cursor: "pointer",
                        fontSize: 12,
                        opacity: isPending ? 0.55 : 1,
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
                  </div>

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
                          <div>Created: {formatAdminDateTime(o.created_at)}</div>
                          <div>Updated: {formatAdminDateTime(o.updated_at)}</div>
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
                          type="button"
                          onClick={() => runAbandonedAction(o.id, "archive")}
                          style={{ padding: "4px 8px", borderRadius: 4 }}
                        >
                          Archive
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            runAbandonedAction(o.id, "draft_recovery_email")
                          }
                          style={{ padding: "4px 8px", borderRadius: 4 }}
                        >
                          Draft recovery email
                        </button>
                        {canPermanentlyDelete(o) && (
                          <button
                            type="button"
                            onClick={() =>
                              setPermanentDeleteModal({
                                orderIds: [o.id],
                                label: patientName,
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

      {detailsOrder && (
        <OrderDetailsModal
          order={detailsOrder}
          onClose={() => setDetailsOrderId(null)}
          onOpenRxImage={() =>
            openRxImage(detailsOrder, getCustomerName(detailsOrder))
          }
          onOpenNotes={() =>
            openNotes(detailsOrder, getCustomerName(detailsOrder))
          }
          onCopyOrder={() => copyOrderText(detailsOrder, parseRx(detailsOrder))}
          onFounderCompleteArchive={() => {
            setDetailsOrderId(null);
            archiveOrder(detailsOrder.id);
          }}
          onAdjustQuantity={() =>
            openOrderQuantityAdjustment(
              detailsOrder,
              getCustomerName(detailsOrder),
            )
          }
          onAdjustCapture={() =>
            openCaptureAdjustment(detailsOrder, getCustomerName(detailsOrder))
          }
          onCorrectLens={() =>
            openLensCorrection(detailsOrder, getCustomerName(detailsOrder))
          }
        />
      )}

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
              This will permanently delete{" "}
              {permanentDeleteModal.orderIds.length === 1
                ? `the abandoned no-payment draft for ${permanentDeleteModal.label}`
                : permanentDeleteModal.label}{" "}
              and remove any uploaded Rx files. This cannot be undone.
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

      {orderQuantityAdjustmentModal && (
        <div
          onClick={() => setOrderQuantityAdjustmentModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 52,
            background: "rgba(2,6,23,0.78)",
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              ...mutedPanelStyle(),
              background: "#0f172a",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 4 }}>
              Adjust Order Quantity
            </div>
            <div
              style={{
                color: "rgba(226,232,240,0.72)",
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              {orderQuantityAdjustmentModal.patientName}
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 5, fontWeight: 700 }}>
                Right Eye Boxes
                <input
                  value={orderQuantityAdjustmentModal.rightBoxes}
                  inputMode="numeric"
                  onChange={(e) =>
                    setOrderQuantityAdjustmentModal((current) =>
                      current
                        ? {
                            ...current,
                            rightBoxes: e.target.value,
                            error: null,
                          }
                        : current,
                    )
                  }
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    borderRadius: 6,
                    border: "1px solid rgba(148,163,184,0.35)",
                    background: "rgba(2,6,23,0.75)",
                    color: "inherit",
                    padding: "9px 10px",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 5, fontWeight: 700 }}>
                Left Eye Boxes
                <input
                  value={orderQuantityAdjustmentModal.leftBoxes}
                  inputMode="numeric"
                  onChange={(e) =>
                    setOrderQuantityAdjustmentModal((current) =>
                      current
                        ? {
                            ...current,
                            leftBoxes: e.target.value,
                            error: null,
                          }
                        : current,
                    )
                  }
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    borderRadius: 6,
                    border: "1px solid rgba(148,163,184,0.35)",
                    background: "rgba(2,6,23,0.75)",
                    color: "inherit",
                    padding: "9px 10px",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 5, fontWeight: 700 }}>
                Reason
                <select
                  value={orderQuantityAdjustmentModal.reason}
                  onChange={(e) => {
                    const reason = e.target.value;
                    if (!isOrderQuantityAdjustmentReason(reason)) return;
                    setOrderQuantityAdjustmentModal((current) =>
                      current
                        ? {
                            ...current,
                            reason,
                            error: null,
                          }
                        : current,
                    );
                  }}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    borderRadius: 6,
                    border: "1px solid rgba(148,163,184,0.35)",
                    background: "rgba(2,6,23,0.75)",
                    color: "inherit",
                    padding: "9px 10px",
                  }}
                >
                  {ORDER_QUANTITY_ADJUSTMENT_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </label>

              {orderQuantityAdjustmentModal.error && (
                <div style={{ color: "#fca5a5", fontWeight: 700 }}>
                  {orderQuantityAdjustmentModal.error}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 14,
              }}
            >
              <button
                style={buttonStyle()}
                onClick={() => setOrderQuantityAdjustmentModal(null)}
              >
                Cancel
              </button>
              <button
                style={buttonStyle({ background: "rgba(20,184,166,0.25)" })}
                onClick={saveOrderQuantityAdjustment}
                disabled={
                  savingOrderId === orderQuantityAdjustmentModal.orderId
                }
              >
                {savingOrderId === orderQuantityAdjustmentModal.orderId
                  ? "Saving..."
                  : "Save Adjustment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {captureAdjustmentModal && (
        <div
          onClick={() => setCaptureAdjustmentModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 52,
            background: "rgba(2,6,23,0.78)",
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              ...mutedPanelStyle(),
              background: "#0f172a",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 4 }}>
              Adjust Capture Amount
            </div>
            <div
              style={{
                color: "rgba(226,232,240,0.72)",
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              {captureAdjustmentModal.patientName}
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div style={{ opacity: 0.68 }}>Authorized Amount</div>
                <div style={{ fontWeight: 800 }}>
                  {formatMoney(captureAdjustmentModal.authorizedAmountCents)}
                </div>
              </div>

              <label style={{ display: "grid", gap: 5, fontWeight: 700 }}>
                New Capture Amount ($)
                <input
                  value={captureAdjustmentModal.amount}
                  inputMode="decimal"
                  onChange={(e) =>
                    setCaptureAdjustmentModal((current) =>
                      current
                        ? {
                            ...current,
                            amount: e.target.value,
                            error: null,
                          }
                        : current,
                    )
                  }
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    borderRadius: 6,
                    border: "1px solid rgba(148,163,184,0.35)",
                    background: "rgba(2,6,23,0.75)",
                    color: "inherit",
                    padding: "9px 10px",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 5, fontWeight: 700 }}>
                Reason
                <select
                  value={captureAdjustmentModal.reason}
                  onChange={(e) => {
                    const reason = e.target.value;
                    if (!isCaptureAdjustmentReason(reason)) return;
                    setCaptureAdjustmentModal((current) =>
                      current
                        ? {
                            ...current,
                            reason,
                            error: null,
                          }
                        : current,
                    );
                  }}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    borderRadius: 6,
                    border: "1px solid rgba(148,163,184,0.35)",
                    background: "rgba(2,6,23,0.75)",
                    color: "inherit",
                    padding: "9px 10px",
                  }}
                >
                  {CAPTURE_ADJUSTMENT_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                Difference: {formatSignedMoney(captureAdjustmentDifference)}
              </div>

              {captureAdjustmentLowerBy !== null && (
                <div style={{ color: "#fde68a", fontWeight: 700 }}>
                  Capture amount is lower than authorization by{" "}
                  {formatMoney(captureAdjustmentLowerBy)}.
                </div>
              )}

              {captureAdjustmentModal.error && (
                <div style={{ color: "#fca5a5", fontWeight: 700 }}>
                  {captureAdjustmentModal.error}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 14,
              }}
            >
              <button
                style={buttonStyle()}
                onClick={() => setCaptureAdjustmentModal(null)}
              >
                Cancel
              </button>
              <button
                style={buttonStyle({ background: "rgba(20,184,166,0.25)" })}
                onClick={saveCaptureAdjustment}
                disabled={savingOrderId === captureAdjustmentModal.orderId}
              >
                {savingOrderId === captureAdjustmentModal.orderId
                  ? "Saving..."
                  : "Save Adjustment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {lensCorrectionModal && (() => {
        const availableSkus = CORE_TO_SKUS[lensCorrectionModal.coreId] ?? [];
        const updateEye = (side: "right" | "left", field: keyof LensCorrectionEyeForm, value: string) =>
          setLensCorrectionModal((current) => current
            ? { ...current, [side]: { ...current[side], [field]: value }, error: null }
            : current);
        const eyeInputs: Array<{ key: keyof LensCorrectionEyeForm; label: string; required?: boolean }> = [
          { key: "sphere", label: "Sphere", required: true },
          { key: "cylinder", label: "Cylinder" },
          { key: "axis", label: "Axis" },
          { key: "add", label: "ADD" },
          { key: "base_curve", label: "BC" },
          { key: "diameter", label: "Diameter" },
        ];
        return (
          <div
            onClick={() => setLensCorrectionModal(null)}
            style={{ position: "fixed", inset: 0, zIndex: 52, background: "rgba(2,6,23,0.78)", display: "grid", placeItems: "center", padding: 20 }}
          >
            <div
              onClick={(event) => event.stopPropagation()}
              style={{ width: "min(820px, 100%)", maxHeight: "92vh", overflow: "auto", ...mutedPanelStyle(), background: "#0f172a" }}
            >
              <div style={{ fontWeight: 900, marginBottom: 4 }}>Correct Lens / Rx</div>
              <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 13, marginBottom: 12 }}>
                {lensCorrectionModal.patientName}. This records the actual product, prescription, quantities, and operational history. It never charges, captures, refunds, or submits a supplier order.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
                <label style={{ display: "grid", gap: 5, fontWeight: 700 }}>
                  Replacement lens
                  <select
                    value={lensCorrectionModal.coreId}
                    onChange={(event) => {
                      const coreId = event.target.value;
                      const skus = CORE_TO_SKUS[coreId] ?? [];
                      setLensCorrectionModal((current) => current ? { ...current, coreId, sku: skus[0] ?? "", error: null } : current);
                    }}
                    style={{ padding: "9px 10px", borderRadius: 6 }}
                  >
                    {lenses.map((lens) => <option key={lens.coreId} value={lens.coreId}>{lens.displayName}</option>)}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 5, fontWeight: 700 }}>
                  Pack / SKU
                  <select
                    value={lensCorrectionModal.sku}
                    onChange={(event) => setLensCorrectionModal((current) => current ? { ...current, sku: event.target.value, error: null } : current)}
                    style={{ padding: "9px 10px", borderRadius: 6 }}
                  >
                    {availableSkus.map((sku) => <option key={sku} value={sku}>{sku}</option>)}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 5, fontWeight: 700 }}>
                  Prescription expiration
                  <input type="date" value={lensCorrectionModal.expires} onChange={(event) => setLensCorrectionModal((current) => current ? { ...current, expires: event.target.value, error: null } : current)} style={{ padding: "9px 10px", borderRadius: 6 }} />
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 12, marginTop: 12 }}>
                {(["right", "left"] as const).map((side) => (
                  <section key={side} style={{ ...mutedPanelStyle(), display: "grid", gap: 8 }}>
                    <strong>{side === "right" ? "OD / Right" : "OS / Left"}</strong>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                      {eyeInputs.map(({ key, label, required }) => (
                        <label key={key} style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
                          {label}{required ? " *" : ""}
                          <input value={lensCorrectionModal[side][key]} onChange={(event) => updateEye(side, key, event.target.value)} inputMode={key === "add" ? "text" : "decimal"} style={{ padding: "8px 9px", borderRadius: 5 }} />
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10, marginTop: 12 }}>
                <label style={{ display: "grid", gap: 5, fontWeight: 700 }}>
                  Physical packs allocated to OD
                  <input value={lensCorrectionModal.rightBoxes} inputMode="numeric" onChange={(event) => setLensCorrectionModal((current) => current ? { ...current, rightBoxes: event.target.value, error: null } : current)} style={{ padding: "9px 10px", borderRadius: 6 }} />
                </label>
                <label style={{ display: "grid", gap: 5, fontWeight: 700 }}>
                  Physical packs allocated to OS
                  <input value={lensCorrectionModal.leftBoxes} inputMode="numeric" onChange={(event) => setLensCorrectionModal((current) => current ? { ...current, leftBoxes: event.target.value, error: null } : current)} style={{ padding: "9px 10px", borderRadius: 6 }} />
                </label>
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "start", marginTop: 12, fontSize: 12, lineHeight: 1.35 }}>
                <input
                  type="checkbox"
                  checked={lensCorrectionModal.sharedPackForBothEyes}
                  onChange={(event) => setLensCorrectionModal((current) => current ? { ...current, sharedPackForBothEyes: event.target.checked, rightBoxes: event.target.checked ? "1" : current.rightBoxes, leftBoxes: event.target.checked ? "0" : current.leftBoxes, error: null } : current)}
                />
                <span><strong>One shared pack covers both identical prescriptions.</strong> This requires identical OD/OS parameters and records exactly one physical box total (OD 1, OS 0).</span>
              </label>
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                <label style={{ display: "grid", gap: 5, fontWeight: 700 }}>
                  Correction reason *
                  <textarea
                    value={lensCorrectionModal.reason}
                    maxLength={500}
                    onChange={(event) => setLensCorrectionModal((current) => current ? { ...current, reason: event.target.value, error: null } : current)}
                    placeholder="Verified prescription required a different lens; customer approved substitution."
                    style={{ minHeight: 70, padding: "9px 10px", borderRadius: 6 }}
                  />
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "start", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={lensCorrectionModal.customerApprovedSubstitution}
                    onChange={(event) => setLensCorrectionModal((current) => current ? { ...current, customerApprovedSubstitution: event.target.checked, error: null } : current)}
                  />
                  <span>Customer approved this substitution.</span>
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "start", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={lensCorrectionModal.paymentAlreadyCaptured}
                    onChange={(event) => setLensCorrectionModal((current) => current ? { ...current, paymentAlreadyCaptured: event.target.checked, error: null } : current)}
                  />
                  <span>Payment was already captured externally/in Stripe. This records the fact only; it does not call Stripe.</span>
                </label>
                {lensCorrectionModal.paymentAlreadyCaptured && (
                  <label style={{ display: "grid", gap: 5, fontWeight: 700 }}>
                    Actual historical captured amount ($) *
                    <input
                      value={lensCorrectionModal.capturedAmount}
                      inputMode="decimal"
                      onChange={(event) => setLensCorrectionModal((current) => current ? { ...current, capturedAmount: event.target.value, error: null } : current)}
                      style={{ padding: "9px 10px", borderRadius: 6 }}
                    />
                  </label>
                )}
                <label style={{ display: "flex", gap: 8, alignItems: "start", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={lensCorrectionModal.supplierOrderAlreadyPlaced}
                    onChange={(event) => setLensCorrectionModal((current) => current ? { ...current, supplierOrderAlreadyPlaced: event.target.checked, error: null } : current)}
                  />
                  <span>Supplier/manufacturer order was already placed manually. This marks fulfillment ordered; it does not submit or re-submit anything.</span>
                </label>
              </div>
              {lensCorrectionModal.error && <div style={{ color: "#fca5a5", fontWeight: 700, marginTop: 12 }}>{lensCorrectionModal.error}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                <button style={buttonStyle()} onClick={() => setLensCorrectionModal(null)}>Cancel</button>
                <button style={buttonStyle({ background: "rgba(20,184,166,0.25)" })} onClick={saveLensCorrection} disabled={savingOrderId === lensCorrectionModal.orderId}>
                  {savingOrderId === lensCorrectionModal.orderId ? "Saving..." : "Record correction"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
                  data-ph-block-replay="true"
                  data-sensitive-media="true"
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
                  data-ph-block-replay="true"
                  data-sensitive-media="true"
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
