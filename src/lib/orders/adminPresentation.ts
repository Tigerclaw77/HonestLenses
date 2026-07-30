import {
  getVerificationState,
} from "./getNextAction";

export type AdminExceptionBadgeTone =
  | "warning"
  | "info"
  | "refund";

export type AdminExceptionBadge = {
  label: string;
  tone: AdminExceptionBadgeTone;
  title: string;
};

export type AdminPresentationOrder = {
  status?: string | null;
  payment_status?: string | null;
  stripe_payment_intent_status?: string | null;
  payment_intent_id?: string | null;
  verification_status?: string | null;
  fulfillment_status?: string | null;
  shipping_method?: string | null;
  adjusted_right_box_count?: number | null;
  adjusted_left_box_count?: number | null;
  adjusted_total_box_count?: number | null;
  admin_notes?: string | null;
  email_delivery_status?: string | null;
  email_delivery_requires_attention?: boolean | null;
};

function hasQuantityAdjustment(order: AdminPresentationOrder): boolean {
  return [
    order.adjusted_right_box_count,
    order.adjusted_left_box_count,
    order.adjusted_total_box_count,
  ].every((value) => typeof value === "number" && Number.isFinite(value));
}

export function getAdminExceptionBadges(
  order: AdminPresentationOrder,
): AdminExceptionBadge[] {
  const badges: AdminExceptionBadge[] = [];
  const notes = order.admin_notes?.trim() ?? "";

  if (order.shipping_method === "express") {
    badges.push({
      label: "EXPRESS",
      tone: "warning",
      title: "Express shipping",
    });
  }

  const verification = getVerificationState(order);
  if (verification.requiresReview) {
    badges.push({
      label: "MANUAL REVIEW",
      tone: "warning",
      title: verification.label,
    });
  }

  if (order.fulfillment_status === "hold") {
    badges.push({
      label: "HOLD",
      tone: "warning",
      title: "Order is on hold",
    });
  }

  if (hasQuantityAdjustment(order)) {
    badges.push({
      label: "QUANTITY ADJUSTED",
      tone: "info",
      title: "Order quantity differs from the customer submission",
    });
  }

  if (/\brefund pending\b|\breturn\/refund started\b/i.test(notes)) {
    badges.push({
      label: "REFUND PENDING",
      tone: "refund",
      title: "A refund or return is in progress",
    });
  }

  if (/\b(?:supplier|armory) exception\b/i.test(notes)) {
    badges.push({
      label: "SUPPLIER EXCEPTION",
      tone: "warning",
      title: "Supplier workflow requires founder attention",
    });
  }

  return badges;
}
