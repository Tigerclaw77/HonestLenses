import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  adminAuthErrorResponse,
  logAdminAuthFailure,
  requireAdminUser,
} from "@/lib/admin-auth";

const FULFILLMENT_STATUSES = [
  "review",
  "ready_to_order",
  "ordered",
  "shipped",
  "completed",
  "hold",
  "cancelled",
] as const;

type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

type PatchBody = {
  fulfillment_status?: unknown;
  admin_notes?: unknown;
};

function isFulfillmentStatus(value: unknown): value is FulfillmentStatus {
  return FULFILLMENT_STATUSES.includes(value as FulfillmentStatus);
}

async function parseBody(req: NextRequest): Promise<PatchBody> {
  try {
    const value = (await req.json()) as PatchBody;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminUser(req);
  if (!auth.ok) {
    logAdminAuthFailure("PATCH /api/admin/orders/[id]", auth);
    return adminAuthErrorResponse(auth);
  }

  const { id } = await context.params;
  const body = await parseBody(req);
  const update: Record<string, unknown> = {};

  if ("fulfillment_status" in body) {
    if (!isFulfillmentStatus(body.fulfillment_status)) {
      return NextResponse.json(
        { error: "Invalid fulfillment status" },
        { status: 400 },
      );
    }

    update.fulfillment_status = body.fulfillment_status;
  }

  if ("admin_notes" in body) {
    if (typeof body.admin_notes !== "string") {
      return NextResponse.json(
        { error: "Invalid admin notes" },
        { status: 400 },
      );
    }

    update.admin_notes = body.admin_notes;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No changes supplied" }, { status: 400 });
  }

  update.updated_at = new Date().toISOString();

  const { data, error } = await supabaseServer
    .from("orders")
    .update(update)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, order: data });
}
