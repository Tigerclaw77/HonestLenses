import assert from "node:assert/strict";

const baseValue = process.env.SEO_BASE_URL ?? process.argv[2];
if (!baseValue) {
  throw new Error("Provide SEO_BASE_URL or pass the base URL as the first argument.");
}

const baseUrl = new URL(baseValue);
const checkWww = process.argv.includes("--check-www");
const productionOrigin = "https://honestlenses.com";

function localUrl(publicUrl) {
  const url = new URL(publicUrl);
  return new URL(`${url.pathname}${url.search}`, baseUrl);
}

function canonicalFrom(html) {
  const tag = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0] ?? "";
  return tag.match(/href=["']([^"']+)["']/i)?.[1]?.replaceAll("&amp;", "&") ?? null;
}

function robotsFrom(html) {
  const tag = html.match(/<meta[^>]+name=["']robots["'][^>]*>/i)?.[0] ?? "";
  return tag.match(/content=["']([^"']+)["']/i)?.[1] ?? "";
}

async function fetchManual(url) {
  return fetch(url, { redirect: "manual" });
}

const sitemapResponse = await fetch(new URL("/sitemap.xml", baseUrl));
assert.equal(sitemapResponse.status, 200);
const sitemapXml = await sitemapResponse.text();
const sitemapUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
  (match) => match[1],
);

assert.ok(
  sitemapUrls.length >= 100 && sitemapUrls.length <= 110,
  `Expected approximately 105 sitemap URLs, received ${sitemapUrls.length}`,
);
assert.ok(sitemapUrls.every((url) => url.startsWith(productionOrigin)));
assert.ok(
  sitemapUrls.every(
    (url) =>
      !/\/parameters(?:\/|$)|\/alternatives(?:\/|$)|\/contacts\/by\/|\/contacts\/for\//.test(
        new URL(url).pathname,
      ),
  ),
);

const failures = [];
const concurrency = 10;
for (let index = 0; index < sitemapUrls.length; index += concurrency) {
  const batch = sitemapUrls.slice(index, index + concurrency);
  await Promise.all(
    batch.map(async (publicUrl) => {
      try {
        const response = await fetchManual(localUrl(publicUrl));
        assert.equal(response.status, 200, `${publicUrl} did not return 200`);
        assert.doesNotMatch(
          response.headers.get("x-robots-tag") ?? "",
          /noindex/i,
          `${publicUrl} has an X-Robots-Tag noindex`,
        );
        const html = await response.text();
        assert.doesNotMatch(
          robotsFrom(html),
          /noindex/i,
          `${publicUrl} has a meta robots noindex`,
        );
        assert.equal(
          canonicalFrom(html)?.replace(/\/$/, ""),
          publicUrl.replace(/\/$/, ""),
          `${publicUrl} has the wrong canonical`,
        );
      } catch (error) {
        failures.push(error);
      }
    }),
  );
}
assert.deepEqual(failures, []);

async function expectRedirect(pathname, expectedPath) {
  const response = await fetchManual(new URL(pathname, baseUrl));
  assert.equal(response.status, 308, `${pathname} did not return 308`);
  assert.equal(new URL(response.headers.get("location")).pathname, expectedPath);
}

await expectRedirect(
  "/contacts/acuvue-oasys-max-1-day/parameters",
  "/contacts/acuvue-oasys-max-1-day",
);
await expectRedirect(
  "/contacts/acuvue-oasys-max-1-day/base-curve/8.5",
  "/contacts/acuvue-oasys-max-1-day",
);
await expectRedirect(
  "/contacts/for/astigmatism",
  "/contacts/toric-contact-lenses",
);
await expectRedirect(
  "/contacts/for/presbyopia",
  "/contacts/multifocal-contact-lenses",
);

for (const pathname of [
  "/contacts/by/base-curve/8.5",
  "/contacts/acuvue-oasys-max-1-day/alternatives",
]) {
  const response = await fetchManual(new URL(pathname, baseUrl));
  assert.equal(response.status, 410, `${pathname} did not return 410`);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
}

const contactsHtml = await (await fetch(new URL("/contacts", baseUrl))).text();
for (const slug of [
  "proclear-xr-toric",
  "proclear-xr-multifocal",
  "biofinity-xr",
  "biofinity-xr-toric",
]) {
  assert.doesNotMatch(contactsHtml, new RegExp(`href=["']/contacts/${slug}["']`));
}

const productHtml = await (
  await fetch(new URL("/contacts/acuvue-oasys-max-1-day", baseUrl))
).text();
assert.doesNotMatch(productHtml, /href=["'][^"']*\/parameters["']/);
assert.match(productHtml, /id="product-parameters"/);

const aboutHtml = await (await fetch(new URL("/about", baseUrl))).text();
assert.match(aboutHtml, /<h1[^>]*>About Honest Lenses<\/h1>/);

for (const pathname of ["/privacy", "/terms"]) {
  const html = await (await fetch(new URL(pathname, baseUrl))).text();
  assert.equal(canonicalFrom(html), `${productionOrigin}${pathname}`);
}

const findReceiptHtml = await (
  await fetch(new URL("/find-receipt", baseUrl))
).text();
assert.match(robotsFrom(findReceiptHtml), /noindex/i);

const robotsText = await (await fetch(new URL("/robots.txt", baseUrl))).text();
assert.match(robotsText, /User-Agent:\s*\*/i);
assert.match(robotsText, /Sitemap:\s*https:\/\/honestlenses\.com\/sitemap\.xml/i);

if (checkWww) {
  const wwwResponse = await fetchManual(
    "https://www.honestlenses.com/contacts/daily-contact-lenses?source=seo-test",
  );
  assert.equal(wwwResponse.status, 308);
  assert.equal(
    wwwResponse.headers.get("location"),
    "https://honestlenses.com/contacts/daily-contact-lenses?source=seo-test",
  );
}

console.log(
  `SEO indexing smoke passed for ${baseUrl.origin}: ${sitemapUrls.length} sitemap URLs checked.`,
);
