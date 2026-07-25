import { createHash, timingSafeEqual } from "node:crypto";

function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}

function secretsMatch(supplied: string, expected: string): boolean {
  const suppliedHash = createHash("sha256").update(supplied).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(suppliedHash, expectedHash);
}

export function hasInternalBearerAuthorization(
  request: Request,
  configuredSecret = process.env.CRON_SECRET,
): boolean {
  const expected = configuredSecret?.trim() ?? "";
  if (!expected) return false;

  const supplied = bearerToken(request.headers.get("authorization"));
  return Boolean(supplied && secretsMatch(supplied, expected));
}
