import assert from "node:assert/strict";
import {
  getCheckoutRecoveryPath,
  getCurrentOrderRecovery,
  isOrderId,
} from "./orderRecoveryClient";

const orderId = "59d4f6e7-af19-40ee-b0ca-fa4345ba05f2";

assert.equal(isOrderId(orderId), true);
assert.equal(isOrderId("not-an-order"), false);
assert.equal(isOrderId(null), false);

async function run() {
  const recovered = await getCurrentOrderRecovery(async () =>
    Response.json({
      hasRecovery: true,
      orderId,
      resumeUrl: `/checkout?orderId=${orderId}`,
    }),
  );
  assert.deepEqual(recovered, {
    recovery: {
      hasRecovery: true,
      orderId,
      resumeUrl: `/checkout?orderId=${orderId}`,
    },
    failure: null,
  });
  assert.equal(
    getCheckoutRecoveryPath(recovered.recovery),
    `/checkout?orderId=${orderId}`,
  );

  const noRecovery = await getCurrentOrderRecovery(async () =>
    Response.json({ hasRecovery: false }),
  );
  assert.deepEqual(noRecovery, { recovery: null, failure: null });
  assert.equal(
    getCheckoutRecoveryPath(noRecovery.recovery),
    "/cart?notice=checkout",
  );

  const requestFailure = await getCurrentOrderRecovery(async () => {
    throw new TypeError("Load failed");
  });
  assert.equal(requestFailure.recovery, null);
  assert.equal(requestFailure.failure?.kind, "network");

  const invalidResponse = await getCurrentOrderRecovery(async () =>
    Response.json({
      hasRecovery: true,
      orderId,
      resumeUrl: "https://example.com",
    }),
  );
  assert.equal(invalidResponse.recovery, null);
  assert.equal(invalidResponse.failure?.kind, "invalid_response");

  console.log("order recovery client tests passed");
}

void run();
