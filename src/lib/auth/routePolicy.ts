export type RouteAccessClass =
  | "public"
  | "authenticated"
  | "customer-owned"
  | "admin"
  | "internal"
  | "webhook"
  | "capability";

export type RoutePolicy = {
  access: RouteAccessClass;
  guard: string;
};

export const ROUTE_AUTHORIZATION_POLICY: Record<string, RoutePolicy> = {
  "src/app/admin/orders/image-url/route.ts": {
    access: "admin",
    guard: "requireAdmin",
  },
  "src/app/api/abandonment-feedback/eligibility/route.ts": {
    access: "customer-owned",
    guard: "requireOrderAccess",
  },
  "src/app/api/abandonment-feedback/shown/route.ts": {
    access: "customer-owned",
    guard: "requireOrderAccess",
  },
  "src/app/api/abandonment-feedback/submit/route.ts": {
    access: "customer-owned",
    guard: "requireOrderAccess",
  },
  "src/app/api/admin/abandoned-checkouts/[id]/route.ts": {
    access: "admin",
    guard: "requireAdmin",
  },
  "src/app/api/admin/catalog/families/[coreId]/route.ts": {
    access: "admin",
    guard: "requireAdmin",
  },
  "src/app/api/admin/catalog/families/route.ts": {
    access: "admin",
    guard: "requireAdmin",
  },
  "src/app/api/admin/catalog/images/route.ts": {
    access: "admin",
    guard: "requireAdmin",
  },
  "src/app/api/admin/orders/[id]/route.ts": {
    access: "admin",
    guard: "requireAdmin",
  },
  "src/app/api/admin/orders/[id]/verification-attempt/route.ts": {
    access: "admin",
    guard: "requireAdmin",
  },
  "src/app/api/admin/orders/adjust-capture-amount/route.ts": {
    access: "admin",
    guard: "requireAdmin",
  },
  "src/app/api/admin/orders/adjust-order-quantity/route.ts": {
    access: "admin",
    guard: "requireAdmin",
  },
  "src/app/api/admin/orders/correct-lens/route.ts": {
    access: "admin",
    guard: "requireAdmin",
  },
  "src/app/api/admin/orders/route.ts": {
    access: "admin",
    guard: "requireAdmin",
  },
  "src/app/api/admin/system-health/route.ts": {
    access: "admin",
    guard: "requireAdmin",
  },
  "src/app/api/armory/orders/route.ts": {
    access: "internal",
    guard: "signedRequest",
  },
  "src/app/api/armory/operator-alert/route.ts": {
    access: "internal",
    guard: "bearerToken",
  },
  "src/app/api/cart/has-items/route.ts": {
    access: "customer-owned",
    guard: "requireOrderAccess",
  },
  "src/app/api/cart/resolve/route.ts": {
    access: "customer-owned",
    guard: "requireOrderAccess",
  },
  "src/app/api/cart/route.ts": {
    access: "customer-owned",
    guard: "requireOrderAccess",
  },
  "src/app/api/catalog/lenses/route.ts": {
    access: "public",
    guard: "none",
  },
  "src/app/api/checkout/authorized/route.ts": {
    access: "customer-owned",
    guard: "requireOrderAccess",
  },
  "src/app/api/checkout/pay/route.ts": {
    access: "customer-owned",
    guard: "requireOrderAccess",
  },
  "src/app/api/checkout/return/route.ts": {
    access: "customer-owned",
    guard: "requireOrderAccess",
  },
  "src/app/api/internal/commerce/reconcile/route.ts": {
    access: "internal",
    guard: "requireInternalScope",
  },
  "src/app/api/order-recovery/current/route.ts": {
    access: "customer-owned",
    guard: "requireOrderAccess",
  },
  "src/app/api/order-recovery/email/route.ts": {
    access: "public",
    guard: "rateLimit",
  },
  "src/app/api/orders/[id]/archive/route.ts": {
    access: "admin",
    guard: "requireAdmin",
  },
  "src/app/api/orders/[id]/cancel/route.ts": {
    access: "customer-owned",
    guard: "requireUserOwnership",
  },
  "src/app/api/orders/[id]/route.ts": {
    access: "customer-owned",
    guard: "requireOrderAccess",
  },
  "src/app/api/orders/[id]/rx/route.ts": {
    access: "customer-owned",
    guard: "requireOrderAccess",
  },
  "src/app/api/orders/[id]/rx-ocr/route.ts": {
    access: "customer-owned",
    guard: "requireOrderAccess",
  },
  "src/app/api/orders/[id]/shipping/route.ts": {
    access: "customer-owned",
    guard: "requireOrderAccess",
  },
  "src/app/api/orders/[id]/verify/route.ts": {
    access: "admin",
    guard: "requireAdmin",
  },
  "src/app/api/orders/list/route.ts": {
    access: "authenticated",
    guard: "requireUser",
  },
  "src/app/api/orders/route.ts": {
    access: "public",
    guard: "rateLimitedGuestCreate",
  },
  "src/app/api/prescription-handoffs/route.ts": {
    access: "customer-owned",
    guard: "requireOrderAccess",
  },
  "src/app/api/prescription-handoffs/[id]/route.ts": {
    access: "customer-owned",
    guard: "requireOrderAccess",
  },
  "src/app/api/prescription-handoffs/mobile/status/route.ts": {
    access: "capability",
    guard: "expiringPrescriptionHandoffToken",
  },
  "src/app/api/prescription-handoffs/mobile/upload/route.ts": {
    access: "capability",
    guard: "singleUsePrescriptionHandoffToken",
  },
  "src/app/api/resolve-lens/route.ts": {
    access: "public",
    guard: "rateLimit",
  },
  "src/app/api/verification/complete/route.ts": {
    access: "internal",
    guard: "requireInternalScope",
  },
  "src/app/api/verification/details/route.ts": {
    access: "customer-owned",
    guard: "requireOrderAccess",
  },
  "src/app/api/verification/process/route.ts": {
    access: "internal",
    guard: "requireInternalScope",
  },
  "src/app/api/verification/send/route.ts": {
    access: "customer-owned",
    guard: "requireOrderAccess",
  },
  "src/app/api/webhooks/resend/route.ts": {
    access: "webhook",
    guard: "svixSignature",
  },
  "src/app/api/webhooks/stripe/route.ts": {
    access: "webhook",
    guard: "stripeSignature",
  },
  "src/app/contacts/compare/[slug]/route.ts": {
    access: "public",
    guard: "none",
  },
  "src/app/order/[id]/receipt/route.ts": {
    access: "customer-owned",
    guard: "requireOrderAccess",
  },
  "src/app/resume-order/accept/route.ts": {
    access: "capability",
    guard: "singleUseResumeToken",
  },
};
