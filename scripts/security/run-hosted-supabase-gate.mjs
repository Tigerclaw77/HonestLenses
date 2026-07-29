import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const productionProjectRef = "abhkbdyzfbcmpjrobwxq";
const projectRef = process.env.HOSTED_VALIDATION_PROJECT_REF?.trim();
assert(projectRef, "HOSTED_VALIDATION_PROJECT_REF is required");
assert(
  projectRef !== productionProjectRef,
  "Refusing to run hosted validation against the Honest Lenses production project",
);

function parseEnvFile(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function getProjectKeys() {
  const raw = execFileSync(
    "supabase.cmd",
    [
      "projects",
      "api-keys",
      "--project-ref",
      projectRef,
      "--reveal",
      "--output",
      "json",
    ],
    {
      encoding: "utf8",
      windowsHide: true,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const keys = JSON.parse(raw);
  const anonKey = keys.find(
    (entry) => entry.name === "anon" && entry.type === "legacy",
  )?.api_key;
  const serviceRoleKey = keys.find(
    (entry) => entry.name === "service_role" && entry.type === "legacy",
  )?.api_key;
  assert(anonKey, "Disposable project anon key was not found");
  assert(serviceRoleKey, "Disposable project service_role key was not found");
  return { anonKey, serviceRoleKey };
}

function client(url, key) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function assertPermissionDenied(error, label) {
  assert(error, `${label} unexpectedly succeeded`);
  assert(
    ["42501", "PGRST205", "PGRST202"].includes(error.code) ||
      /permission denied|not find the table|not find the function/i.test(
        error.message,
      ),
    `${label} failed for an unexpected reason: ${JSON.stringify(error)}`,
  );
}

async function waitForServer(baseUrl, child, logs) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Next.js exited before validation:\n${logs.slice(-20).join("")}`,
      );
    }
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next.js did not become ready:\n${logs.slice(-20).join("")}`);
}

async function request(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    redirect: "manual",
    ...options,
  });
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  return {
    status: response.status,
    contentType,
    location: response.headers.get("location"),
    body,
  };
}

function bearer(token, extra = {}) {
  return {
    authorization: `Bearer ${token}`,
    ...extra,
  };
}

function armorySignature(url, timestamp, secret) {
  const parsed = new URL(url);
  const canonical = ["GET", `${parsed.pathname}${parsed.search}`, timestamp].join(
    "\n",
  );
  return createHmac("sha256", secret)
    .update(canonical)
    .digest("base64url");
}

async function main() {
  const repositoryRoot = process.cwd();
  const env = parseEnvFile(
    await readFile(path.join(repositoryRoot, ".env.local"), "utf8"),
  );
  const stripeTestKey = env.STRIPE_SECRET_KEY_TEST;
  const stripeTestPublishable =
    env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST;
  assert(
    stripeTestKey?.startsWith("sk_test_"),
    "A dedicated Stripe test-mode secret is required",
  );
  assert(
    stripeTestPublishable?.startsWith("pk_test_"),
    "A dedicated Stripe test-mode publishable key is required",
  );

  const { anonKey, serviceRoleKey } = getProjectKeys();
  const supabaseUrl = `https://${projectRef}.supabase.co`;
  const service = client(supabaseUrl, serviceRoleKey);
  const anonymous = client(supabaseUrl, anonKey);
  const runId = randomUUID();
  const suffix = runId.replaceAll("-", "").slice(0, 12);
  const password = `${randomBytes(18).toString("base64url")}Aa1!`;
  const identities = [
    {
      label: "customerA",
      email: `hl-rehearsal-customer-a-${suffix}@example.invalid`,
      app_metadata: {},
    },
    {
      label: "customerB",
      email: `hl-rehearsal-customer-b-${suffix}@example.invalid`,
      app_metadata: {},
    },
    {
      label: "admin",
      email: `hl-rehearsal-admin-${suffix}@example.invalid`,
      app_metadata: { role: "admin" },
    },
  ];
  const users = {};
  let nextProcess;
  const nextLogs = [];

  try {
    for (const identity of identities) {
      const { data, error } = await service.auth.admin.createUser({
        email: identity.email,
        password,
        email_confirm: true,
        app_metadata: identity.app_metadata,
      });
      assert.ifError(error);
      assert(data.user, `${identity.label} user was not created`);
      users[identity.label] = { ...identity, user: data.user };
    }

    const orderAssignments = [
      [
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        users.customerA.user.id,
      ],
      [
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        users.customerB.user.id,
      ],
    ];
    for (const [orderId, userId] of orderAssignments) {
      const { error } = await service
        .from("orders")
        .update({ user_id: userId, status: "authorized" })
        .eq("id", orderId);
      assert.ifError(error);
    }

    for (const identity of identities) {
      const authClient = client(supabaseUrl, anonKey);
      const { data, error } = await authClient.auth.signInWithPassword({
        email: identity.email,
        password,
      });
      assert.ifError(error);
      assert(data.session?.access_token, `${identity.label} did not receive a session`);
      users[identity.label].accessToken = data.session.access_token;
      users[identity.label].client = authClient;
    }

    const { error: anonymousOrdersError } = await anonymous
      .from("orders")
      .select("id");
    assertPermissionDenied(anonymousOrdersError, "anonymous orders read");

    const { data: customerAOrders, error: customerAOrdersError } =
      await users.customerA.client
        .from("orders")
        .select("id,user_id")
        .order("id");
    assert.ifError(customerAOrdersError);
    assert.deepEqual(
      customerAOrders?.map((order) => order.id),
      ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      "Customer A enumerated an order they do not own",
    );

    const { data: crossAccountRows, error: crossAccountError } =
      await users.customerA.client
        .from("orders")
        .select("id")
        .eq("id", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    assert.ifError(crossAccountError);
    assert.equal(crossAccountRows?.length, 0, "Cross-account UUID read succeeded");

    const { data: forgedRows, error: forgedError } = await users.customerA.client
      .from("orders")
      .select("id")
      .eq("id", "ffffffff-ffff-4fff-8fff-ffffffffffff");
    assert.ifError(forgedError);
    assert.equal(forgedRows?.length, 0, "Forged UUID enumeration returned a row");

    const { data: ownerUpdate, error: ownerUpdateError } =
      await users.customerA.client
        .from("orders")
        .update({ status: "pending" })
        .eq("id", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        .select("id,status");
    assert.ifError(ownerUpdateError);
    assert.equal(ownerUpdate?.length, 1, "Owner update did not affect its order");

    const { data: crossUpdate, error: crossUpdateError } =
      await users.customerA.client
        .from("orders")
        .update({ status: "captured" })
        .eq("id", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
        .select("id");
    assert.ifError(crossUpdateError);
    assert.equal(crossUpdate?.length, 0, "Cross-account update affected a row");

    const { error: ownerReassignmentError } = await users.customerA.client
      .from("orders")
      .update({ user_id: users.customerB.user.id })
      .eq("id", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    assert(
      ownerReassignmentError,
      "RLS WITH CHECK allowed customer A to reassign its order",
    );

    const { error: anonymousRpcError } = await anonymous.rpc(
      "consume_rate_limit",
      {
        p_bucket_key: "hosted-anon-probe-0001",
        p_limit: 1,
        p_window_seconds: 60,
      },
    );
    assertPermissionDenied(anonymousRpcError, "anonymous protected RPC");

    const { error: authenticatedRpcError } =
      await users.customerA.client.rpc("consume_rate_limit", {
        p_bucket_key: "hosted-auth-probe-0001",
        p_limit: 1,
        p_window_seconds: 60,
      });
    assertPermissionDenied(
      authenticatedRpcError,
      "authenticated protected RPC",
    );

    const { data: serviceRpc, error: serviceRpcError } = await service.rpc(
      "consume_rate_limit",
      {
        p_bucket_key: `hosted-service-${suffix}`,
        p_limit: 1,
        p_window_seconds: 60,
      },
    );
    assert.ifError(serviceRpcError);
    assert.equal(serviceRpc, true, "service_role could not execute protected RPC");

    const { error: adminViewError } = await anonymous
      .from("admin_orders")
      .select("id");
    assertPermissionDenied(adminViewError, "removed anonymous admin view");

    const { error: protectedEmailTableError } = await anonymous
      .from("order_email_deliveries")
      .select("resend_email_id");
    assertPermissionDenied(
      protectedEmailTableError,
      "anonymous email-delivery table read",
    );

    await service
      .from("orders")
      .update({ status: "authorized" })
      .in("id", [
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ]);

    const port = Number(process.env.HOSTED_VALIDATION_PORT ?? 31129);
    const baseUrl = `http://127.0.0.1:${port}`;
    const armorySecret = `hosted-armory-${randomBytes(24).toString("hex")}`;
    nextProcess = spawn(
      process.execPath,
      [
        path.join(
          repositoryRoot,
          "node_modules",
          "next",
          "dist",
          "bin",
          "next",
        ),
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd: repositoryRoot,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
          SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
          SITE_URL: baseUrl,
          NEXT_PUBLIC_SITE_URL: baseUrl,
          STRIPE_SECRET_KEY: stripeTestKey,
          NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: stripeTestPublishable,
          COMMERCE_V2_ENABLED: "false",
          PRESCRIPTION_OCR_ENABLED: "false",
          GUEST_ORDER_COOKIE_SECRET:
            "hosted-guest-security-secret-0123456789",
          ORDER_RESUME_TOKEN_SECRET:
            "hosted-resume-security-secret-0123456789",
          RATE_LIMIT_KEY_SECRET:
            "hosted-rate-security-secret-0123456789",
          ADMIN_EMAILS: users.admin.email,
          ADMIN_ALERT_EMAIL: users.admin.email,
          ARMORY_SIGNING_SECRET: armorySecret,
          NEXT_PUBLIC_POSTHOG_SESSION_REPLAY: "false",
          NEXT_PUBLIC_POSTHOG_CAPTURE_EXCEPTIONS: "false",
          NEXT_PUBLIC_POSTHOG_KEY: "",
          POSTHOG_PROJECT_API_KEY: "",
        },
      },
    );
    nextProcess.stdout.on("data", (chunk) => nextLogs.push(chunk.toString()));
    nextProcess.stderr.on("data", (chunk) => nextLogs.push(chunk.toString()));
    await waitForServer(baseUrl, nextProcess, nextLogs);

    const apiResults = {};
    apiResults.anonymousOrder = await request(
      baseUrl,
      "/api/orders/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    assert.equal(apiResults.anonymousOrder.status, 401);

    apiResults.ownerOrder = await request(
      baseUrl,
      "/api/orders/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      { headers: bearer(users.customerA.accessToken) },
    );
    assert.equal(apiResults.ownerOrder.status, 200);

    apiResults.crossAccountOrder = await request(
      baseUrl,
      "/api/orders/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      { headers: bearer(users.customerA.accessToken) },
    );
    assert.equal(apiResults.crossAccountOrder.status, 403);

    apiResults.forgedOrder = await request(
      baseUrl,
      "/api/orders/ffffffff-ffff-4fff-8fff-ffffffffffff",
      { headers: bearer(users.customerA.accessToken) },
    );
    assert.equal(apiResults.forgedOrder.status, 404);

    apiResults.expiredOrder = await request(
      baseUrl,
      "/api/orders/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      { headers: bearer("expired-hosted-validation-token") },
    );
    assert.equal(apiResults.expiredOrder.status, 401);

    apiResults.ownerReceipt = await request(
      baseUrl,
      "/order/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/receipt",
      { headers: bearer(users.customerA.accessToken) },
    );
    assert.equal(apiResults.ownerReceipt.status, 200);
    assert.match(apiResults.ownerReceipt.contentType, /text\/html/);

    apiResults.crossAccountReceipt = await request(
      baseUrl,
      "/order/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/receipt",
      { headers: bearer(users.customerA.accessToken) },
    );
    assert.equal(apiResults.crossAccountReceipt.status, 404);

    const rxPayload = {
      patient_name: "Hosted Security Gate",
      prescriber_name: "Dr Validation",
      prescriber_phone: "3125550100",
      expires: "2027-07-29",
      verification_status: "verified",
      right: {
        coreId: "OASYS_MAX_1D",
        sphere: -1,
        base_curve: 8.5,
        diameter: 14.3,
      },
    };
    apiResults.manipulatedRx = await request(
      baseUrl,
      "/api/orders/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/rx",
      {
        method: "POST",
        headers: bearer(users.customerA.accessToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify(rxPayload),
      },
    );
    assert.equal(apiResults.manipulatedRx.status, 200);
    assert.equal(apiResults.manipulatedRx.body.verification_status, "pending");

    apiResults.crossAccountRx = await request(
      baseUrl,
      "/api/orders/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/rx",
      {
        method: "POST",
        headers: bearer(users.customerA.accessToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify(rxPayload),
      },
    );
    assert.equal(apiResults.crossAccountRx.status, 403);

    apiResults.customerAdminApi = await request(
      baseUrl,
      "/api/admin/orders",
      { headers: bearer(users.customerA.accessToken) },
    );
    assert.equal(apiResults.customerAdminApi.status, 403);

    apiResults.adminOrdersApi = await request(baseUrl, "/api/admin/orders", {
      headers: bearer(users.admin.accessToken),
    });
    assert.equal(apiResults.adminOrdersApi.status, 200);

    apiResults.adminFulfillmentOverride = await request(
      baseUrl,
      "/api/admin/orders/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      {
        method: "PATCH",
        headers: bearer(users.admin.accessToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({ fulfillment_status: "hold" }),
      },
    );
    assert.equal(apiResults.adminFulfillmentOverride.status, 200);
    assert.equal(apiResults.adminFulfillmentOverride.body.event_logged, true);

    const armoryUrl = `${baseUrl}/api/armory/orders?limit=10`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    apiResults.armoryUnsigned = await request(
      baseUrl,
      "/api/armory/orders?limit=10",
    );
    assert.equal(apiResults.armoryUnsigned.status, 401);
    apiResults.armorySigned = await request(
      baseUrl,
      "/api/armory/orders?limit=10",
      {
        headers: {
          "x-hl-timestamp": timestamp,
          "x-hl-signature": `v1=${armorySignature(
            armoryUrl,
            timestamp,
            armorySecret,
          )}`,
        },
      },
    );
    assert.equal(apiResults.armorySigned.status, 200);

    const { data: auditRows, error: auditError } = await service
      .from("order_events")
      .select("event_type,actor,before,after")
      .eq("order_id", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
      .eq("event_type", "admin_fulfillment_override");
    assert.ifError(auditError);
    assert(
      (auditRows?.length ?? 0) >= 1,
      "Admin override audit event is missing",
    );

    const publicApiResults = Object.fromEntries(
      Object.entries(apiResults).map(([name, result]) => [
        name,
        {
          status: result.status,
          contentType: result.contentType,
          location: result.location,
          verificationStatus:
            result.body && typeof result.body === "object"
              ? result.body.verification_status ?? null
              : null,
          eventLogged:
            result.body && typeof result.body === "object"
              ? result.body.event_logged ?? null
              : null,
        },
      ]),
    );

    console.log(
      JSON.stringify(
        {
          environment: {
            projectRef,
            productionConnected: false,
            hostedSupabase: true,
            stripeMode: "test",
            commerceV2Enabled: false,
          },
          auth: {
            createdUsers: identities.map((identity) => identity.label),
            appMetadataAdmin: true,
            sessionsIssued: true,
          },
          hostedRls: {
            anonymousOrdersDenied: true,
            customerAVisibleOrderIds: customerAOrders.map((order) => order.id),
            crossAccountReadRows: crossAccountRows.length,
            forgedUuidRows: forgedRows.length,
            ownerUpdateRows: ownerUpdate.length,
            crossAccountUpdateRows: crossUpdate.length,
            ownerReassignmentDenied: true,
            anonymousProtectedRpcDenied: true,
            authenticatedProtectedRpcDenied: true,
            serviceProtectedRpcAllowed: serviceRpc,
            removedAdminViewDenied: true,
            protectedEmailTableDenied: true,
          },
          applicationAuthorization: publicApiResults,
          audit: {
            adminFulfillmentEvents: auditRows.length,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    if (nextProcess && nextProcess.exitCode === null) {
      nextProcess.kill("SIGTERM");
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 3_000);
        nextProcess.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    for (const identity of Object.values(users)) {
      if (identity.user?.id) {
        await service.auth.admin.deleteUser(identity.user.id).catch(() => {});
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
