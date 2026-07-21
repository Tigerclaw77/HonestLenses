import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  buildCustomerReceiptHtml,
  CUSTOMER_ORDER_SELECT,
  isCustomerOrderId,
  type CustomerOrder,
} from "@/lib/orders/customerOrder";

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

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select(CUSTOMER_ORDER_SELECT)
    .eq("id", orderId)
    .single<CustomerOrder>();

  if (error || !order) {
    return new Response("Receipt not found.", { status: 404 });
  }

  const download = request.nextUrl.searchParams.get("download") === "1";
  const disposition = download
    ? `attachment; filename="honest-lenses-receipt-${order.id}.html"`
    : "inline";

  return new Response(buildCustomerReceiptHtml(order), {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": disposition,
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
