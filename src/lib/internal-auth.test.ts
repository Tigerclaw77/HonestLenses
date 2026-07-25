import assert from "node:assert/strict";
import { hasInternalBearerAuthorization } from "./internal-auth";

const url = "http://localhost/api/verification/complete";
const secret = "existing-cron-secret";

assert.equal(
  hasInternalBearerAuthorization(new Request(url), secret),
  false,
  "missing authorization must fail closed",
);
assert.equal(
  hasInternalBearerAuthorization(
    new Request(url, { headers: { Authorization: "Bearer wrong-secret" } }),
    secret,
  ),
  false,
  "an incorrect internal secret must be rejected",
);
assert.equal(
  hasInternalBearerAuthorization(
    new Request(url, { headers: { Authorization: "Bearer undefined" } }),
    undefined,
  ),
  false,
  "an unconfigured secret must reject even a Bearer undefined header",
);
assert.equal(
  hasInternalBearerAuthorization(
    new Request(url, { headers: { Authorization: `Bearer ${secret}` } }),
    secret,
  ),
  true,
  "the existing internal bearer secret must authorize the workflow",
);

console.log("Internal bearer authorization matrix passed");
