import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ORDER_ACCESS_TOKEN_TTL_DAYS = 90;
const TTL_SECONDS = ORDER_ACCESS_TOKEN_TTL_DAYS * 24 * 60 * 60;
const AUDIENCE = "honest-lenses:customer-order-link";
const PURPOSE = "order_status";
const TOKEN_VERSION = "v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

type Claims = { v: 1; aud: typeof AUDIENCE; purpose: typeof PURPOSE; orderId: string; iat: number; exp: number };

function secret(): string {
  const value = process.env.ORDER_ACCESS_TOKEN_SECRET?.trim();
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    throw new Error("A strong ORDER_ACCESS_TOKEN_SECRET is required for order links");
  }
  return value;
}

function key(label: string): Buffer {
  return createHmac("sha256", secret()).update(`customer-order-email-link:${TOKEN_VERSION}:${label}`).digest();
}

function signature(material: string): Buffer {
  return createHmac("sha256", key("signature")).update(material).digest();
}

export function issueOrderAccessToken(orderId: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  if (!UUID_PATTERN.test(orderId) || !Number.isSafeInteger(nowSeconds) || nowSeconds < 0) {
    throw new Error("A valid order ID and issue time are required");
  }
  const claims: Claims = { v: 1, aud: AUDIENCE, purpose: PURPOSE, orderId, iat: nowSeconds, exp: nowSeconds + TTL_SECONDS };
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("encryption"), nonce);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(claims), "utf8"), cipher.final()]);
  const material = `${TOKEN_VERSION}.${nonce.toString("base64url")}.${ciphertext.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
  return `${material}.${signature(material).toString("base64url")}`;
}

export function verifyOrderAccessToken(token: string, nowSeconds = Math.floor(Date.now() / 1000)): string | null {
  if (token.length > 1024 || !TOKEN_PATTERN.test(token)) return null;
  const parts = token.split(".");
  if (parts.slice(1).some((part) => Buffer.from(part, "base64url").toString("base64url") !== part)) return null;
  const material = parts.slice(0, 4).join(".");
  const suppliedSignature = Buffer.from(parts[4], "base64url");
  const expectedSignature = signature(material);
  if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) return null;
  try {
    const nonce = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    if (nonce.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", key("encryption"), nonce);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(Buffer.from(parts[2], "base64url")), decipher.final()]);
    const claims = JSON.parse(plaintext.toString("utf8")) as Partial<Claims>;
    if (claims.v !== 1 || claims.aud !== AUDIENCE || claims.purpose !== PURPOSE ||
      typeof claims.orderId !== "string" || !UUID_PATTERN.test(claims.orderId) ||
      !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
      claims.iat! > nowSeconds + 60 || claims.exp! <= nowSeconds || claims.exp! - claims.iat! !== TTL_SECONDS) return null;
    return claims.orderId;
  } catch {
    return null;
  }
}

export function getOrderAccessUrl(orderId: string, siteUrl?: string): string {
  const baseUrl = (siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "https://www.honestlenses.com").replace(/\/$/, "");
  return `${baseUrl}/order-access/${issueOrderAccessToken(orderId)}`;
}
