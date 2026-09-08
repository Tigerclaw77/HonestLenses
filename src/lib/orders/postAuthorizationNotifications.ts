import {
  founderAlertKey,
  type FounderAlertType,
} from "@/lib/founderAlertConfig";
import {
  getFounderVerificationAttention,
  type FounderVerificationAttention,
} from "@/lib/orders/founderVerificationAttention";
import {
  getVerificationReadiness,
  VERIFICATION_INFORMATION_NEEDED_STATUS,
  type VerificationReadinessOrder,
} from "@/lib/orders/verificationReadiness";

export const VERIFICATION_INFORMATION_NEEDED_EMAIL_TYPE =
  "verification_information_needed";

export type PostAuthorizationNotificationOrder = VerificationReadinessOrder & {
  id: string;
  status?: string | null;
  fulfillment_status?: string | null;
  verification_status?: string | null;
  archived?: boolean | null;
  archived_at?: string | null;
  shipping_method?: string | null;
  shipping_first_name?: string | null;
  shipping_last_name?: string | null;
  shipping_email?: string | null;
  founder_attention_type?: FounderAlertType;
  founder_attention_action?: string;
  customer_information_required?: boolean;
};

export type PostAuthorizationNotificationDependencies = {
  hasCustomerNotification(orderId: string, emailType: string): Promise<boolean>;
  sendCustomerNotification(input: {
    to: string;
    orderId: string;
  }): Promise<unknown>;
  hasFounderNotification(alertKey: string): Promise<boolean>;
  sendFounderNotification(
    input: FounderVerificationAttention & { orderId: string },
  ): Promise<unknown>;
};

export type PostAuthorizationNotificationResult = {
  excluded: boolean;
  customerSent: boolean;
  founderSent: boolean;
  missingInformation: boolean;
};

const TERMINAL_FULFILLMENT = new Set([
  "completed",
  "delivered",
  "cancelled",
  "canceled",
]);

function text(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

export function isExcludedPostAuthorizationOrder(
  order: PostAuthorizationNotificationOrder,
): boolean {
  return (
    order.archived === true ||
    Boolean(order.archived_at) ||
    !["authorized", "captured"].includes(order.status?.trim().toLowerCase() ?? "") ||
    TERMINAL_FULFILLMENT.has(
      order.fulfillment_status?.trim().toLowerCase() ?? "",
    )
  );
}

export function needsCustomerVerificationInformation(
  order: PostAuthorizationNotificationOrder,
): boolean {
  if (typeof order.customer_information_required === "boolean") {
    return order.customer_information_required;
  }
  return (
    order.verification_status === VERIFICATION_INFORMATION_NEEDED_STATUS &&
    !getVerificationReadiness(order).canEnterPendingVerification
  );
}

function customerName(order: PostAuthorizationNotificationOrder): string | null {
  return [text(order.shipping_first_name), text(order.shipping_last_name)]
    .filter((value): value is string => Boolean(value))
    .join(" ") || null;
}

export async function processPostAuthorizationNotifications(
  order: PostAuthorizationNotificationOrder,
  dependencies: PostAuthorizationNotificationDependencies,
): Promise<PostAuthorizationNotificationResult> {
  const missingInformation = needsCustomerVerificationInformation(order);
  if (isExcludedPostAuthorizationOrder(order)) {
    return {
      excluded: true,
      customerSent: false,
      founderSent: false,
      missingInformation,
    };
  }

  const recipient = text(order.shipping_email);
  const attention = getFounderVerificationAttention({
    orderId: order.id,
    paymentStatus: order.status,
    verificationStatus: order.verification_status,
    shippingMethod: order.shipping_method,
    customerName: customerName(order),
    customerEmail: recipient,
    type: order.founder_attention_type,
    action: order.founder_attention_action,
  });

  let founderSent = false;
  let firstError: unknown;
  try {
    if (attention) {
      const alertKey = founderAlertKey({
        orderId: order.id,
        type: attention.type as FounderAlertType,
        dedupeSuffix: attention.dedupeSuffix,
      });
      if (!(await dependencies.hasFounderNotification(alertKey))) {
        await dependencies.sendFounderNotification({
          orderId: order.id,
          ...attention,
        });
        founderSent = true;
      }
    }
  } catch (error) {
    firstError = error;
  }

  let customerSent = false;
  try {
    if (
      recipient &&
      missingInformation &&
      !(await dependencies.hasCustomerNotification(
        order.id,
        VERIFICATION_INFORMATION_NEEDED_EMAIL_TYPE,
      ))
    ) {
      await dependencies.sendCustomerNotification({
        to: recipient,
        orderId: order.id,
      });
      customerSent = true;
    }
  } catch (error) {
    firstError ??= error;
  }

  if (firstError) throw firstError;
  return { excluded: false, customerSent, founderSent, missingInformation };
}
