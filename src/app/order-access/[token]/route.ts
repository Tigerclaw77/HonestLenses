export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { verifyOrderAccessToken } from "@/lib/orders/orderAccessToken";
import { setOrderStatusSession } from "@/lib/orders/orderStatusSession";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const orderId = verifyOrderAccessToken(token);
  const destination = orderId ? "/your-order" : "/find-order?link=unavailable";
  const response = NextResponse.redirect(new URL(destination, request.url), 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return orderId ? setOrderStatusSession(response, orderId) : response;
}
