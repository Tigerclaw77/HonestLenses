import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import nextConfig from "../../../next.config";
import { GET as getLensParameterValue } from "@/app/contacts/[slug]/[parameter]/[value]/route";
import { GET as getAlternatives } from "@/app/contacts/[slug]/alternatives/route";
import { GET as getParameters } from "@/app/contacts/[slug]/parameters/route";
import { GET as getParameterFacet } from "@/app/contacts/by/[parameter]/[value]/route";
import { GET as getCondition } from "@/app/contacts/for/[condition]/route";

async function main() {
const request = new Request("https://honestlenses.com/legacy");

const parameterSummary = await getParameters(request, {
  params: Promise.resolve({ slug: "acuvue-oasys-max-1-day" }),
});
assert.equal(parameterSummary.status, 308);
assert.equal(
  parameterSummary.headers.get("location"),
  "https://honestlenses.com/contacts/acuvue-oasys-max-1-day",
);

const unknownProduct = await getParameters(request, {
  params: Promise.resolve({ slug: "not-a-real-product" }),
});
assert.equal(unknownProduct.status, 404);

const parameterValue = await getLensParameterValue(request, {
  params: Promise.resolve({
    slug: "acuvue-oasys-max-1-day",
    parameter: "base-curve",
    value: "8.5",
  }),
});
assert.equal(parameterValue.status, 308);
assert.equal(
  parameterValue.headers.get("location"),
  "https://honestlenses.com/contacts/acuvue-oasys-max-1-day",
);

const invalidParameterValue = await getLensParameterValue(request, {
  params: Promise.resolve({
    slug: "acuvue-oasys-max-1-day",
    parameter: "base-curve",
    value: "99",
  }),
});
assert.equal(invalidParameterValue.status, 404);

for (const [condition, destination] of [
  ["astigmatism", "/contacts/toric-contact-lenses"],
  ["presbyopia", "/contacts/multifocal-contact-lenses"],
] as const) {
  const response = await getCondition(request, {
    params: Promise.resolve({ condition }),
  });
  assert.equal(response.status, 308);
  assert.equal(new URL(response.headers.get("location")!).pathname, destination);
}

const invalidCondition = await getCondition(request, {
  params: Promise.resolve({ condition: "dry-eye" }),
});
assert.equal(invalidCondition.status, 404);

for (const response of [getParameterFacet(), getAlternatives()]) {
  assert.equal(response.status, 410);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
}

const readSource = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

const sitemapSource = readSource("src/app/sitemap.ts");
assert.doesNotMatch(
  sitemapSource,
  /getLensParameterRoutes|getParameterIndexRoutes|getConditionRoutes|\/parameters|\/alternatives|\/contacts\/by\//,
);

const contactsSource = readSource("src/app/contacts/page.tsx");
assert.match(contactsSource, /lenses\.filter\(isPublicCatalogLens\)\.map/);

const productSource = readSource("src/app/contacts/[slug]/page.tsx");
assert.doesNotMatch(productSource, /href=\{`\/contacts\/\$\{slug\}\/parameters`\}/);
assert.match(productSource, /id="product-parameters"/);

const aboutSource = readSource("src/app/about/page.tsx");
assert.match(aboutSource, /<h1 className="upper">About Honest Lenses<\/h1>/);

assert.match(
  readSource("src/app/privacy/page.tsx"),
  /alternates:\s*\{ canonical: "\/privacy" \}/,
);
assert.match(
  readSource("src/app/terms/page.tsx"),
  /alternates:\s*\{ canonical: "\/terms" \}/,
);
assert.match(
  readSource("src/app/find-receipt/page.tsx"),
  /robots:[\s\S]*index: false/,
);

const redirectRules = await nextConfig.redirects?.();
assert.deepEqual(redirectRules, [
  {
    source: "/:path*",
    has: [{ type: "host", value: "www.honestlenses.com" }],
    destination: "https://honestlenses.com/:path*",
    permanent: true,
  },
]);

  console.log("SEO indexing cleanup regression checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
