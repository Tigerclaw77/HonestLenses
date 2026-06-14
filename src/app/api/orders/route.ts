export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase-server";
import { getOrderAccess, setGuestOrderCookie } from "@/lib/order-access";

const GUEST_CHECKOUT_USER_ID =
  process.env.GUEST_CHECKOUT_USER_ID ??
  "11111111-1111-4111-8111-111111111111";
const GUEST_CHECKOUT_EMAIL =
  process.env.GUEST_CHECKOUT_EMAIL ?? "guest-checkout@honestlenses.com";

async function ensureGuestCheckoutUser() {
  const {
    data: { user },
    error: getError,
  } = await supabaseServer.auth.admin.getUserById(GUEST_CHECKOUT_USER_ID);

  if (user) return;

  if (getError && getError.status !== 404) {
    throw getError;
  }

  const { error: createError } = await supabaseServer.auth.admin.createUser({
    id: GUEST_CHECKOUT_USER_ID,
    email: GUEST_CHECKOUT_EMAIL,
    email_confirm: true,
    app_metadata: {
      role: "guest_checkout",
      system_user: true,
    },
    user_metadata: {
      name: "Guest Checkout",
    },
  });

  if (createError) throw createError;
}

export async function POST(req: Request) {
  try {
    /* =========================
       1️⃣ Auth
    ========================= */
    const access = await getOrderAccess(req);
    const user = access.user;

    const TWO_HOURS_MS = 1000 * 60 * 60 * 2;

    /* =========================
       2️⃣ Find RECENT reusable draft
       (no Stripe intent attached)
    ========================= */

    let draftsQuery = supabaseServer
      .from("orders")
      .select("id, created_at")
      .eq("status", "draft")
      .is("payment_intent_id", null);

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
        { error: existingError.message },
        { status: 500 }
      );
    }

    const now = Date.now();

    const recentDraft = drafts?.find((d) => {
      if (!d?.created_at) return false;
      const age = now - new Date(d.created_at).getTime();
      return age <= TWO_HOURS_MS;
    });

    if (recentDraft?.id) {
      console.log("REUSING RECENT DRAFT:", recentDraft.id);

      const response = NextResponse.json({ orderId: recentDraft.id });
      return access.guestOrderId || !user
        ? setGuestOrderCookie(response, recentDraft.id)
        : response;
    }

    console.log("NO RECENT DRAFT — creating new order");

    if (!user) {
      await ensureGuestCheckoutUser();
    }

    /* =========================
       3️⃣ Create NEW draft
    ========================= */

    const { data: newOrder, error: insertError } =
      await supabaseServer
        .from("orders")
        .insert({
          user_id: user?.id ?? GUEST_CHECKOUT_USER_ID,
          status: "draft",
          currency: "USD",
          box_count: 0,
        })
        .select("id")
        .single();

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    if (!newOrder?.id) {
      return NextResponse.json(
        { error: "Order creation failed" },
        { status: 500 }
      );
    }

    console.log("CREATED NEW DRAFT:", newOrder.id);

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
