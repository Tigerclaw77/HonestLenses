import { createHmac, timingSafeEqual } from "crypto";
import type { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/get-user-from-request";

const GUEST_ORDER_COOKIE = "hl_guest_order";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type OrderIdentity = {
  id: string | null;
  user_id?: string | null;
};

export type OrderAccess = {
  user: Awaited<ReturnType<typeof getUserFromRequest>>;
  userId: string | null;
  userEmail: string | null;
  guestOrderId: string | null;
  distinctId: string | null;
};

function getSigningSecret(): string {
  return (
    process.env.GUEST_ORDER_COOKIE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "local-dev-guest-order-secret"
  );
}

function signPayload(payload: string): string {
  return createHmac("sha256", getSigningSecret())
    .update(payload)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function parseCookieHeader(header: string | null): Record<string, string> {
  if (!header) return {};

  return header.split(";").reduce<Record<string, string>>((acc, part) => {
    const index = part.indexOf("=");
    if (index === -1) return acc;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function createGuestOrderCookieValue(orderId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ v: 1, orderId }),
  ).toString("base64url");
  return `${payload}.${signPayload(payload)}`;
}

function readGuestOrderId(req: Request): string | null {
  const cookies = parseCookieHeader(req.headers.get("cookie"));
  const value = cookies[GUEST_ORDER_COOKIE];
  if (!value) return null;

  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  if (!safeEqual(signature, signPayload(payload))) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { orderId?: unknown };

    return typeof decoded.orderId === "string" ? decoded.orderId : null;
  } catch {
    return null;
  }
}

export async function getOrderAccess(req: Request): Promise<OrderAccess> {
  const user = await getUserFromRequest(req);
  const guestOrderId = readGuestOrderId(req);

  return {
    user,
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    guestOrderId,
    distinctId: user?.id ?? (guestOrderId ? `guest:${guestOrderId}` : null),
  };
}

export function canAccessOrder(
  access: OrderAccess,
  order: OrderIdentity | null | undefined,
): boolean {
  if (!order?.id) return false;
  if (access.userId && order.user_id === access.userId) return true;
  return Boolean(access.guestOrderId && order.id === access.guestOrderId);
}

export function hasOrderAccessContext(access: OrderAccess): boolean {
  return Boolean(access.userId || access.guestOrderId);
}

export function setGuestOrderCookie(
  response: NextResponse,
  orderId: string,
): NextResponse {
  response.cookies.set({
    name: GUEST_ORDER_COOKIE,
    value: createGuestOrderCookieValue(orderId),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  return response;
}
