import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const checkoutPage = source("src/app/checkout/page.tsx");
const checkoutStyles = source("src/app/checkout/checkout.module.css");
const checkoutPayRoute = source("src/app/api/checkout/pay/route.ts");

assert.match(
  checkoutStyles,
  /\.card\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(280px, 0\.78fr\) minmax\(440px, 1\.22fr\)/,
  "desktop checkout must use two columns",
);
assert.match(
  checkoutStyles,
  /@media \(max-width: 800px\)[\s\S]*?\.card\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
  "mobile checkout must stack into one column",
);

assert.match(checkoutPage, />Order Summary</);
assert.match(checkoutPage, />Payment</);
assert.match(
  checkoutPage,
  /Your card is authorized when you order and charged after\s+prescription verification\./,
);
assert.doesNotMatch(
  checkoutPage,
  /Have vision insurance|Vision plan|HSA\/FSA|reimbursement/i,
  "checkout must not render insurance or HSA/FSA UI",
);

assert.match(
  checkoutPage,
  /paymentMethodOrder:\s*\[\s*"card",\s*"link",\s*"us_bank_account",\s*"affirm",\s*"cashapp",\s*\]/,
  "Payment Element must preserve card, Link, bank, Affirm, and Cash App ordering",
);
assert.doesNotMatch(
  checkoutPage,
  /amazon_pay/,
  "Amazon Pay must not be offered by the Payment Element",
);

assert.match(
  checkoutPayRoute,
  /capture_method:\s*"manual"/,
  "manual capture must remain unchanged",
);
assert.match(
  checkoutPayRoute,
  /automatic_payment_methods:\s*\{ enabled: true \}/,
  "automatic payment methods must remain enabled",
);
assert.equal(
  (checkoutPayRoute.match(/excluded_payment_method_types:\s*\["amazon_pay"\]/g) ?? [])
    .length,
  2,
  "Amazon Pay must be excluded for both new and reusable PaymentIntents",
);

console.log("Checkout simplification regression tests passed");
