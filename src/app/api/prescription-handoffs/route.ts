export const runtime = "nodejs";

import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { canAccessOrder, getOrderAccess, hasOrderAccessContext } from "@/lib/order-access";
import { supabaseServer } from "@/lib/supabase-server";
import { getTrustedSiteOrigin } from "@/lib/security/siteOrigin";
import { enforceRateLimit, rateLimitErrorResponse } from "@/lib/security/rateLimit";
import { createPrescriptionHandoff } from "@/lib/server/prescriptionHandoffStore";
import { buildPrescriptionHandoffResponse } from "@/lib/prescriptionHandoff";
import { originalProduct, record } from "@/lib/orders/productSelection";
import { lenses } from "@/LensCore";

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

  const body = (await request.json().catch(() => null)) as { orderId?: unknown; selectedRight?: unknown; selectedLeft?: unknown } | null;
  if (typeof body?.orderId !== "string" || !UUID.test(body.orderId)) {
    return NextResponse.json({ error: "A valid order is required." }, { status: 400 });
  }

  const { data: order } = await supabaseServer
    .from("orders")
    .select("id, user_id, status, sku, rx, rx_ocr_meta, updated_at")
    .eq("id", body.orderId)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (!canAccessOrder(access, order)) {
    return NextResponse.json({ error: "Order not authorized" }, { status: 403 });
  }
  if (!["draft", "pending"].includes(order.status)) {
    return NextResponse.json({ error: "Order is not editable" }, { status: 400 });
  }

  try {
    const original = originalProduct(order);
    const validCore = (value: unknown) => typeof value === "string" && lenses.some(l => l.coreId === value) ? value : null;
    const { data: saved, error: saveError } = await supabaseServer.from("orders")
      .update({ rx_ocr_meta: { ...record(order.rx_ocr_meta), selected_product: {
        ...original, right: original.right ?? validCore(body.selectedRight),
        left: original.left ?? validCore(body.selectedLeft),
      } } }).eq("id", order.id).eq("status", order.status).eq("updated_at", order.updated_at).select("id");
    if (saveError || !saved?.length) throw new Error("Unable to preserve selected products");
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
