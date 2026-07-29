import { createHmac, timingSafeEqual } from "node:crypto";

export const WRITE_DRAIN_HEADER_SCOPE = "x-hl-write-drain-scope";
export const WRITE_DRAIN_HEADER_TIMESTAMP = "x-hl-write-drain-timestamp";
export const WRITE_DRAIN_HEADER_NONCE = "x-hl-write-drain-nonce";
export const WRITE_DRAIN_HEADER_SIGNATURE = "x-hl-write-drain-signature";

const CANARY_MAX_AGE_SECONDS = 60;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const VALID_MODES = new Set(["off", "all", "webhooks", "operations"]);
const NONCE_PATTERN = /^[a-f0-9]{32}$/;

export type WriteDrainMode = "off" | "all" | "webhooks" | "operations";
export type WriteRouteGroup = "webhooks" | "operations" | "checkout";

export type WriteDrainDecision = {
  allowed: boolean;
  bypassed: boolean;
  group: WriteRouteGroup | null;
  mode: WriteDrainMode;
  reason:
    | "safe-method"
    | "drain-disabled"
    | "phase-open"
    | "valid-canary"
    | "write-drained";
};

type WriteDrainOptions = {
  mode?: string;
  secret?: string;
  nowSeconds?: number;
};

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function normalizeWriteDrainMode(value?: string): WriteDrainMode {
  const normalized = value?.trim().toLowerCase() || "off";
  if (VALID_MODES.has(normalized)) return normalized as WriteDrainMode;

  // A misspelled non-empty production setting must fail closed.
  return "all";
}

export function classifyWriteRoute(pathname: string): WriteRouteGroup {
  if (pathname.startsWith("/api/webhooks/")) return "webhooks";

  if (
    pathname.startsWith("/api/admin/") ||
    pathname.startsWith("/api/internal/") ||
    pathname === "/admin/orders/image-url" ||
    /^\/api\/orders\/[^/]+\/(?:archive|verify)$/.test(pathname) ||
    /^\/api\/verification\/(?:complete|process)$/.test(pathname)
  ) {
    return "operations";
  }

  return "checkout";
}

export function createWriteDrainSignature(
  method: string,
  pathname: string,
  scope: WriteRouteGroup,
  timestamp: string,
  nonce: string,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(
      [
        "v1",
        method.toUpperCase(),
        pathname,
        scope,
        timestamp,
        nonce,
      ].join("\n"),
    )
    .digest("base64url");
}

function hasValidCanaryBypass(
  request: Request,
  group: WriteRouteGroup,
  secret: string | undefined,
  nowSeconds: number,
): boolean {
  if (!secret || secret.length < 32 || group === "webhooks") return false;

  const scope = request.headers.get(WRITE_DRAIN_HEADER_SCOPE);
  const timestamp = request.headers.get(WRITE_DRAIN_HEADER_TIMESTAMP);
  const nonce = request.headers.get(WRITE_DRAIN_HEADER_NONCE);
  const signature = request.headers.get(WRITE_DRAIN_HEADER_SIGNATURE);
  if (
    scope !== group ||
    !timestamp ||
    !nonce ||
    !signature ||
    !NONCE_PATTERN.test(nonce)
  ) {
    return false;
  }

  const issuedAt = Number(timestamp);
  if (
    !Number.isSafeInteger(issuedAt) ||
    Math.abs(nowSeconds - issuedAt) > CANARY_MAX_AGE_SECONDS
  ) {
    return false;
  }

  const pathname = new URL(request.url).pathname;
  const expected = createWriteDrainSignature(
    request.method,
    pathname,
    group,
    timestamp,
    nonce,
    secret,
  );
  return safeEqual(signature, expected);
}

export function evaluateWriteDrain(
  request: Request,
  options: WriteDrainOptions = {},
): WriteDrainDecision {
  const mode = normalizeWriteDrainMode(
    options.mode ?? process.env.PRODUCTION_WRITE_DRAIN_MODE,
  );
  if (SAFE_METHODS.has(request.method.toUpperCase())) {
    return {
      allowed: true,
      bypassed: false,
      group: null,
      mode,
      reason: "safe-method",
    };
  }

  const group = classifyWriteRoute(new URL(request.url).pathname);
  if (mode === "off") {
    return {
      allowed: true,
      bypassed: false,
      group,
      mode,
      reason: "drain-disabled",
    };
  }

  if (
    (mode === "webhooks" && group === "webhooks") ||
    (mode === "operations" &&
      (group === "webhooks" || group === "operations"))
  ) {
    return {
      allowed: true,
      bypassed: false,
      group,
      mode,
      reason: "phase-open",
    };
  }

  if (
    hasValidCanaryBypass(
      request,
      group,
      options.secret ?? process.env.WRITE_DRAIN_CANARY_SECRET,
      options.nowSeconds ?? Math.floor(Date.now() / 1000),
    )
  ) {
    return {
      allowed: true,
      bypassed: true,
      group,
      mode,
      reason: "valid-canary",
    };
  }

  return {
    allowed: false,
    bypassed: false,
    group,
    mode,
    reason: "write-drained",
  };
}

export function stripWriteDrainCanaryHeaders(headers: Headers): Headers {
  const sanitized = new Headers(headers);
  sanitized.delete(WRITE_DRAIN_HEADER_SCOPE);
  sanitized.delete(WRITE_DRAIN_HEADER_TIMESTAMP);
  sanitized.delete(WRITE_DRAIN_HEADER_NONCE);
  sanitized.delete(WRITE_DRAIN_HEADER_SIGNATURE);
  return sanitized;
}
