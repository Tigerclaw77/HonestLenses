export const POSTHOG_EVENTS = {
  HOMEPAGE_VIEWED: "homepage_viewed",
  BROWSE_VIEWED: "browse_viewed",
  VIEWED_PRODUCT: "viewed_product",
  PRODUCT_MODAL_OPENED: "product_modal_opened",
  PRODUCT_IMAGE_MISSING: "product_image_missing",
  VIEWED_BRAND: "viewed_brand",
  SEARCHED_LENS: "searched_lens",

  ADDED_TO_CART: "added_to_cart",
  REMOVED_FROM_CART: "removed_from_cart",
  CART_QUANTITY_CHANGED: "cart_quantity_changed",
  SHIPPING_METHOD_SELECTED: "shipping_method_selected",
  EXPRESS_SHIPPING_SELECTED: "express_shipping_selected",
  CHECKOUT_SHIPPING_UPDATED: "checkout_shipping_updated",

  CHECKOUT_STARTED: "checkout_started",
  PAYMENT_INTENT_CREATED: "payment_intent_created",
  ORDER_AUTHORIZED: "order_authorized",
  ORDER_CAPTURED: "order_captured",
  RX_METHOD_SELECTED: "rx_method_selected",
  UPLOAD_PRESCRIPTION_VIEWED: "upload_prescription_viewed",
  RX_UPLOAD_STARTED: "rx_upload_started",
  RX_UPLOAD_COMPLETED: "rx_upload_completed",
  RX_UPLOAD_FAILED: "rx_upload_failed",
  LOGIN_REDIRECT_STARTED: "login_redirect_started",
  AUTH_CALLBACK_RECEIVED: "auth_callback_received",
  AUTH_SESSION_RESTORED: "auth_session_restored",
  UPLOAD_RESUME_AFTER_AUTH: "upload_resume_after_auth",
  DOCTOR_INFO_ENTERED: "doctor_info_entered",
  PAYMENT_STARTED: "payment_started",
  PAYMENT_AUTHORIZED: "payment_authorized",
  PAYMENT_SUCCEEDED: "payment_succeeded",
  PAYMENT_FAILED: "payment_failed",
  ORDER_SUCCESS_VIEWED: "order_success_viewed",

  OCR_FAILED: "OCR_failed",
  VALIDATION_ERROR: "validation_error",
  SHIPPING_CALCULATION_ERROR: "shipping_calculation_error",
  ABANDONED_CHECKOUT: "abandoned_checkout",
  ABANDONED_CHECKOUT_DETECTED: "abandoned_checkout_detected",
  ABANDONED_CHECKOUT_ARCHIVED: "abandoned_checkout_archived",
  RECOVERY_EMAIL_DRAFTED: "recovery_email_drafted",

  API_ROUTE_FAILED: "api_route_failed",
  CLIENT_ERROR: "client_error",
  CHECKOUT_STEP_TIMED: "checkout_step_timed",
} as const;

export type PostHogEventName =
  (typeof POSTHOG_EVENTS)[keyof typeof POSTHOG_EVENTS];

export type AnalyticsPropertyValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export type AnalyticsProperties = Record<string, AnalyticsPropertyValue>;

const SENSITIVE_KEY_PATTERNS = [
  /email/i,
  /phone/i,
  /address/i,
  /dob/i,
  /birth/i,
  /patient/i,
  /prescriber/i,
  /doctor/i,
  /name/i,
  /rx_/i,
  /sphere/i,
  /cyl/i,
  /axis/i,
  /base_curve/i,
];

const NON_SENSITIVE_KEY_ALLOWLIST = new Set([
  "lens_name",
  "product_name",
  "display_name",
  "manufacturer_name",
]);

export function isSensitiveAnalyticsKey(key: string): boolean {
  if (NON_SENSITIVE_KEY_ALLOWLIST.has(key)) return false;
  if (key.startsWith("has_")) return false;
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function sanitizeAnalyticsProperties(
  properties: AnalyticsProperties = {},
): AnalyticsProperties {
  const safe: AnalyticsProperties = {};

  for (const [key, value] of Object.entries(properties)) {
    if (isSensitiveAnalyticsKey(key)) {
      safe[key] = "[redacted]";
    } else {
      safe[key] = value;
    }
  }

  return safe;
}

export function errorToAnalyticsProperties(
  error: unknown,
): AnalyticsProperties {
  if (error instanceof Error) {
    return {
      error_name: error.name,
      error_message: error.message,
    };
  }

  return {
    error_message: String(error),
  };
}
