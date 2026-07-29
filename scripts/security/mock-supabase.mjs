import { createServer } from "node:http";

const port = Number(process.env.MOCK_SUPABASE_PORT ?? 32119);
const now = new Date().toISOString();
const users = {
  "customer-a-token": {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    email: "customer-a@example.invalid",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    role: "authenticated",
    created_at: now,
  },
  "customer-b-token": {
    id: "bbbbbbbb-0000-4000-8000-000000000002",
    email: "customer-b@example.invalid",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    role: "authenticated",
    created_at: now,
  },
  "admin-token": {
    id: "dddddddd-0000-4000-8000-000000000004",
    email: "admin@example.invalid",
    app_metadata: { role: "admin" },
    user_metadata: {},
    aud: "authenticated",
    role: "authenticated",
    created_at: now,
  },
};

const baseOrder = {
  status: "authorized",
  total_amount_cents: 1099,
  revised_total_amount_cents: null,
  verification_status: "pending",
  price_reason: null,
  rx: { left: { sphere: -1 }, right: { sphere: -1 } },
  rx_ocr_raw: null,
  manufacturer: "Validation",
  sku: "VALIDATION-SKU",
  brand: "Validation",
  shipping_method: "standard",
  shipping_cents: 0,
  payment_intent_id: null,
  feedback_credit_cents: 0,
  feedback_credit_applied_at: null,
  feedback_survey_completed_at: null,
  rx_upload_path: null,
  rx_source: "manual",
  shipping_first_name: "Security",
  shipping_last_name: "Gate",
  shipping_email: "security@example.invalid",
  shipping_address1: "1 Validation Way",
  shipping_address2: null,
  shipping_city: "Testville",
  shipping_state: "IL",
  shipping_zip: "60601",
  created_at: now,
  updated_at: now,
  archived: false,
  fulfillment_status: null,
};
const orders = [
  {
    ...baseOrder,
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    user_id: users["customer-a-token"].id,
  },
  {
    ...baseOrder,
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    user_id: users["customer-b-token"].id,
  },
];

function json(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "http://127.0.0.1:3100",
    "access-control-allow-credentials": "true",
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function bearerToken(request) {
  const authorization = request.headers.authorization ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

function matchingOrders(url) {
  const idFilter = url.searchParams.get("id");
  if (!idFilter?.startsWith("eq.")) return orders;
  const id = idFilter.slice(3);
  return orders.filter((order) => order.id === id);
}

const server = createServer((request, response) => {
  if (!request.url) return json(response, 400, { message: "Missing URL" });
  const url = new URL(request.url, `http://127.0.0.1:${port}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": "http://127.0.0.1:3100",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers":
        "authorization, apikey, content-type, prefer, accept-profile, content-profile",
      "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    });
    response.end();
    return;
  }

  if (url.pathname === "/auth/v1/user") {
    const token = bearerToken(request);
    const user = token ? users[token] : null;
    if (!user) return json(response, 401, { message: "Invalid or expired token" });
    return json(response, 200, user);
  }

  if (url.pathname === "/auth/v1/token") {
    return json(response, 401, { message: "Refresh token is invalid" });
  }

  if (url.pathname === "/rest/v1/orders" && request.method === "GET") {
    const rows = matchingOrders(url);
    const wantsObject = String(request.headers.accept ?? "").includes(
      "application/vnd.pgrst.object+json",
    );
    if (wantsObject) {
      if (rows.length !== 1) {
        return json(response, 406, {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
        });
      }
      return json(response, 200, rows[0]);
    }
    return json(response, 200, rows, {
      "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}`,
    });
  }

  if (url.pathname.startsWith("/rest/v1/")) {
    return json(response, 200, []);
  }

  return json(response, 404, { message: "Mock endpoint not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Mock Supabase listening on http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
