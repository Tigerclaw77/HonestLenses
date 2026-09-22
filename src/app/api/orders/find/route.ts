export const runtime = "nodejs";
export const maxDuration = 30;

import { after, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { buildOrderAccessEmail } from "@/lib/email/orderAccessEmail";
import { deliverMatchedOrderAccess, FIND_ORDER_NEUTRAL_MESSAGE, parseFindOrderInput } from "@/lib/orders/findOrder";
import { getOrderAccessUrl } from "@/lib/orders/orderAccessToken";
import { isHistoricalOrderUuid } from "@/lib/receipts/core";
import { enforceRateLimit, rateLimitErrorResponse } from "@/lib/security/rateLimit";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const ipRateLimit = await enforceRateLimit(request, {
    scope: "order-access-recovery-ip", limit: 20, windowSeconds: 60 * 60,
  });
  if (!ipRateLimit.allowed) return rateLimitErrorResponse(ipRateLimit);

  const size = Number(request.headers.get("content-length"));
  if (Number.isFinite(size) && size > 4096) {
    return NextResponse.json({ error: "Enter a valid order number and email." }, { status: 400 });
  }
  const input = parseFindOrderInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "Enter a valid order number and email." }, { status: 400 });

  const rateLimit = await enforceRateLimit(request, {
    scope: "order-access-recovery", identity: `${input.orderNumber.toLowerCase()}\n${input.email}`,
    limit: 5, windowSeconds: 60 * 60,
  });
  if (!rateLimit.allowed) return rateLimitErrorResponse(rateLimit);

  after(async () => {
    await sendOrderAccessIfMatched(input).catch((error) => {
      console.error("Order access recovery failed", { code: error instanceof Error ? error.name : "UNKNOWN" });
    });
  });

  return NextResponse.json({ ok: true, message: FIND_ORDER_NEUTRAL_MESSAGE }, { headers: { "Cache-Control": "no-store" } });
}

async function sendOrderAccessIfMatched(input: { orderNumber: string; email: string }) {
  let query = supabaseServer.from("orders").select("id, status, shipping_email");
  query = isHistoricalOrderUuid(input.orderNumber)
    ? query.eq("id", input.orderNumber)
    : query.eq("customer_order_number", input.orderNumber.toUpperCase());
  const { data: order, error } = await query.maybeSingle();
  if (error) {
    console.error("Order access lookup failed", { code: error.code });
  } else {
    await deliverMatchedOrderAccess(order, input.email, async (matched) => {
      try {
        const orderUrl = getOrderAccessUrl(matched.id);
        const draft = buildOrderAccessEmail(orderUrl);
        await sendEmail({
          to: matched.shipping_email,
          subject: draft.subject, html: draft.html, text: draft.text,
          tracking: { orderId: matched.id, emailType: "order_access" },
          redactProviderErrorLog: true,
        });
      } catch (sendError) {
        console.error("Order access delivery failed", { code: sendError instanceof Error ? sendError.name : "UNKNOWN" });
      }
    });
  }
}
