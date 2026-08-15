import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { getSupabaseServerAuth } from "@/lib/supabase-server-auth";

const GUEST_ORDER_COOKIE = "hl_guest_order";
const GUEST_COOKIE_AUDIENCE = "honest-lenses:order-access";
const GUEST_COOKIE_VERSION = 2;
const GUEST_COOKIE_TTL_SECONDS = 60 * 60 * 24;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AuthSource = "bearer" | "cookie";
type AdminSource = "app_metadata" | "email_allowlist";

export type RequestUser = {
  user: User;
  source: AuthSource;
};

export type OrderAccess = {
  user: User | null;
  userId: string | null;
  userEmail: string | null;
  guestOrderId: string | null;
  distinctId: string | null;
  source: AuthSource | "guest" | null;
  originValid: boolean;
};

export type AdminAuthSuccess = {
  ok: true;
  user: User;
  authSource: AuthSource;
  adminSource: AdminSource;
  profileRole: null;
};

export type AdminAuthFailure = {
  ok: false;
  status: 401 | 403;
  error: "Unauthorized" | "Forbidden";
  code: "AUTH_REQUIRED" | "ADMIN_REQUIRED";
  reason: string;
  details: Record<string, never>;
};

export type AdminAuthResult = AdminAuthSuccess | AdminAuthFailure;

type GuestCookieClaims = {
  v: number;
  aud: string;
  orderId: string;
  iat: number;
  exp: number;
};

type OrderIdentity = {
  id: string | null;
  user_id?: string | null;
};

function normalizeEmail(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function configuredAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(/[,\s;]+/)
      .map(normalizeEmail)
      .filter(Boolean),
  );
}

function getBearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}

function isUnsafeMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getConfiguredBrowserOrigins(): Set<string> {
  const values = [
    process.env.SITE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NODE_ENV === "development" ? "http://localhost:3000" : null,
    process.env.NODE_ENV === "development" ? "http://127.0.0.1:3000" : null,
  ];

  return new Set(
    values
      .filter((value): value is string => Boolean(value?.trim()))
      .map(normalizeOrigin)
      .filter((value): value is string => Boolean(value)),
  );
}

export function hasTrustedMutationOrigin(request: Request): boolean {
  if (!isUnsafeMethod(request.method)) return true;

  const origin = request.headers.get("origin");
  if (!origin) return false;

  const normalized = normalizeOrigin(origin);
  return Boolean(
    normalized && getConfiguredBrowserOrigins().has(normalized),
  );
}

async function getBearerUser(token: string): Promise<User | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  return error ? null : user;
}

async function getCookieUser(): Promise<User | null> {
  try {
    const client = await getSupabaseServerAuth();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    return error ? null : user;
  } catch {
    return null;
  }
}

export async function getServerUser(): Promise<User | null> {
  return getCookieUser();
}

export async function getRequestUser(
  request: Request,
): Promise<RequestUser | null> {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    const token = getBearerToken(authorization);
    if (!token) return null;
    const user = await getBearerUser(token);
    return user ? { user, source: "bearer" } : null;
  }

  const user = await getCookieUser();
  return user ? { user, source: "cookie" } : null;
}

function getGuestCookieSecret(): string | null {
  return process.env.GUEST_ORDER_COOKIE_SECRET?.trim() || null;
}

function signGuestPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function parseCookieHeader(header: string | null): Record<string, string> {
  if (!header) return {};

  return header.split(";").reduce<Record<string, string>>((result, part) => {
    const separator = part.indexOf("=");
    if (separator < 1) return result;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      // A malformed cookie is ignored and never becomes authorization.
    }
    return result;
  }, {});
}

export function createGuestOrderCookieValue(
  orderId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const secret = getGuestCookieSecret();
  if (!secret) {
    throw new Error("GUEST_ORDER_COOKIE_SECRET is required");
  }
  if (!UUID_PATTERN.test(orderId)) {
    throw new Error("A valid order UUID is required");
  }

  const claims: GuestCookieClaims = {
    v: GUEST_COOKIE_VERSION,
    aud: GUEST_COOKIE_AUDIENCE,
    orderId,
    iat: nowSeconds,
    exp: nowSeconds + GUEST_COOKIE_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${signGuestPayload(payload, secret)}`;
}

export function readGuestOrderIdFromCookieHeader(
  header: string | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): string | null {
  const secret = getGuestCookieSecret();
  if (!secret) return null;

  const value = parseCookieHeader(header)[GUEST_ORDER_COOKIE];
  const [payload, signature, extra] = value?.split(".") ?? [];
  if (!payload || !signature || extra) return null;
  if (!safeEqual(signature, signGuestPayload(payload, secret))) return null;

  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<GuestCookieClaims>;

    if (
      claims.v !== GUEST_COOKIE_VERSION ||
      claims.aud !== GUEST_COOKIE_AUDIENCE ||
      typeof claims.orderId !== "string" ||
      !UUID_PATTERN.test(claims.orderId) ||
      typeof claims.iat !== "number" ||
      typeof claims.exp !== "number" ||
      claims.iat > nowSeconds + 60 ||
      claims.exp <= nowSeconds ||
      claims.exp - claims.iat !== GUEST_COOKIE_TTL_SECONDS
    ) {
      return null;
    }

    return claims.orderId;
  } catch {
    return null;
  }
}

export async function getOrderAccess(request: Request): Promise<OrderAccess> {
  const identity = await getRequestUser(request);
  const originValid =
    identity?.source === "bearer" || hasTrustedMutationOrigin(request);

  // A signed guest-cart capability may be established by a cart recovery link
  // while the browser also has an authenticated account session. Preserve both
  // principals: cart routes intentionally prefer the scoped guest cart, while
  // canAccessOrder still validates either principal against the requested row.
  // An explicit Authorization header remains authoritative and never falls
  // back to a guest capability.
  const guestOrderId = request.headers.has("authorization")
    ? null
    : readGuestOrderIdFromCookieHeader(request.headers.get("cookie"));

  if (identity) {
    return {
      user: identity.user,
      userId: identity.user.id,
      userEmail: identity.user.email ?? null,
      guestOrderId,
      distinctId: identity.user.id,
      source: identity.source,
      originValid,
    };
  }

  // An explicit Authorization header is authoritative. Never fall back to a
  // guest cookie when a supplied bearer credential is invalid.
  return {
    user: null,
    userId: null,
    userEmail: null,
    guestOrderId,
    distinctId: guestOrderId ? `guest:${guestOrderId}` : null,
    source: guestOrderId ? "guest" : null,
    originValid,
  };
}

export async function getServerOrderAccess(): Promise<OrderAccess> {
  const cookieStore = await cookies();
  const requestHeaders = new Headers();
  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");
  if (cookieHeader) requestHeaders.set("cookie", cookieHeader);

  const user = await getCookieUser();
  if (user) {
    return {
      user,
      userId: user.id,
      userEmail: user.email ?? null,
      guestOrderId: null,
      distinctId: user.id,
      source: "cookie",
      originValid: true,
    };
  }

  const guestOrderId = readGuestOrderIdFromCookieHeader(cookieHeader);
  return {
    user: null,
    userId: null,
    userEmail: null,
    guestOrderId,
    distinctId: guestOrderId ? `guest:${guestOrderId}` : null,
    source: guestOrderId ? "guest" : null,
    originValid: true,
  };
}

export function canAccessOrder(
  access: OrderAccess,
  order: OrderIdentity | null | undefined,
): boolean {
  if (!order?.id || !access.originValid) return false;
  if (access.userId && order.user_id === access.userId) return true;
  return Boolean(access.guestOrderId && order.id === access.guestOrderId);
}

export function hasOrderAccessContext(access: OrderAccess): boolean {
  return Boolean(
    access.originValid && (access.userId || access.guestOrderId),
  );
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
    maxAge: GUEST_COOKIE_TTL_SECONDS,
  });
  return response;
}

export function isAdminUser(user: User): AdminSource | null {
  const role =
    typeof user.app_metadata?.role === "string"
      ? user.app_metadata.role.trim().toLowerCase()
      : "";
  if (role === "admin") return "app_metadata";
  if (configuredAdminEmails().has(normalizeEmail(user.email))) {
    return "email_allowlist";
  }
  return null;
}

export async function requireAdmin(
  request: Request,
): Promise<AdminAuthResult> {
  const identity = await getRequestUser(request);
  if (!identity) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
      code: "AUTH_REQUIRED",
      reason: "A valid Supabase user is required.",
      details: {},
    };
  }

  if (
    identity.source === "cookie" &&
    !hasTrustedMutationOrigin(request)
  ) {
    return {
      ok: false,
      status: 403,
      error: "Forbidden",
      code: "ADMIN_REQUIRED",
      reason: "The browser mutation origin is not trusted.",
      details: {},
    };
  }

  const adminSource = isAdminUser(identity.user);
  if (!adminSource) {
    return {
      ok: false,
      status: 403,
      error: "Forbidden",
      code: "ADMIN_REQUIRED",
      reason: "The authenticated user is not an administrator.",
      details: {},
    };
  }

  return {
    ok: true,
    user: identity.user,
    authSource: identity.source,
    adminSource,
    profileRole: null,
  };
}
