import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";

export const ORDER_STATUS_COOKIE_NAME = "hl_order_status";
const TTL_SECONDS = 24 * 60 * 60;
const AUDIENCE = "honest-lenses:email-order-status-session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Claims = { v: 1; aud: typeof AUDIENCE; orderId: string; iat: number; exp: number };

function signature(payload: string): Buffer {
  const secret = process.env.ORDER_ACCESS_TOKEN_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("A strong ORDER_ACCESS_TOKEN_SECRET is required for order status sessions");
  }
  const key = createHmac("sha256", secret).update("customer-order-status-cookie:v1").digest();
  return createHmac("sha256", key).update(payload).digest();
}

export function createOrderStatusSession(orderId: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  if (!UUID_PATTERN.test(orderId) || !Number.isSafeInteger(nowSeconds) || nowSeconds < 0) {
    throw new Error("A valid order ID and issue time are required");
  }
  const claims: Claims = { v: 1, aud: AUDIENCE, orderId, iat: nowSeconds, exp: nowSeconds + TTL_SECONDS };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}

export function readOrderStatusSession(value: string | undefined, nowSeconds = Math.floor(Date.now() / 1000)): string | null {
  if (!value || value.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return null;
  const [payload, supplied] = value.split(".");
  if (Buffer.from(payload, "base64url").toString("base64url") !== payload ||
    Buffer.from(supplied, "base64url").toString("base64url") !== supplied) return null;
  const expected = signature(payload);
  const actual = Buffer.from(supplied, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<Claims>;
    return claims.v === 1 && claims.aud === AUDIENCE && typeof claims.orderId === "string" &&
      UUID_PATTERN.test(claims.orderId) && Number.isSafeInteger(claims.iat) &&
      Number.isSafeInteger(claims.exp) && claims.iat! <= nowSeconds + 60 &&
      claims.exp! > nowSeconds && claims.exp! - claims.iat! === TTL_SECONDS
      ? claims.orderId : null;
  } catch {
    return null;
  }
}

export function setOrderStatusSession(response: NextResponse, orderId: string): NextResponse {
  response.cookies.set({
    name: ORDER_STATUS_COOKIE_NAME,
    value: createOrderStatusSession(orderId),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/your-order",
    maxAge: TTL_SECONDS,
  });
  return response;
}
