import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  canAccessOrder,
  getOrderAccess,
  hasOrderAccessContext,
} from "@/lib/order-access";
import {
  CUSTOMER_ORDER_SELECT,
  isCustomerOrderId,
  isCustomerReceiptAvailable,
  type CustomerOrder,
} from "@/lib/orders/customerOrder";
import { issueReceiptAccessToken } from "@/lib/receipts/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await context.params;
  if (!isCustomerOrderId(orderId)) {
    return new Response("Receipt not found.", { status: 404 });
  }

  const access = await getOrderAccess(request);
  if (!hasOrderAccessContext(access)) {
    return new Response("Receipt not found.", { status: 404 });
  }

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(CUSTOMER_ORDER_SELECT)
    .eq("id", orderId)
    .single<CustomerOrder>();

  if (error || !order || !canAccessOrder(access, order)) {
    return new Response("Receipt not found.", { status: 404 });
  }

  if (!isCustomerReceiptAvailable(order)) {
    return new Response("Receipt is available after payment is captured.", {
      status: 409,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }

  const accessToken = await issueReceiptAccessToken(order.id, "order_status");
  return Response.redirect(
    new URL(`/receipt/${encodeURIComponent(accessToken.token)}`, request.url),
    303,
  );
}
