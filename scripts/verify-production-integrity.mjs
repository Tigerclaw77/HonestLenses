import assert from "node:assert/strict";
import http from "node:http";
import next from "next";

const port = 3107;
const secret = "local-integrity-validation-secret";
process.env.CRON_SECRET = secret;

const app = next({ dev: false, dir: process.cwd() });
const handler = app.getRequestHandler();

await app.prepare();

const server = http.createServer((request, response) => {
  handler(request, response);
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "127.0.0.1", resolve);
});

try {
  const unauthorized = await fetch(
    `http://127.0.0.1:${port}/api/verification/complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: "test", result: "verified" }),
    },
  );
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(await unauthorized.json(), { error: "Unauthorized" });

  const authorized = await fetch(
    `http://127.0.0.1:${port}/api/verification/complete`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    },
  );
  assert.equal(authorized.status, 400);
  assert.deepEqual(await authorized.json(), { error: "Invalid request" });

  console.log(
    "Verification completion HTTP authorization passed (401 unauthorized; authorized workflow reached 400 payload validation).",
  );
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await app.close();
}
