import { randomBytes } from "node:crypto";
import {
  WRITE_DRAIN_HEADER_NONCE,
  WRITE_DRAIN_HEADER_SCOPE,
  WRITE_DRAIN_HEADER_SIGNATURE,
  WRITE_DRAIN_HEADER_TIMESTAMP,
  classifyWriteRoute,
  createWriteDrainSignature,
} from "../../src/lib/security/writeDrain.ts";

const [method, rawUrl] = process.argv.slice(2);
if (!method || !rawUrl) {
  throw new Error(
    "Usage: npm run write-drain:sign -- <METHOD> <absolute production URL>",
  );
}

const secret = process.env.WRITE_DRAIN_CANARY_SECRET?.trim();
if (!secret || secret.length < 32) {
  throw new Error(
    "WRITE_DRAIN_CANARY_SECRET must be configured with at least 32 characters",
  );
}

const url = new URL(rawUrl);
const approvedOrigin = process.env.SITE_URL?.trim();
if (!approvedOrigin || url.origin !== new URL(approvedOrigin).origin) {
  throw new Error("The requested URL must use the configured SITE_URL origin");
}

const normalizedMethod = method.toUpperCase();
if (["GET", "HEAD", "OPTIONS"].includes(normalizedMethod)) {
  throw new Error("Canary signatures are only valid for write methods");
}

const scope = classifyWriteRoute(url.pathname);
if (scope === "webhooks") {
  throw new Error("Webhook routes cannot use the operator canary bypass");
}

const timestamp = String(Math.floor(Date.now() / 1000));
const nonce = randomBytes(16).toString("hex");
const signature = createWriteDrainSignature(
  normalizedMethod,
  url.pathname,
  scope,
  timestamp,
  nonce,
  secret,
);

console.log(
  JSON.stringify(
    {
      method: normalizedMethod,
      url: url.toString(),
      expiresInSeconds: 60,
      headers: {
        [WRITE_DRAIN_HEADER_SCOPE]: scope,
        [WRITE_DRAIN_HEADER_TIMESTAMP]: timestamp,
        [WRITE_DRAIN_HEADER_NONCE]: nonce,
        [WRITE_DRAIN_HEADER_SIGNATURE]: signature,
      },
    },
    null,
    2,
  ),
);
