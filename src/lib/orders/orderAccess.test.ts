import assert from "node:assert/strict";
import { canAccessOrder, getOrderAccess } from "@/lib/order-access";
import { buildOrderAccessEmail } from "@/lib/email/orderAccessEmail";
import { deliverMatchedOrderAccess, FIND_ORDER_NEUTRAL_MESSAGE, isRecoverableOrder, parseFindOrderInput } from "./findOrder";
import { getOrderAccessUrl, issueOrderAccessToken, ORDER_ACCESS_TOKEN_TTL_DAYS, verifyOrderAccessToken } from "./orderAccessToken";
import { GET } from "@/app/order-access/[token]/route";
import { createOrderStatusSession, readOrderStatusSession } from "./orderStatusSession";

async function main() {
process.env.GUEST_ORDER_COOKIE_SECRET = "g".repeat(32);
process.env.ORDER_ACCESS_TOKEN_SECRET = "o".repeat(32);
const orderId = "11111111-1111-4111-8111-111111111111";
const otherOrderId = "22222222-2222-4222-8222-222222222222";
const now = Math.floor(Date.now() / 1000);
assert.equal(ORDER_ACCESS_TOKEN_TTL_DAYS, 90);

// A guest opening the emailed link immediately gets an HttpOnly order-scoped session.
const url = getOrderAccessUrl(orderId, "https://www.honestlenses.com/");
assert.match(url, /^https:\/\/www\.honestlenses\.com\/order-access\//);
const token = url.split("/").at(-1)!;
assert.equal(verifyOrderAccessToken(token, now), orderId);
assert.doesNotMatch(token, new RegExp(orderId));
assert.doesNotMatch(Buffer.from(token.split(".")[2], "base64url").toString("utf8"), new RegExp(orderId));
assert.notEqual(issueOrderAccessToken(orderId, now), token, "new links use distinct random nonces");
const forgedParts = token.split(".");
forgedParts[2] = Buffer.from("another order").toString("base64url");
assert.equal(verifyOrderAccessToken(forgedParts.join("."), now), null, "ciphertext cannot be modified or reused for another order");
process.env.ORDER_ACCESS_TOKEN_SECRET = "x".repeat(32);
assert.equal(verifyOrderAccessToken(token, now), null, "a different signing key cannot validate the link");
process.env.ORDER_ACCESS_TOKEN_SECRET = "o".repeat(32);
assert.throws(() => { process.env.ORDER_ACCESS_TOKEN_SECRET = "weak"; issueOrderAccessToken(orderId, now); }, /strong ORDER_ACCESS_TOKEN_SECRET/);
process.env.ORDER_ACCESS_TOKEN_SECRET = "o".repeat(32);
const response = await GET(new Request(url), { params: Promise.resolve({ token }) });
assert.equal(response.status, 303);
assert.equal(response.headers.get("location"), "https://www.honestlenses.com/your-order");
assert.match(response.headers.get("set-cookie") ?? "", /hl_order_status=/);
assert.match(response.headers.get("set-cookie") ?? "", /httponly/i);
assert.match(response.headers.get("set-cookie") ?? "", /Path=\/your-order/);
assert.doesNotMatch(response.headers.get("set-cookie") ?? "", /hl_guest_order=/);
const cookie = response.headers.get("set-cookie")!.split(";")[0];
const statusSession = cookie.split("=")[1];
assert.equal(readOrderStatusSession(statusSession), orderId);
assert.equal(readOrderStatusSession(createOrderStatusSession(otherOrderId)), otherOrderId);
assert.notEqual(statusSession, createOrderStatusSession(otherOrderId));
const apiAccess = await getOrderAccess(new Request(`https://www.honestlenses.com/api/orders/${orderId}`, {
  headers: { cookie },
}));
assert.equal(apiAccess.guestOrderId, null, "email-link session does not authorize customer order APIs");

// The link remains valid after the unrelated 24-hour browser cookie expires.
const oldToken = issueOrderAccessToken(orderId, now - 25 * 60 * 60);
assert.equal(verifyOrderAccessToken(oldToken, now), orderId);
assert.equal(readOrderStatusSession(statusSession, now + 24 * 60 * 60), null);
const reopened = await GET(new Request(`https://www.honestlenses.com/order-access/${oldToken}`), { params: Promise.resolve({ token: oldToken }) });
assert.equal(reopened.status, 303);
assert.match(reopened.headers.get("set-cookie") ?? "", /hl_order_status=/);

const lastValidSecond = issueOrderAccessToken(orderId, now - (ORDER_ACCESS_TOKEN_TTL_DAYS * 24 * 60 * 60 - 1));
assert.equal(verifyOrderAccessToken(lastValidSecond, now), orderId);

const expired = issueOrderAccessToken(orderId, now - (ORDER_ACCESS_TOKEN_TTL_DAYS * 24 * 60 * 60 + 1));
assert.equal(verifyOrderAccessToken(expired, now), null);
const signatureStart = token.lastIndexOf(".") + 1;
const invalidSignature = `${token.slice(0, signatureStart)}${token[signatureStart] === "A" ? "B" : "A"}${token.slice(signatureStart + 1)}`;
for (const invalid of [expired, invalidSignature, "invalid"]) {
  const result = await GET(new Request(`https://www.honestlenses.com/order-access/${invalid}`), { params: Promise.resolve({ token: invalid }) });
  assert.equal(result.headers.get("location"), "https://www.honestlenses.com/find-order?link=unavailable");
  assert.equal(result.headers.get("set-cookie"), null);
}

const input = parseFindOrderInput({ orderNumber: "HL-2026-A1B2C3D4E5F6", email: " Customer@Example.com " });
assert.deepEqual(input, { orderNumber: "HL-2026-A1B2C3D4E5F6", email: "customer@example.com" });
const order = { id: orderId, status: "shipped", shipping_email: "customer@example.com" };
assert.equal(isRecoverableOrder(order, "wrong@example.com"), false);
assert.equal(isRecoverableOrder(order, input!.email), true);
assert.equal(isRecoverableOrder({ ...order, status: "draft" }, input!.email), false);
const deliveries: string[] = [];
await deliverMatchedOrderAccess(order, "wrong@example.com", async (matched) => { deliveries.push(matched.id); });
assert.equal(deliveries.length, 0, "an incorrect order/email pair never issues access");
await deliverMatchedOrderAccess(order, input!.email, async (matched) => { deliveries.push(matched.id); });
assert.deepEqual(deliveries, [orderId], "a matching pair sends only the matched order's access");
const recoveredUrl = getOrderAccessUrl(order.id);
assert.equal(verifyOrderAccessToken(recoveredUrl.split("/").at(-1)!, now), orderId);
const recoveryEmail = buildOrderAccessEmail(recoveredUrl);
assert.match(recoveryEmail.html, /View Your Order/);
assert.match(recoveryEmail.html, /expires in 90 days/);
assert.match(recoveryEmail.text, /expires in 90 days/);
assert.match(FIND_ORDER_NEUTRAL_MESSAGE, /If the order details match/);

const guestAccess = { user: null, userId: null, userEmail: null, guestOrderId: readOrderStatusSession(statusSession), distinctId: `guest:${orderId}`, source: "guest" as const, originValid: true };
assert.equal(canAccessOrder(guestAccess, { id: orderId, user_id: null }), true);
assert.equal(canAccessOrder(guestAccess, { id: otherOrderId, user_id: null }), false);
assert.equal(canAccessOrder({ ...guestAccess, guestOrderId: null }, { id: orderId, user_id: null }), false);

console.log("Customer order access and recovery regression passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
