export const runtime = "nodejs";

import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { canAccessOrder, getOrderAccess, hasOrderAccessContext } from "@/lib/order-access";
import { supabaseServer } from "@/lib/supabase-server";
import { getTrustedSiteOrigin } from "@/lib/security/siteOrigin";
import { enforceRateLimit, rateLimitErrorResponse } from "@/lib/security/rateLimit";
import { createPrescriptionHandoff } from "@/lib/server/prescriptionHandoffStore";
import { buildPrescriptionHandoffResponse } from "@/lib/prescriptionHandoff";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const access = await getOrderAccess(request);
  if (!hasOrderAccessContext(access)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit(request, {
    scope: "prescription-handoff-create",
    identity: access.distinctId,
    limit: 10,
    windowSeconds: 60 * 60,
  });
  if (!rateLimit.allowed) return rateLimitErrorResponse(rateLimit);

  const body = (await request.json().catch(() => null)) as { orderId?: unknown } | null;
  if (typeof body?.orderId !== "string" || !UUID.test(body.orderId)) {
    return NextResponse.json({ error: "A valid order is required." }, { status: 400 });
  }

  const { data: order } = await supabaseServer
    .from("orders")
    .select("id, user_id, status")
    .eq("id", body.orderId)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (!canAccessOrder(access, order)) {
    return NextResponse.json({ error: "Order not authorized" }, { status: 403 });
  }
  if (!["draft", "pending", "authorized"].includes(order.status)) {
    return NextResponse.json({ error: "Order is not editable" }, { status: 400 });
  }

  try {
    const { token, row } = await createPrescriptionHandoff(order.id);
    const url = new URL("/upload-prescription/phone", getTrustedSiteOrigin());
    // A fragment keeps the bearer capability out of HTTP requests, server
    // access logs, and Referer headers. The phone removes it immediately.
    url.hash = new URLSearchParams({ t: token }).toString();
    const qrDataUrl = await QRCode.toDataURL(url.toString(), {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 280,
      color: { dark: "#181126", light: "#ffffff" },
    });
    return NextResponse.json(buildPrescriptionHandoffResponse(row, qrDataUrl));
  } catch (error) {
    console.error("PRESCRIPTION HANDOFF CREATE ERROR:", error);
    return NextResponse.json(
      { error: "Unable to generate a mobile upload code." },
      { status: 500 },
    );
  }
}
