import assert from "node:assert/strict";
import { decideVerifiedAuthSession } from "./sessionDenylist";
import { createGuestOrderCookieValue, getOrderAccess, getRequestUser, requireAdmin } from "./authorization";

const deniedId = "11111111-1111-4111-8111-111111111111";
const allowedId = "22222222-2222-4222-8222-222222222222";
const orderId = "33333333-3333-4333-8333-333333333333";
const token = (sessionId?: string, version = 1) =>
  `test.${Buffer.from(JSON.stringify({ session_id: sessionId, version })).toString("base64url")}.test`;

const previous = {
  denylist: process.env.HL_DENIED_AUTH_SESSION_IDS,
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  guestSecret: process.env.GUEST_ORDER_COOKIE_SECRET,
};
const originalFetch = globalThis.fetch;

async function main() {
try {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-publishable-key";
  process.env.GUEST_ORDER_COOKIE_SECRET = "g".repeat(32);
  globalThis.fetch = async (input) => {
    assert.match(String(input), /\/auth\/v1\/user$/);
    return Response.json({ id: "44444444-4444-4444-8444-444444444444", email: "admin@example.invalid", app_metadata: { role: "admin" } });
  };

  delete process.env.HL_DENIED_AUTH_SESSION_IDS;
  assert.equal(decideVerifiedAuthSession(token(deniedId)), "allow", "unconfigured restriction stays inactive");

  process.env.HL_DENIED_AUTH_SESSION_IDS = deniedId;
  assert.equal(decideVerifiedAuthSession(token(deniedId)), "deny");
  assert.equal(decideVerifiedAuthSession(token(deniedId, 2)), "deny", "a refreshed JWT retains its session ID");
  assert.equal(decideVerifiedAuthSession(token(allowedId)), "allow");
  assert.equal(decideVerifiedAuthSession(token()), "deny", "missing session ID fails closed");

  const blockedRequest = new Request("https://www.honestlenses.com/api/orders", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token(deniedId)}`,
      origin: "https://www.honestlenses.com",
      cookie: `hl_guest_order=${createGuestOrderCookieValue(orderId)}`,
    },
  });
  assert.equal(await getRequestUser(blockedRequest), null);
  assert.equal(
    await getRequestUser(new Request("https://www.honestlenses.com/api/orders/list", {
      headers: { authorization: `Bearer ${token(deniedId, 2)}` },
    })),
    null,
    "a renewed token for the same session stays blocked at the route guard",
  );
  const blockedAccess = await getOrderAccess(blockedRequest);
  assert.equal(blockedAccess.deniedSession, true);
  assert.equal(blockedAccess.guestOrderId, null, "blocked auth cannot fall back to a guest cookie");

  const allowedRequest = new Request("https://www.honestlenses.com/api/admin/orders", {
    headers: { authorization: `Bearer ${token(allowedId)}` },
  });
  assert.equal((await getRequestUser(allowedRequest))?.user.id, "44444444-4444-4444-8444-444444444444");
  assert.equal((await requireAdmin(allowedRequest)).ok, true, "unaffected administrators remain allowed");
  assert.equal((await requireAdmin(blockedRequest)).ok, false);

  const guestRequest = new Request("https://www.honestlenses.com/api/cart", {
    headers: { cookie: `hl_guest_order=${createGuestOrderCookieValue(orderId)}` },
  });
  const guestAccess = await getOrderAccess(guestRequest);
  assert.equal(guestAccess.guestOrderId, orderId, "ordinary guest checkout remains available");

  process.env.HL_DENIED_AUTH_SESSION_IDS = "invalid-id";
  assert.throws(() => decideVerifiedAuthSession(token(allowedId)));
  assert.equal(await getRequestUser(allowedRequest), null, "bad active configuration fails closed");
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries({
    HL_DENIED_AUTH_SESSION_IDS: previous.denylist,
    NEXT_PUBLIC_SUPABASE_URL: previous.url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: previous.key,
    GUEST_ORDER_COOKIE_SECRET: previous.guestSecret,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log("Session denylist checks passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
