import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getVerificationState } from "@/lib/orders/getNextAction";
import { getCaptureAmountCents } from "@/lib/payments/captureAmount";
import { supabaseServer } from "@/lib/supabase-server";
import {
  sendPaymentAuthorizationExpirationWarningEmail,
  type AuthorizationExpirationWarningLevel,
} from "@/lib/email/paymentAuthorizationExpirationWarning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOUR_MS = 60 * 60 * 1000;
const MAX_LOOKAHEAD_HOURS = 72;
const URGENT_LOOKAHEAD_HOURS = 24;
const MAX_ORDERS_PER_RUN = 500;

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

type OrderRow = {
  id: string;
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
  total_amount_cents?: number | null;
  capture_amount_cents?: number | null;
  shipping_first_name?: string | null;
  shipping_last_name?: string | null;
  shipping_email?: string | null;
};

type WarningClaim = {
  id: string;
};

type ExistingWarningClaim = {
  id: string;
  sent_at: string | null;
};

type WarningResult = {
  orderId: string;
  paymentIntentId: string;
  level?: AuthorizationExpirationWarningLevel;
  status: "sent" | "skipped" | "failed";
  reason?: string;
};

function isAuthorizedCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "https://honestlenses.com"
  ).replace(/\/$/, "");
}

function getOpsEmailRecipients(): string[] {
  const raw =
    process.env.OPERATIONS_EMAILS ||
    process.env.OPERATIONS_EMAIL ||
    process.env.ADMIN_EMAILS ||
    "pauldriggers@aol.com";

  return raw
    .split(/[,\s;]+/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function getCustomerName(order: OrderRow): string {
  const name = [order.shipping_first_name, order.shipping_last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

  return name || order.shipping_email?.trim() || "Unknown customer";
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function getAmountCents(order: OrderRow, intent: Stripe.PaymentIntent): number {
  if (intent.amount_capturable > 0) return intent.amount_capturable;

  try {
    return getCaptureAmountCents(order);
  } catch {
    return order.capture_amount_cents ?? order.total_amount_cents ?? intent.amount;
  }
}

function getCaptureBefore(intent: Stripe.PaymentIntent): Date | null {
  const latestCharge = intent.latest_charge;
  if (!latestCharge || typeof latestCharge === "string") return null;

  const cardDetails = latestCharge.payment_method_details?.card as
    | { capture_before?: number | null }
    | undefined;
  const captureBefore = cardDetails?.capture_before;
  if (typeof captureBefore !== "number" || captureBefore <= 0) return null;

  return new Date(captureBefore * 1000);
}

function getWarningLevel(
  authorizationExpiresAt: Date,
  now: Date,
): AuthorizationExpirationWarningLevel | null {
  const hoursRemaining =
    (authorizationExpiresAt.getTime() - now.getTime()) / HOUR_MS;

  if (hoursRemaining < 0 || hoursRemaining > MAX_LOOKAHEAD_HOURS) {
    return null;
  }

  if (hoursRemaining <= URGENT_LOOKAHEAD_HOURS) return "24h";
  return "72h";
}

async function claimWarning({
  order,
  paymentIntentId,
  warningLevel,
  authorizationExpiresAt,
}: {
  order: OrderRow;
  paymentIntentId: string;
  warningLevel: AuthorizationExpirationWarningLevel;
  authorizationExpiresAt: Date;
}): Promise<WarningClaim | null> {
  const { data, error } = await supabaseServer
    .from("payment_authorization_expiration_warnings")
    .insert({
      order_id: order.id,
      payment_intent_id: paymentIntentId,
      warning_level: warningLevel,
      authorization_expires_at: authorizationExpiresAt.toISOString(),
    })
    .select("id")
    .maybeSingle<WarningClaim>();

  if (error?.code === "23505") {
    const { data: existingWarning, error: lookupError } = await supabaseServer
      .from("payment_authorization_expiration_warnings")
      .select("id,sent_at")
      .eq("order_id", order.id)
      .eq("payment_intent_id", paymentIntentId)
      .eq("warning_level", warningLevel)
      .maybeSingle<ExistingWarningClaim>();

    if (lookupError) throw lookupError;
    if (!existingWarning || existingWarning.sent_at) return null;
    return { id: existingWarning.id };
  }

  if (error) throw error;
  return data;
}

async function markWarningSent({
  warningId,
  to,
  subject,
}: {
  warningId: string;
  to: string[];
  subject: string;
}): Promise<void> {
  await supabaseServer
    .from("payment_authorization_expiration_warnings")
    .update({
      sent_at: new Date().toISOString(),
      email_to: to.join(","),
      email_subject: subject,
    })
    .eq("id", warningId);
}

async function markWarningFailed({
  warningId,
  error,
}: {
  warningId: string;
  error: unknown;
}): Promise<void> {
  await supabaseServer
    .from("payment_authorization_expiration_warnings")
    .update({
      error_message: error instanceof Error ? error.message : String(error),
    })
    .eq("id", warningId);
}

async function processOrder(
  order: OrderRow,
  now: Date,
): Promise<WarningResult> {
  if (!stripe) {
    return {
      orderId: order.id,
      paymentIntentId: order.payment_intent_id ?? "",
      status: "failed",
      reason: "STRIPE_SECRET_KEY is not configured",
    };
  }

  if (!order.payment_intent_id) {
    return {
      orderId: order.id,
      paymentIntentId: "",
      status: "skipped",
      reason: "missing payment intent",
    };
  }

  const intent = await stripe.paymentIntents.retrieve(order.payment_intent_id, {
    expand: ["latest_charge"],
  });

  if (intent.status !== "requires_capture") {
    return {
      orderId: order.id,
      paymentIntentId: intent.id,
      status: "skipped",
      reason: `intent status ${intent.status}`,
    };
  }

  const authorizationExpiresAt = getCaptureBefore(intent);
  if (!authorizationExpiresAt) {
    return {
      orderId: order.id,
      paymentIntentId: intent.id,
      status: "skipped",
      reason: "missing capture_before",
    };
  }

  const warningLevel = getWarningLevel(authorizationExpiresAt, now);
  if (!warningLevel) {
    return {
      orderId: order.id,
      paymentIntentId: intent.id,
      status: "skipped",
      reason: "outside warning windows",
    };
  }

  const claim = await claimWarning({
    order,
    paymentIntentId: intent.id,
    warningLevel,
    authorizationExpiresAt,
  });
  if (!claim) {
    return {
      orderId: order.id,
      paymentIntentId: intent.id,
      level: warningLevel,
      status: "skipped",
      reason: "warning already generated",
    };
  }

  const recipients = getOpsEmailRecipients();
  const verification = getVerificationState(order);
  const adminOrderUrl = `${getSiteUrl()}/admin/orders?orderId=${encodeURIComponent(
    order.id,
  )}`;
  const amount = formatMoney(getAmountCents(order, intent));

  try {
    const result = await sendPaymentAuthorizationExpirationWarningEmail({
      to: recipients,
      customerName: getCustomerName(order),
      orderId: order.id,
      amount,
      authorizationExpiresAt,
      verificationStatus: verification.label,
      adminOrderUrl,
      warningLevel,
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    await markWarningSent({
      warningId: claim.id,
      to: recipients,
      subject: "🔴 Payment Authorization Expiring Soon",
    });

    return {
      orderId: order.id,
      paymentIntentId: intent.id,
      level: warningLevel,
      status: "sent",
    };
  } catch (error) {
    await markWarningFailed({ warningId: claim.id, error });
    return {
      orderId: order.id,
      paymentIntentId: intent.id,
      level: warningLevel,
      status: "failed",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function handler(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: orders, error } = await supabaseServer
    .from("orders")
    .select(
      [
        "id",
        "status",
        "payment_status",
        "fulfillment_status",
        "verification_status",
        "rx_status",
        "rx_source",
        "rx",
        "rx_upload_path",
        "prescriber_name",
        "prescriber_email",
        "prescriber_phone",
        "payment_intent_id",
        "total_amount_cents",
        "capture_amount_cents",
        "shipping_first_name",
        "shipping_last_name",
        "shipping_email",
      ].join(","),
    )
    .not("payment_intent_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(MAX_ORDERS_PER_RUN);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = new Date();
  const results: WarningResult[] = [];

  for (const order of (orders ?? []) as unknown as OrderRow[]) {
    try {
      results.push(await processOrder(order, now));
    } catch (error) {
      results.push({
        orderId: order.id,
        paymentIntentId: order.payment_intent_id ?? "",
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: orders?.length ?? 0,
    sent: results.filter((result) => result.status === "sent").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    results,
  });
}

export async function GET(req: Request) {
  return handler(req);
}

export async function POST(req: Request) {
  return handler(req);
}
