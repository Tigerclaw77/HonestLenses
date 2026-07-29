import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function createRequestSignature(
  request: Pick<Request, "method" | "url">,
  timestamp: string,
  secret: string,
): string {
  const url = new URL(request.url);
  const canonical = [
    request.method.toUpperCase(),
    `${url.pathname}${url.search}`,
    timestamp,
  ].join("\n");
  return createHmac("sha256", secret)
    .update(canonical)
    .digest("base64url");
}

export function hasValidSignedRequest(
  request: Request,
  secret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const normalizedSecret = secret?.trim() ?? "";
  if (normalizedSecret.length < 32) return false;

  const timestamp = request.headers.get("x-hl-timestamp")?.trim() ?? "";
  if (!/^\d{10}$/.test(timestamp)) return false;
  const timestampSeconds = Number(timestamp);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS
  ) {
    return false;
  }

  const supplied = request.headers.get("x-hl-signature")?.trim() ?? "";
  const match = supplied.match(/^v1=([A-Za-z0-9_-]{43})$/);
  if (!match) return false;

  const expected = createRequestSignature(
    request,
    timestamp,
    normalizedSecret,
  );
  return safeEqual(match[1], expected);
}
