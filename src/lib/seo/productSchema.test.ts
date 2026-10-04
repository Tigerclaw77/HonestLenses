import assert from "node:assert/strict";

import { lenses } from "@/LensCore/data/lenses";
import { getPackSizeFromSku } from "@/lib/pricing/getPackSize";
import { getPrice } from "@/lib/pricing/getPrice";
import { getLensSkus } from "@/lib/pricing/getLensSkus";
import { getLensSlug } from "@/lib/seo/contactSeoRoutes";
import { buildProductSchema } from "@/lib/seo/productSchema";

for (const coreId of ["OASYS_MAX_1D", "BIOFINITY", "BIOFINITY_AST", "MOIST", "DT1_MF"]) {
  const lens = lenses.find((item) => item.coreId === coreId);
  assert.ok(lens, `Missing catalog lens ${coreId}`);
  const options = getLensSkus(lens).map((sku) => ({
    sku,
    boxSize: getPackSizeFromSku(sku)!,
    pricePerBoxCents: getPrice({ sku, box_count: 1 }).price_per_box_cents,
  })).sort((a, b) => a.boxSize - b.boxSize);
  const slug = getLensSlug(lens);
  const schema = buildProductSchema({
    lens,
    slug,
    imageUrl: `/lens-images/${coreId}.webp`,
    priceOptions: options,
    brandName: lens.manufacturer,
    categoryName: "Contact lenses",
    replacementName: lens.replacement,
  });

  assert.equal(schema["@type"], "Product");
  assert.equal(schema.url, `https://honestlenses.com/contacts/${slug}`);
  assert.equal(schema.name, `${lens.displayName} Contact Lenses`);
  assert.equal(schema.image, `https://honestlenses.com/lens-images/${coreId}.webp`);
  assert.equal(schema.offers?.length, options.length);
  assert.deepEqual(schema.offers?.map((offer) => offer.name), options.map((option) => `${option.boxSize}-lens box`));
  assert.deepEqual(schema.offers?.map((offer) => offer.price), options.map((option) => (option.pricePerBoxCents / 100).toFixed(2)));
  assert.ok(schema.offers?.every((offer) => offer.priceCurrency === "USD" && offer.url === schema.url && !("sku" in offer)));
  assert.equal("sku" in schema ? schema.sku : undefined, options.length === 1 ? options[0].sku : undefined);
  assert.equal("availability" in schema.offers![0], false, "No inventory data exists to support a stock claim");
}

console.log("Representative Product schema tests passed");
