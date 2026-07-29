import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { User } from "@supabase/supabase-js";
import {
  canAccessOrder,
  createGuestOrderCookieValue,
  hasTrustedMutationOrigin,
  isAdminUser,
  readGuestOrderIdFromCookieHeader,
} from "./authorization";
import { ROUTE_AUTHORIZATION_POLICY } from "./routePolicy";
import { safeInternalPath } from "./safeRedirect";
import {
  createRequestSignature,
  hasValidSignedRequest,
} from "@/lib/security/signedRequest";

process.env.GUEST_ORDER_COOKIE_SECRET = "g".repeat(32);
process.env.SITE_URL = "https://www.honestlenses.com";
process.env.ADMIN_EMAILS = "configured-admin@example.com";

assert.equal(safeInternalPath("javascript:alert(1)"), "/");
assert.equal(safeInternalPath("//evil.example/path"), "/");
assert.equal(safeInternalPath("/\\evil.example"), "/");
assert.equal(safeInternalPath("/%0Ajavascript:alert(1)"), "/");
assert.equal(safeInternalPath("/checkout?step=2#payment"), "/checkout?step=2#payment");

const orderId = "11111111-1111-4111-8111-111111111111";
const issuedAt = 1_800_000_000;
const guestValue = createGuestOrderCookieValue(orderId, issuedAt);
assert.equal(
  readGuestOrderIdFromCookieHeader(
    `another=x; hl_guest_order=${guestValue}`,
    issuedAt + 1,
  ),
  orderId,
);
assert.equal(
  readGuestOrderIdFromCookieHeader(
    `hl_guest_order=${guestValue}`,
    issuedAt + 86_400,
  ),
  null,
);
assert.equal(
  readGuestOrderIdFromCookieHeader(
    `hl_guest_order=${guestValue.slice(0, -1)}x`,
    issuedAt + 1,
  ),
  null,
);

const ownerAccess = {
  user: null,
  userId: "user-owner",
  userEmail: null,
  guestOrderId: null,
  distinctId: "user-owner",
  source: "bearer" as const,
  originValid: true,
};
assert.equal(
  canAccessOrder(ownerAccess, { id: orderId, user_id: "user-owner" }),
  true,
);
assert.equal(
  canAccessOrder(ownerAccess, { id: orderId, user_id: "different-user" }),
  false,
);
assert.equal(
  canAccessOrder(
    {
      ...ownerAccess,
      userId: null,
      guestOrderId: orderId,
      source: "guest",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      user_id: null,
    },
  ),
  false,
);


assert.equal(
  hasTrustedMutationOrigin(
    new Request("https://www.honestlenses.com/api/orders", {
      method: "POST",
      headers: { origin: "https://www.honestlenses.com" },
    }),
  ),
  true,
);
assert.equal(
  hasTrustedMutationOrigin(
    new Request("https://www.honestlenses.com/api/orders", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    }),
  ),
  false,
);
assert.equal(
  hasTrustedMutationOrigin(
    new Request("https://www.honestlenses.com/api/orders", {
      method: "POST",
    }),
  ),
  false,
);

const adminByMetadata = {
  id: "admin",
  email: "not-listed@example.com",
  app_metadata: { role: "admin" },
} as unknown as User;
const adminByConfiguredEmail = {
  id: "admin-email",
  email: "CONFIGURED-ADMIN@example.com",
  app_metadata: {},
} as unknown as User;
const nonAdmin = {
  id: "customer",
  email: "customer@example.com",
  app_metadata: {},
} as unknown as User;
assert.equal(isAdminUser(adminByMetadata), "app_metadata");
assert.equal(isAdminUser(adminByConfiguredEmail), "email_allowlist");
assert.equal(isAdminUser(nonAdmin), null);

const armorySecret = "a".repeat(32);
const armoryTimestamp = "1800000000";
const armoryUnsigned = new Request(
  "https://www.honestlenses.com/api/armory/orders?cursor=2026-01-01T00%3A00%3A00.000Z",
);
const armorySignature = createRequestSignature(
  armoryUnsigned,
  armoryTimestamp,
  armorySecret,
);
const armorySigned = new Request(armoryUnsigned.url, {
  headers: {
    "x-hl-timestamp": armoryTimestamp,
    "x-hl-signature": `v1=${armorySignature}`,
  },
});
assert.equal(
  hasValidSignedRequest(armorySigned, armorySecret, 1_800_000_001),
  true,
);
assert.equal(
  hasValidSignedRequest(armorySigned, armorySecret, 1_800_000_301),
  false,
);
assert.equal(
  hasValidSignedRequest(
    new Request(`${armoryUnsigned.url}&limit=100`, {
      headers: armorySigned.headers,
    }),
    armorySecret,
    1_800_000_001,
  ),
  false,
);

function routeFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? routeFiles(path)
      : entry === "route.ts"
        ? [path]
        : [];
  });
}

const workspaceRoot = process.cwd();
const actualRoutes = routeFiles(join(workspaceRoot, "src", "app"))
  .map((path) => relative(workspaceRoot, path).split(sep).join("/"))
  .sort();
const classifiedRoutes = Object.keys(ROUTE_AUTHORIZATION_POLICY).sort();
assert.deepEqual(
  classifiedRoutes,
  actualRoutes,
  "Every Route Handler must have exactly one authorization classification",
);

for (const [path, policy] of Object.entries(ROUTE_AUTHORIZATION_POLICY)) {
  const source = readFileSync(join(workspaceRoot, path), "utf8");
  if (policy.access === "admin") {
    assert.match(source, /requireAdminUser/, `${path} must require admin`);
  }
  if (policy.access === "customer-owned") {
    assert.match(
      source,
      /getOrderAccess|getUserFromRequest/,
      `${path} must resolve a customer principal`,
    );
    assert.match(
      source,
      /canAccessOrder|user_id|guestOrderId/,
      `${path} must enforce object ownership`,
    );
  }
  if (policy.access === "internal" && policy.guard === "requireInternalScope") {
    assert.match(
      source,
      /hasInternalScopeAuthorization/,
      `${path} must require a scoped internal credential`,
    );
  }
}

const migration = readFileSync(
  join(
    workspaceRoot,
    "supabase",
    "migrations",
    "20260729160750_security_remediation_least_privilege.sql",
  ),
  "utf8",
);
assert.match(migration, /drop view if exists public\.admin_orders;/i);
assert.match(migration, /drop view if exists public\.admin_orders_view;/i);
assert.match(
  migration,
  /revoke all privileges on table public\.admin_orders/i,
);
assert.match(
  migration,
  /alter table public\.orders alter column user_id drop not null/i,
);
assert.doesNotMatch(
  readFileSync(
    join(workspaceRoot, "src", "app", "api", "orders", "[id]", "rx", "route.ts"),
    "utf8",
  ),
  /TRUST FRONTEND|incomingVerificationStatus/,
);
assert.doesNotMatch(
  readFileSync(
    join(workspaceRoot, "src", "app", "api", "checkout", "authorized", "route.ts"),
    "utf8",
  ),
  /paymentIntents\.capture/,
);
for (const removedRoute of [
  "src/app/api/orders/[id]/status/route.ts",
  "src/app/api/orders/[id]/capture/route.ts",
  "src/app/api/checkout/capture/route.ts",
]) {
  assert.equal(
    existsSync(join(workspaceRoot, removedRoute)),
    false,
    `${removedRoute} must remain removed`,
  );
}

const forgedPayload = Buffer.from(
  JSON.stringify({
    v: 2,
    aud: "honest-lenses:order-access",
    orderId: "22222222-2222-4222-8222-222222222222",
    iat: issuedAt,
    exp: issuedAt + 86_400,
  }),
).toString("base64url");
const forgedSignature = createHmac("sha256", "wrong-secret")
  .update(forgedPayload)
  .digest("base64url");
assert.equal(
  readGuestOrderIdFromCookieHeader(
    `hl_guest_order=${forgedPayload}.${forgedSignature}`,
    issuedAt + 1,
  ),
  null,
);

console.log("Security regression and route authorization matrix passed");
