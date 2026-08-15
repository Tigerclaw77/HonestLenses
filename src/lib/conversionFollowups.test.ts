import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const browsePage = source("src/app/browse/page.tsx");
const globalStyles = source("src/styles/globals.css");
const uploadPage = source("src/app/upload-prescription/page.tsx");
const checkoutPage = source("src/app/checkout/page.tsx");
const checkoutStyles = source("src/app/checkout/checkout.module.css");
const purchaseTrust = source("src/components/conversion/PurchaseTrust.tsx");

assert.match(browsePage, /className="browse-layout"/);
assert.match(browsePage, /className="browse-filters"/);
assert.match(browsePage, /className="browse-manufacturer-options"/);
assert.equal((browsePage.match(/placeholder="Lens name\.\.\."/g) ?? []).length, 1);
assert.equal((browsePage.match(/setManufacturerFilter/g) ?? []).length, 2);

assert.match(
  globalStyles,
  /@media \(max-width: 768px\)[\s\S]*?\.browse-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
);
assert.match(
  globalStyles,
  /@media \(max-width: 768px\)[\s\S]*?\.browse-filters\s*\{[\s\S]*?display:\s*block/,
);

assert.match(
  uploadPage,
  /You can complete payment now\. Lenses ship only after prescription\s+verification is complete\./,
);
assert.doesNotMatch(
  uploadPage,
  /Payment and fulfillment only proceed after the required review/,
);

assert.doesNotMatch(globalStyles, /body\s*\{[^}]*overflow-x:\s*hidden/);
assert.match(checkoutPage, /className=\{styles\.paymentSurface\}/);
assert.match(
  checkoutStyles,
  /@media \(max-width: 600px\)[\s\S]*?\.shell\s*\{[\s\S]*?padding:\s*3\.75rem 16px 3rem/,
);
assert.match(
  checkoutStyles,
  /@media \(max-width: 600px\)[\s\S]*?\.card\s*\{[\s\S]*?padding:\s*0/,
);
assert.match(purchaseTrust, /href="\/contact">Questions\? Contact us/);
assert.doesNotMatch(purchaseTrust, /Accessible support|mailto:/);

console.log("Conversion audit follow-up regression tests passed");
