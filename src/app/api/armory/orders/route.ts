export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getArmoryOrderRouting } from "@/lib/orders/armoryRouting";
import { getRxSourceState, getVerificationState } from "@/lib/orders/getNextAction";
import { projectOrderCommerce } from "@/lib/orders/orderCommerce";
import { projectPaymentState } from "@/lib/orders/paymentState";
import { deriveTotalMonths } from "@/lib/shipping";
import { supabaseServer } from "@/lib/supabase-server";
import { hasValidSignedRequest } from "@/lib/security/signedRequest";
import {
  enforceRateLimit,
  rateLimitErrorResponse,
} from "@/lib/security/rateLimit";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;
const DEFAULT_TIME_ZONE = "America/Chicago";
const READ_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "x-hl-signature, x-hl-timestamp",
};

const ORDER_FIELDS = [
  "id",
  "created_at",
  "updated_at",
  "status",
  "verification_status",
  "fulfillment_status",
  "rx_status",
  "rx_upload_path",
  "prescriber_name",
  "prescriber_email",
  "prescriber_phone",
  "payment_intent_id",
  "admin_notes",
  "archived_at",
  "passive_deadline_at",
  "total_amount_cents",
  "feedback_credit_cents",
  "capture_amount_cents",
  "currency",
  "shipping_method",
  "shipping_email",
  "shipping_phone",
  "shipping_first_name",
  "shipping_last_name",
  "shipping_address1",
  "shipping_address2",
  "shipping_city",
  "shipping_state",
  "shipping_zip",
  "patient_name",
  "patient_full_name",
  "patient_first_name",
  "patient_middle_name",
  "patient_last_name",
  "patient_dob",
  "manufacturer",
  "sku",
  "rx",
  "rx_lens_brand",
  "box_count",
  "total_box_count",
  "right_box_count",
  "left_box_count",
  "adjusted_total_box_count",
  "adjusted_right_box_count",
  "adjusted_left_box_count",
].join(",");

type OrderRow = {
  id: string;
  created_at: string;
  updated_at?: string | null;
  status?: string | null;
  verification_status?: string | null;
  fulfillment_status?: string | null;
  rx_status?: string | null;
  rx_upload_path?: string | null;
  prescriber_name?: string | null;
  prescriber_email?: string | null;
  prescriber_phone?: string | null;
  payment_intent_id?: string | null;
  archived_at?: string | null;
  admin_notes?: string | null;
  passive_deadline_at?: string | null;
  total_amount_cents?: number | null;
  feedback_credit_cents?: number | null;
  capture_amount_cents?: number | null;
  currency?: string | null;
  shipping_method?: string | null;
  shipping_email?: string | null;
  shipping_phone?: string | null;
  shipping_first_name?: string | null;
  shipping_last_name?: string | null;
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
  patient_dob?: string | null;
  manufacturer?: string | null;
  sku?: string | null;
  rx?: unknown;
  rx_lens_brand?: string | null;
  box_count?: number | null;
  total_box_count?: number | null;
  right_box_count?: number | null;
  left_box_count?: number | null;
  adjusted_total_box_count?: number | null;
  adjusted_right_box_count?: number | null;
  adjusted_left_box_count?: number | null;
};

export async function GET(request: Request) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const signingSecret = process.env.ARMORY_SIGNING_SECRET;

  if (!signingSecret || signingSecret.trim().length < 32) {
    logAccess({ requestId, outcome: "server_not_configured", startedAt });
    return json({ error: "Armory order bridge is not configured." }, 503);
  }

  if (!hasValidSignedRequest(request, signingSecret)) {
    logAccess({ requestId, outcome: "unauthorized", startedAt });
    return json({ error: "Unauthorized" }, 401);
  }

  const rateLimit = await enforceRateLimit(request, {
    scope: "armory-orders-read",
    limit: 60,
    windowSeconds: 60,
  });
  if (!rateLimit.allowed) return rateLimitErrorResponse(rateLimit);

  const limit = configuredLimit(process.env.ARMORY_ORDER_READ_LIMIT);
  const cursor = new URL(request.url).searchParams.get("cursor");
  let query = supabaseServer
    .from("orders")
    .select(ORDER_FIELDS, { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (cursor) {
    const cursorDate = new Date(cursor);
    if (Number.isNaN(cursorDate.getTime())) {
      return json({ error: "Invalid cursor." }, 400);
    }
    query = query.lt("created_at", cursorDate.toISOString());
  }
  const { data, error, count } = await query;

  if (error) {
    logAccess({
      requestId,
      outcome: "read_failed",
      startedAt,
      errorCode: error.code || "unknown",
    });
    return json({ error: "Unable to read Honest Lenses orders." }, 502);
  }

  const orders = ((data || []) as unknown as OrderRow[]).map(toArmoryOrder);
  const timeZone = process.env.ARMORY_BUSINESS_TIME_ZONE || DEFAULT_TIME_ZONE;
  const revenueTodayCents = calculateRevenueToday(orders, timeZone);

  logAccess({
    requestId,
    outcome: "read_success",
    startedAt,
    returnedCount: orders.length,
    totalCount: count ?? orders.length,
  });

  return json({
    orders,
    revenueTodayCents,
    currency: orders.find((order) => order.currency)?.currency || "USD",
    meta: {
      readOnly: true,
      totalCount: count ?? orders.length,
      returnedCount: orders.length,
      nextCursor:
        orders.length === limit
          ? orders[orders.length - 1]?.placedAt ?? null
          : null,
      generatedAt: new Date().toISOString(),
    },
  });
}

function toArmoryOrder(row: OrderRow) {
  const rx = asObject(row.rx);
  const right = asObject(rx.right || rx.od || rx.OD);
  const left = asObject(rx.left || rx.os || rx.OS);
  const commerce = projectOrderCommerce(row);
  const quantities = commerce.quantity;
  const rightBoxes = quantities.right;
  const leftBoxes = quantities.left;
  const totalBoxes = quantities.total;
  const durationMonths = deriveTotalMonths({
    sku: row.sku,
    totalBoxes: totalBoxes || 0,
    right_box_count: rightBoxes,
    left_box_count: leftBoxes,
  }) || null;
  const paymentStatus = projectPaymentState(row, {
    fallback: "status_authorized",
  }).status;
  const fulfillmentStatus = normalizeStatus(row.fulfillment_status);
  const patientFullName = firstString(
    row.patient_full_name,
    row.patient_name,
    joinName(row.patient_first_name, row.patient_middle_name, row.patient_last_name),
  );
  const productName = firstString(
    row.rx_lens_brand,
    rx.lens_brand,
    rx.brand,
    asObject(rx.right).brand,
    asObject(rx.left).brand,
    row.manufacturer,
    row.sku,
  );
  const lifecycleOrder = {
    ...row,
    payment_status: paymentStatus,
  };
  const armoryRouting = getArmoryOrderRouting(lifecycleOrder);
  const adminQueue = armoryRouting.classification;
  const verification = getVerificationState(lifecycleOrder);
  const rxSource = getRxSourceState(lifecycleOrder);
  const completeness = dataCompleteness({
    row,
    productName,
    right,
    left,
    totalBoxes,
    durationMonths,
    hasRxEvidence: rxSource.hasRxEvidence,
  });
  const flags = operationalFlags({
    row,
    paymentStatus,
    verificationComplete: verification.complete,
    hasRxEvidence: rxSource.hasRxEvidence,
    terminal: adminQueue.bucket === "history_archive",
    testOrder: adminQueue.bucket === "draft_or_test",
  });
  const manualReviewReasons = reviewReasons({
    row,
    paymentStatus,
    verificationBlocked: verification.blocked,
    verificationRequiresReview: verification.requiresReview,
    dataComplete: completeness.complete,
    missingFields: completeness.missingFields,
  });
  return {
    orderId: row.id,
    placedAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    lastActivityAt: row.updated_at || row.created_at,
    status: normalizeStatus(row.status),
    paymentStatus,
    verificationStatus: normalizeStatus(row.verification_status),
    fulfillmentStatus,
    shipmentStatus: deriveShipmentStatus(row.status, fulfillmentStatus),
    revenueCents: commerce.billingAmountCents,
    currency: row.currency || "USD",
    customer: {
      firstName: row.shipping_first_name || null,
      lastName: row.shipping_last_name || null,
      email: row.shipping_email || null,
      phone: row.shipping_phone || null,
    },
    patient: {
      firstName: row.patient_first_name || null,
      middleName: row.patient_middle_name || null,
      lastName: row.patient_last_name || null,
      fullName: patientFullName || null,
      dateOfBirth: row.patient_dob || null,
    },
    shippingAddress: {
      line1: row.shipping_address1 || null,
      line2: row.shipping_address2 || null,
      city: row.shipping_city || null,
      state: row.shipping_state || null,
      postalCode: row.shipping_zip || null,
      country: "US",
    },
    manufacturer: row.manufacturer || null,
    product: {
      name: productName || null,
      sku: row.sku || null,
      manufacturer: row.manufacturer || null,
    },
    parameters: {
      od: normalizeEye(right),
      os: normalizeEye(left),
      color: firstValue(right.color, left.color, rx.color) ?? null,
    },
    supply: {
      quantity: totalBoxes,
      unit: "boxes",
      durationMonths,
      annual: typeof durationMonths === "number" && durationMonths >= 12,
      rightBoxes,
      leftBoxes,
    },
    shippingMethod: row.shipping_method || "standard",
    operational: {
      adminBucket: adminQueue.bucket,
      adminReasons: adminQueue.reasons,
      nextAction:
        armoryRouting.lifecycleOwner === "armory" &&
        !armoryRouting.founderActionRequired
          ? "Track supplier lifecycle in Armory"
          : adminQueue.nextActionLabel,
      lifecycleOwner: armoryRouting.lifecycleOwner,
      activeDashboardLane: armoryRouting.activeDashboardLane,
      founderActionRequired: armoryRouting.founderActionRequired,
      founderActionReasons: armoryRouting.founderActionReasons,
      supplierManaged: armoryRouting.lifecycleOwner === "armory",
      terminal: adminQueue.bucket === "history_archive",
      testOrder: adminQueue.bucket === "draft_or_test",
      customerBlocked: adminQueue.bucket === "customer_blocked",
      verificationComplete: verification.complete,
      verificationBlocked: verification.blocked,
      verificationRequiresReview: verification.requiresReview,
      rxEvidenceComplete: rxSource.hasRxEvidence,
      rxSourceStatus: rxSource.status,
      dataComplete: completeness.complete,
      missingFields: completeness.missingFields,
      manualReviewReasons,
      flags,
    },
    source: "honest-lenses-live-order-bridge",
  };
}

function dataCompleteness({
  row,
  productName,
  right,
  left,
  totalBoxes,
  durationMonths,
  hasRxEvidence,
}: {
  row: OrderRow;
  productName: string | null;
  right: Record<string, unknown>;
  left: Record<string, unknown>;
  totalBoxes: number | null;
  durationMonths: number | null;
  hasRxEvidence: boolean;
}) {
  const missingFields: string[] = [];
  const requireValue = (value: unknown, label: string) => {
    if (value === undefined || value === null || value === "") missingFields.push(label);
  };

  requireValue(row.shipping_first_name, "customer.firstName");
  requireValue(row.shipping_last_name, "customer.lastName");
  requireValue(row.shipping_email, "customer.email");
  requireValue(firstString(row.patient_full_name, row.patient_name, joinName(row.patient_first_name, row.patient_last_name)), "patient.name");
  requireValue(row.patient_dob, "patient.dateOfBirth");
  requireValue(row.shipping_address1, "shippingAddress.line1");
  requireValue(row.shipping_city, "shippingAddress.city");
  requireValue(row.shipping_state, "shippingAddress.state");
  requireValue(row.shipping_zip, "shippingAddress.postalCode");
  requireValue(row.manufacturer, "manufacturer");
  requireValue(productName, "product.name");
  requireValue(row.sku, "product.sku");
  requireValue(totalBoxes, "supply.quantity");
  requireValue(durationMonths, "supply.durationMonths");
  if (!hasRxEvidence) missingFields.push("prescription.evidence");
  requireValue(firstValue(right.sphere, right.sph), "parameters.od.sphere");
  requireValue(firstValue(left.sphere, left.sph), "parameters.os.sphere");

  return {
    complete: missingFields.length === 0,
    missingFields,
  };
}

function reviewReasons({
  row,
  paymentStatus,
  verificationBlocked,
  verificationRequiresReview,
  dataComplete,
  missingFields,
}: {
  row: OrderRow;
  paymentStatus: string;
  verificationBlocked: boolean;
  verificationRequiresReview: boolean;
  dataComplete: boolean;
  missingFields: string[];
}) {
  const reasons: string[] = [];
  if (verificationBlocked) reasons.push("verification blocked");
  if (verificationRequiresReview) reasons.push("verification requires review");
  if (row.rx_status === "ocr_failed") reasons.push("OCR prescription read failed");
  if (row.rx_status === "expired") reasons.push("prescription expired");
  if (["authorized", "captured"].includes(paymentStatus) && !dataComplete) {
    reasons.push(`required data incomplete: ${missingFields.join(", ")}`);
  }
  return reasons;
}

function operationalFlags({
  row,
  paymentStatus,
  verificationComplete,
  hasRxEvidence,
  terminal,
  testOrder,
}: {
  row: OrderRow;
  paymentStatus: string;
  verificationComplete: boolean;
  hasRxEvidence: boolean;
  terminal: boolean;
  testOrder: boolean;
}) {
  const flags: Array<{ code: string; reason: string }> = [];
  const notes = String(row.admin_notes || "").toLowerCase();
  const rawStatus = normalizeStatus(row.status);
  const rawFulfillment = normalizeStatus(row.fulfillment_status);
  const add = (code: string, reason: string) => {
    if (!flags.some((flag) => flag.code === code)) flags.push({ code, reason });
  };

  if (rawFulfillment === "backordered" || /\bback[ -]?order/.test(notes)) {
    add("backorder", "order is backordered");
  }
  if (["disputed", "dispute", "chargeback"].includes(rawStatus) || /\b(dispute|chargeback)\b/.test(notes)) {
    add("payment_dispute", "payment dispute or chargeback");
  }
  if (/\bcomplaint\b|\bcustomer question\b|\border question\b/.test(notes)) {
    add("complaint_or_question", "complaint or question linked to order");
  }
  if (/\baddress mismatch\b|\bwrong address\b/.test(notes)) {
    add("address_mismatch", "shipping address mismatch");
  }
  if (normalizeStatus(row.verification_status) === "flagged" || /\b(rx|prescription) mismatch\b|\bwrong rx\b/.test(notes)) {
    add("rx_mismatch", "prescription mismatch");
  }
  if (rawFulfillment === "hold") {
    add("manual_hold", "order is on manual hold");
  }

  const activePayment = ["authorized", "captured"].includes(paymentStatus);
  const activeFulfillment = ["ready_to_order", "ordered", "backordered", "hold"].includes(rawFulfillment);
  if (!terminal && !testOrder && (activePayment || activeFulfillment) && isOlderThanHours(row.updated_at || row.created_at, 24)) {
    add("stalled", "no order activity for more than 24 hours");
  }

  const knownStatuses = ["draft", "authorized", "captured", "paid", "shipped", "completed", "cancelled", "canceled", "refunded", "failed"];
  const knownFulfillment = ["review", "ready_to_order", "ordered", "backordered", "shipped", "delivered", "completed", "hold", "cancelled", "canceled"];
  if (rawStatus && !knownStatuses.includes(rawStatus)) {
    add("unknown_state", `unknown payment/order status: ${rawStatus}`);
  }
  if (rawFulfillment && !knownFulfillment.includes(rawFulfillment)) {
    add("unknown_state", `unknown fulfillment status: ${rawFulfillment}`);
  }
  if (["ordered", "backordered", "shipped", "delivered", "completed"].includes(rawFulfillment) && paymentStatus !== "captured") {
    add("inconsistent_state", "fulfillment progressed without captured payment");
  }
  if (verificationComplete && !hasRxEvidence && activePayment) {
    add("inconsistent_state", "verification is complete but prescription evidence is missing");
  }

  return flags;
}

function isOlderThanHours(value: string | null | undefined, hours: number) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && Date.now() - timestamp > hours * 60 * 60 * 1000;
}

function normalizeEye(eye: Record<string, unknown>) {
  return {
    sphere: firstValue(eye.sphere, eye.sph) ?? null,
    cylinder: firstValue(eye.cylinder, eye.cyl) ?? null,
    axis: firstValue(eye.axis, eye.ax) ?? null,
    add: firstValue(eye.add) ?? null,
    baseCurve: firstValue(eye.baseCurve, eye.base_curve, eye.bc) ?? null,
    diameter: firstValue(eye.diameter, eye.dia) ?? null,
    color: firstValue(eye.color) ?? null,
    coreId: firstValue(eye.coreId, eye.core_id) ?? null,
  };
}

function calculateRevenueToday(
  orders: ReturnType<typeof toArmoryOrder>[],
  timeZone: string,
) {
  const today = localDateKey(new Date(), timeZone);
  return orders
    .filter((order) => order.paymentStatus === "captured")
    .filter((order) => localDateKey(new Date(order.placedAt), timeZone) === today)
    .reduce((sum, order) => sum + (order.revenueCents || 0), 0);
}

function localDateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function deriveShipmentStatus(statusValue: unknown, fulfillmentValue: unknown) {
  const fulfillment = normalizeStatus(fulfillmentValue);
  if (["shipped", "completed", "delivered"].includes(fulfillment)) return fulfillment;
  const status = normalizeStatus(statusValue);
  if (["shipped", "completed", "delivered"].includes(status)) return status;
  return "pending";
}

function configuredLimit(value?: string) {
  const parsed = Number(value || DEFAULT_LIMIT);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: READ_HEADERS });
}

function logAccess({
  requestId,
  outcome,
  startedAt,
  returnedCount,
  totalCount,
  errorCode,
}: {
  requestId: string;
  outcome: string;
  startedAt: number;
  returnedCount?: number;
  totalCount?: number;
  errorCode?: string;
}) {
  console.info("[armory-order-bridge]", {
    requestId,
    outcome,
    durationMs: Date.now() - startedAt,
    returnedCount,
    totalCount,
    errorCode,
  });
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      return asObject(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return {};
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function firstString(...values: unknown[]) {
  const value = values.find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof value === "string" ? value.trim() : null;
}

function joinName(...parts: Array<string | null | undefined>) {
  const value = parts.filter((part): part is string => Boolean(part?.trim())).join(" ");
  return value || null;
}

function normalizeStatus(value: unknown) {
  return String(value || "").trim().toLowerCase();
}
