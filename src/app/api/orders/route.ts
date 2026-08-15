export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase-server";
import { getOrderAccess, setGuestOrderCookie } from "@/lib/order-access";
import {
  ACTIVE_CART_ORDER_STATUS,
  isCartOrderRecent,
} from "@/lib/cart/lifecycle";
import {
  enforceRateLimit,
  rateLimitErrorResponse,
} from "@/lib/security/rateLimit";

export async function POST(req: Request) {
  try {
    const rateLimit = await enforceRateLimit(req, {
      scope: "order-create",
      limit: 10,
      windowSeconds: 60 * 60,
    });
    if (!rateLimit.allowed) return rateLimitErrorResponse(rateLimit);

    /* =========================
       1️⃣ Auth
    ========================= */
    const access = await getOrderAccess(req);
    const user = access.user;

    /* =========================
       2️⃣ Find RECENT reusable draft
       (checkout initialization does not consume it)
    ========================= */

    let draftsQuery = supabaseServer
      .from("orders")
      .select("id, created_at, updated_at")
      .eq("status", ACTIVE_CART_ORDER_STATUS);

    if (access.guestOrderId) {
      draftsQuery = draftsQuery.eq("id", access.guestOrderId);
    } else if (user) {
      draftsQuery = draftsQuery.eq("user_id", user.id);
    } else {
      draftsQuery = draftsQuery.eq("id", "00000000-0000-0000-0000-000000000000");
    }

    const { data: drafts, error: existingError } = await draftsQuery.order(
      "created_at",
      { ascending: false },
    );

    if (existingError) {
      return NextResponse.json(
        { error: "Unable to find an existing order." },
        { status: 500 }
      );
    }

    const recentDraft = drafts?.find((d) => {
      if (!d) return false;
      return isCartOrderRecent({
        createdAt: d.created_at,
        updatedAt: d.updated_at,
        scopedGuestOrder: Boolean(
          access.guestOrderId && d.id === access.guestOrderId,
        ),
      });
    });

    if (recentDraft?.id) {
      const response = NextResponse.json({ orderId: recentDraft.id });
      return access.guestOrderId || !user
        ? setGuestOrderCookie(response, recentDraft.id)
        : response;
    }

    /* =========================
       3️⃣ Create NEW draft
    ========================= */

    const { data: newOrder, error: insertError } =
      await supabaseServer
        .from("orders")
        .insert({
          // Guest ownership is represented only by the scoped guest cookie.
          // It must never share a Supabase Auth principal with other guests.
          user_id: user?.id ?? null,
          status: "draft",
          currency: "USD",
          box_count: 0,
        })
        .select("id")
        .single();

    if (insertError) {
      return NextResponse.json(
        { error: "Unable to create an order." },
        { status: 500 }
      );
    }

    if (!newOrder?.id) {
      return NextResponse.json(
        { error: "Order creation failed" },
        { status: 500 }
      );
    }

    const response = NextResponse.json({ orderId: newOrder.id });
    return user ? response : setGuestOrderCookie(response, newOrder.id);

  } catch (err) {
    console.error("ORDERS ROUTE ERROR:", err);

    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
