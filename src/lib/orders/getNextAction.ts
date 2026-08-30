import {
  projectPaymentState,
  type PaymentLifecycleStatus,
} from "./paymentState";
import type { EmailDeliveryIssue } from "./emailDeliveryIssue";

export type NextActionSeverity = "info" | "warning" | "success";

export type NextAction = {
  label: string;
  severity: NextActionSeverity;
};

export type { PaymentLifecycleStatus };

export type PaymentState = {
  status: PaymentLifecycleStatus;
  label: string;
  severity: NextActionSeverity;
};

type FulfillmentStatus =
  | "review"
  | "ready_to_order"
  | "ordered"
  | "shipped"
  | "completed"
  | "hold"
  | "cancelled";

export type Order = {
  status?: string | null;
  payment_status?: string | null;
  fulfillment_status?: string | null;
  verification_status?: string | null;
  rx_status?: string | null;
  rx_source?: string | null;
  rx?: unknown;
  rx_upload_path?: string | null;
  prescriber_name?: string | null;
  prescriber_email?: string | null;
  prescriber_phone?: string | null;
  payment_intent_id?: string | null;
  archived?: boolean | null;
  archived_at?: string | null;
  stripe_payment_intent_status?: string | null;
  email_delivery_status?: string | null;
  email_delivery_requires_attention?: boolean | null;
  email_delivery_issue?: EmailDeliveryIssue | null;
};

export type VerificationLifecycleStatus =
  | "not_required"
  | "pending"
  | "information_needed"
  | "requires_review"
  | "verified"
  | "passive_verified"
  | "doctor_confirmed"
  | "rejected"
  | "blocked"
  | "unknown";

export type VerificationState = {
  status: VerificationLifecycleStatus;
  label: string;
  severity: NextActionSeverity;
  complete: boolean;
  blocked: boolean;
  requiresReview: boolean;
  rawStatus: string | null;
};

export type RxSourceStatus =
  | "missing"
  | "manual_entry"
  | "ocr_upload"
  | "uploaded_file"
  | "doctor_verification"
  | "unknown_legacy";

export type RxSourceState = {
  status: RxSourceStatus;
  label: string;
  hasUpload: boolean;
  hasStructuredRx: boolean;
  hasPrescriberPath: boolean;
  hasRxEvidence: boolean;
};

const VERIFIED_STATUSES = new Set([
  "verified",
  "auto_verified",
  "manual_verified",
  "ocr_verified",
  "upload_verified",
  "passive_verified",
  "doctor_confirmed",
  "altered",
]);

const REVIEW_STATUSES = new Set(["requires_review", "flagged"]);

const RX_DETAIL_KEYS = [
  "coreId",
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
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function hasStructuredRx(rx: unknown): boolean {
  if (!isRecord(rx)) return false;

  const right = rx.right;
  const left = rx.left;
  const hasEyeData = (eye: unknown): boolean =>
    isRecord(eye) && RX_DETAIL_KEYS.some((key) => hasValue(eye[key]));

  return Boolean(hasEyeData(right) || hasEyeData(left));
}

function hasPrescriberPath(order: Order): boolean {
  return Boolean(
    order.prescriber_name || order.prescriber_email || order.prescriber_phone,
  );
}

function normalizeFulfillmentStatus(order: Order): FulfillmentStatus {
  if (
    order.fulfillment_status === "review" ||
    order.fulfillment_status === "ready_to_order" ||
    order.fulfillment_status === "ordered" ||
    order.fulfillment_status === "shipped" ||
    order.fulfillment_status === "completed" ||
    order.fulfillment_status === "hold" ||
    order.fulfillment_status === "cancelled"
  ) {
    return order.fulfillment_status;
  }

  if (order.status === "completed") return "completed";
  if (order.status === "shipped") return "shipped";
  if (order.status === "cancelled") return "cancelled";
  return "review";
}

export function getPaymentState(order: Order): PaymentState {
  const status = projectPaymentState(order, { fallback: "strict" }).status;

  const labels: Record<PaymentLifecycleStatus, string> = {
    draft: "Draft",
    authorized: "Authorized",
    captured: "Captured",
    refunded: "Refunded",
    cancelled: "Cancelled",
    failed: "Failed",
  };

  const severities: Record<PaymentLifecycleStatus, NextActionSeverity> = {
    draft: "info",
    authorized: "warning",
    captured: "success",
    refunded: "info",
    cancelled: "info",
    failed: "warning",
  };

  return {
    status,
    label: labels[status],
    severity: severities[status],
  };
}

export function getVerificationState(order: Order): VerificationState {
  const rawStatus = order.verification_status?.trim().toLowerCase() || null;

  if (rawStatus === "not_required") {
    return {
      status: "not_required",
      label: "Not Required",
      severity: "info",
      complete: true,
      blocked: false,
      requiresReview: false,
      rawStatus,
    };
  }

  if (rawStatus === "passive_verified") {
    return {
      status: "passive_verified",
      label: "Passive Verified",
      severity: "success",
      complete: true,
      blocked: false,
      requiresReview: false,
      rawStatus,
    };
  }

  if (rawStatus === "doctor_confirmed") {
    return {
      status: "doctor_confirmed",
      label: "Doctor Confirmed",
      severity: "success",
      complete: true,
      blocked: false,
      requiresReview: false,
      rawStatus,
    };
  }

  if (VERIFIED_STATUSES.has(rawStatus ?? "")) {
    return {
      status: "verified",
      label: "Verified",
      severity: "success",
      complete: true,
      blocked: false,
      requiresReview: false,
      rawStatus,
    };
  }

  if (REVIEW_STATUSES.has(rawStatus ?? "")) {
    return {
      status: "requires_review",
      label: "Needs Review",
      severity: "warning",
      complete: false,
      blocked: false,
      requiresReview: true,
      rawStatus,
    };
  }

  if (
    rawStatus === "information_needed" ||
    rawStatus === "verification_information_needed"
  ) {
    return {
      status: "information_needed",
      label: "Information Needed",
      severity: "warning",
      complete: false,
      blocked: false,
      requiresReview: false,
      rawStatus,
    };
  }

  if (rawStatus === "rejected") {
    return {
      status: "rejected",
      label: "Rejected",
      severity: "warning",
      complete: false,
      blocked: true,
      requiresReview: false,
      rawStatus,
    };
  }

  if (rawStatus === "blocked") {
    return {
      status: "blocked",
      label: "Blocked",
      severity: "warning",
      complete: false,
      blocked: true,
      requiresReview: false,
      rawStatus,
    };
  }

  if (!rawStatus || rawStatus === "pending") {
    return {
      status: "pending",
      label: "Pending",
      severity: "warning",
      complete: false,
      blocked: false,
      requiresReview: false,
      rawStatus,
    };
  }

  return {
    status: "unknown",
    label: "Unknown Legacy",
    severity: "warning",
    complete: false,
    blocked: false,
    requiresReview: false,
    rawStatus,
  };
}

export function getRxSourceState(order: Order): RxSourceState {
  const rawSource = order.rx_source?.trim().toLowerCase() ?? "";
  const hasUpload = Boolean(order.rx_upload_path);
  const hasStructured = hasStructuredRx(order.rx);
  const hasPrescriber = hasPrescriberPath(order);
  const hasOcrDetail =
    order.rx_status === "ocr_complete" || order.rx_status === "ocr_failed";
  const hasLegacyPrescriptionDetail =
    order.rx_status === "valid" ||
    order.rx_status === "expired" ||
    order.rx_status === "ocr_complete";
  const hasOcrSource = rawSource === "ocr" || rawSource === "ocr_upload";
  if (hasUpload && (hasOcrSource || hasOcrDetail)) {
    return {
      status: "ocr_upload",
      label: "OCR Upload",
      hasUpload,
      hasStructuredRx: hasStructured,
      hasPrescriberPath: hasPrescriber,
      hasRxEvidence: true,
    };
  }

  if (hasUpload) {
    return {
      status: "uploaded_file",
      label: "Rx File Available",
      hasUpload,
      hasStructuredRx: hasStructured,
      hasPrescriberPath: hasPrescriber,
      hasRxEvidence: true,
    };
  }

  if (hasStructured) {
    return {
      status: "manual_entry",
      label: "Manual Rx Entry",
      hasUpload,
      hasStructuredRx: hasStructured,
      hasPrescriberPath: hasPrescriber,
      hasRxEvidence: true,
    };
  }

  if (hasPrescriber) {
    return {
      status: "doctor_verification",
      label: "Doctor Verification Flow",
      hasUpload,
      hasStructuredRx: hasStructured,
      hasPrescriberPath: hasPrescriber,
      hasRxEvidence: true,
    };
  }

  if (rawSource) {
    return {
      status: "unknown_legacy",
      label: "Unknown Legacy Rx",
      hasUpload,
      hasStructuredRx: hasStructured,
      hasPrescriberPath: hasPrescriber,
      hasRxEvidence: hasLegacyPrescriptionDetail,
    };
  }

  if (hasLegacyPrescriptionDetail) {
    return {
      status: "unknown_legacy",
      label: "Unknown Legacy Rx",
      hasUpload,
      hasStructuredRx: hasStructured,
      hasPrescriberPath: hasPrescriber,
      hasRxEvidence: true,
    };
  }

  return {
    status: "missing",
    label: "Missing Rx Path",
    hasUpload,
    hasStructuredRx: hasStructured,
    hasPrescriberPath: hasPrescriber,
    hasRxEvidence: false,
  };
}

export function getNextAction(order: Order): NextAction {
  if (order.archived || order.archived_at) {
    return { label: "Archived", severity: "success" };
  }

  if (order.email_delivery_issue?.kind === "prescriber") {
    return { label: "Correct prescriber email", severity: "warning" };
  }

  if (order.email_delivery_issue?.kind === "customer" || hasEmailDeliveryAttention(order)) {
    return { label: "Correct customer email", severity: "warning" };
  }

  const payment = getPaymentState(order);
  const verification = getVerificationState(order);
  const rxSource = getRxSourceState(order);
  const fulfillment = normalizeFulfillmentStatus(order);

  if (fulfillment === "completed") {
    return { label: "Order complete", severity: "success" };
  }

  if (fulfillment === "cancelled") {
    return { label: "Order cancelled", severity: "info" };
  }

  if (
    payment.status === "failed" ||
    payment.status === "cancelled"
  ) {
    return { label: "Wait for customer", severity: "info" };
  }

  if (payment.status === "refunded") {
    return { label: "Refunded", severity: "info" };
  }

  if (fulfillment === "hold") {
    return { label: "Resolve hold", severity: "warning" };
  }

  if (verification.blocked) {
    return { label: "Resolve verification issue", severity: "warning" };
  }

  if (
    order.rx_upload_path &&
    verification.status === "pending" &&
    !verification.complete
  ) {
    return { label: "Review uploaded prescription", severity: "warning" };
  }

  if (order.rx_status === "expired") {
    return { label: "Request valid prescription", severity: "warning" };
  }

  if (order.rx_status === "ocr_failed") {
    return { label: "Review prescription", severity: "warning" };
  }

  if (verification.status === "information_needed") {
    return { label: "Request prescription details", severity: "warning" };
  }

  if (!rxSource.hasRxEvidence) {
    return payment.status === "draft"
      ? { label: "Await checkout", severity: "info" }
      : { label: "Request prescription details", severity: "warning" };
  }

  if (verification.requiresReview) {
    return { label: "Review prescription", severity: "warning" };
  }

  if (!verification.complete) {
    return rxSource.status === "doctor_verification"
      ? { label: "Await doctor verification", severity: "info" }
      : { label: "Verify prescription", severity: "warning" };
  }

  if (payment.status === "draft") {
    return { label: "Await checkout", severity: "info" };
  }

  if (payment.status === "authorized") {
    return { label: "Capture payment", severity: "warning" };
  }

  if (fulfillment === "ordered") {
    return { label: "Manufacturer order placed", severity: "success" };
  }

  if (fulfillment === "shipped") {
    return { label: "Manufacturer order placed", severity: "success" };
  }

  return { label: "Place with manufacturer/distributor", severity: "warning" };
}

const EMAIL_ATTENTION_STATUSES = new Set([
  "bounced",
  "complained",
  "failed",
  "suppressed",
]);

export function hasEmailDeliveryAttention(order: Order): boolean {
  if (order.email_delivery_issue !== undefined) {
    return order.email_delivery_issue !== null;
  }
  return Boolean(
    order.email_delivery_requires_attention ||
      EMAIL_ATTENTION_STATUSES.has(
        order.email_delivery_status?.trim().toLowerCase() ?? "",
      ),
  );
}
