import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  adminAuthErrorResponse,
  logAdminAuthFailure,
  requireAdminUser,
} from "@/lib/admin-auth";
import {
  assessAdminFulfillmentTransition,
  isAdminFulfillmentStatus,
} from "@/lib/orders/adminWorkflow";
import { sendFounderOperationalAlert } from "@/lib/founderAlerts";

type PatchBody = {
  fulfillment_status?: unknown;
  admin_notes?: unknown;
};

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
    if (!isAdminFulfillmentStatus(body.fulfillment_status)) {
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

  const { data: currentOrder, error: currentOrderError } = await supabaseServer
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (currentOrderError) {
    return NextResponse.json(
      { error: "Unable to load the order." },
      { status: 500 },
    );
  }

  if (!currentOrder) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const transition =
    "fulfillment_status" in body
      ? assessAdminFulfillmentTransition(
          currentOrder,
          body.fulfillment_status,
        )
      : null;

  if (transition && !transition.valid) {
    return NextResponse.json(
      { error: "Invalid fulfillment transition" },
      { status: 400 },
    );
  }

  if (transition && !transition.allowed) {
    return NextResponse.json(
      {
        error: transition.warnings[0] ?? "Verification is required.",
        code: "RX_VERIFICATION_REQUIRED",
      },
      { status: 409 },
    );
  }

  update.updated_at = new Date().toISOString();

  const { data, error } = await supabaseServer
    .from("orders")
    .update(update)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Unable to update the order." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  let eventLogged = true;
  if (transition?.targetStatus) {
    const actor = auth.user.email ?? auth.user.id;
    const message = [
      `Admin changed fulfillment from ${transition.currentStatus} to ${transition.targetStatus}.`,
      ...transition.warnings,
    ].join(" ");
    const { error: eventError } = await supabaseServer
      .from("order_events")
      .insert({
        order_id: id,
        event_type: "admin_fulfillment_override",
        actor,
        message,
        before: {
          fulfillment_status: transition.currentStatus,
        },
        after: {
          fulfillment_status: transition.targetStatus,
        },
      });

    if (eventError) {
      eventLogged = false;
      console.warn("Admin fulfillment event logging failed", {
        orderId: id,
        error: eventError.message,
      });
    }
  }

  if (transition?.targetStatus === "ready_to_order") {
    try {
      await sendFounderOperationalAlert({
        orderId: id,
        type: "ready_to_order",
        headline: "Order marked ready to order",
        detail:
          "The order is ready for the founder to capture payment if needed and place the supplier order.",
      });
    } catch (alertError) {
      console.error("Founder ready-to-order alert failed:", alertError);
    }
  }

  return NextResponse.json({
    ok: true,
    order: data,
    warnings: transition?.warnings ?? [],
    event_logged: eventLogged,
  });
}
