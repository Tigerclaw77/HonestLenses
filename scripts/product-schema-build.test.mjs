import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cases = [
  ["acuvue-oasys-max-1-day", 2],
  ["biofinity", 1],
  ["biofinity-toric", 1],
  ["1-day-acuvue-moist", 2],
  ["dailies-total1-multifocal", 2],
];

for (const [slug, offerCount] of cases) {
  const html = await readFile(`.next/server/app/contacts/${slug}.html`, "utf8");
  const objects = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)]
    .flatMap((match) => JSON.parse(match[1]));
  const products = objects.filter((item) => item["@type"] === "Product");
  const url = `https://honestlenses.com/contacts/${slug}`;
  assert.equal(products.length, 1, `${slug}: one Product`);
  assert.equal(products[0].url, url);
  assert.ok(products[0].name && products[0].brand?.name && products[0].image);
  assert.equal(products[0].offers.length, offerCount);
  assert.ok(products[0].offers.every((offer) =>
    offer.priceCurrency === "USD" && Number(offer.price) > 0
    && offer.url === url && !("sku" in offer)));
  assert.equal(products[0].sku !== undefined, offerCount === 1);
  assert.ok(html.includes(`<link rel="canonical" href="${url}"`));
  assert.ok(!/<meta[^>]+name="robots"[^>]+noindex/i.test(html));
}

console.log("Generated product HTML and JSON-LD checks passed");
