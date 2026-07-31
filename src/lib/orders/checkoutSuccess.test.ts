import assert from "node:assert/strict";
import { buildCheckoutSuccessPath } from "./checkoutSuccess";

const orderId = "59d4f6e7-af19-40ee-b0ca-fa4345ba05f2";

assert.equal(
  buildCheckoutSuccessPath({ orderId, mode: "uploaded" }),
  `/checkout/success?mode=uploaded&orderId=${orderId}`,
);

assert.equal(
  buildCheckoutSuccessPath({
    orderId,
    mode: "passive",
    deadline: "2026-08-03T18:00:00.000Z",
  }),
  `/checkout/success?mode=passive&orderId=${orderId}&deadline=2026-08-03T18%3A00%3A00.000Z`,
);

console.log("Checkout success redirect tests passed");
