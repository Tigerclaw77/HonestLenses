import assert from "node:assert/strict";

import { lenses } from "@/LensCore/data/lenses";
import { getPricePerBox } from "@/lib/pricing/getPricePerBox";
import { getLensSlug, isPublicCatalogLens } from "@/lib/seo/contactSeoRoutes";

import { getCatalogPriceProducts } from "./catalogPriceIndex";

const products = getCatalogPriceProducts();
assert.ok(products.length > 0);
assert.equal(new Set(products.map((product) => product.coreId)).size, products.length);

for (const product of products) {
  const lens = lenses.find((item) => item.coreId === product.coreId);
  assert.ok(lens && isPublicCatalogLens(lens));
  assert.equal(product.href, `/contacts/${getLensSlug(lens)}`);
  assert.ok(product.options.length > 0);
  for (const option of product.options) {
    assert.ok(option.boxSize > 0);
    assert.equal(option.pricePerBoxCents, getPricePerBox(option.sku));
  }
}

const oasysMax = products.find((product) => product.coreId === "OASYS_MAX_1D");
assert.deepEqual(oasysMax?.options.map((option) => option.boxSize), [30, 90]);

console.log("Catalog price index tests passed");
