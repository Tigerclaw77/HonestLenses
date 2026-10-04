import assert from "node:assert/strict";
import { test } from "node:test";

import {
  INDEXNOW_ORIGIN,
  isAllowedIndexNowUrl,
  isIndexableCanonicalResponse,
  sitemapIndexNowUrls,
} from "./indexnow-url-policy.mjs";

test("only canonical public routes can be selected", () => {
  for (const path of ["/", "/contacts/contact-lens-prices", "/contacts/biofinity", "/guides/why-are-contact-lenses-cheaper-online", "/vision-benefits"]) {
    assert.equal(isAllowedIndexNowUrl(`${INDEXNOW_ORIGIN}${path}`), true, path);
  }
  for (const url of [
    "http://localhost:3000/contacts/biofinity",
    "https://preview.vercel.app/contacts/biofinity",
    "https://www.honestlenses.com/contacts/biofinity",
    `${INDEXNOW_ORIGIN}/admin/orders`,
    `${INDEXNOW_ORIGIN}/api/cart`,
    `${INDEXNOW_ORIGIN}/cart`,
    `${INDEXNOW_ORIGIN}/checkout`,
    `${INDEXNOW_ORIGIN}/login`,
    `${INDEXNOW_ORIGIN}/auth/callback`,
    `${INDEXNOW_ORIGIN}/order/123`,
    `${INDEXNOW_ORIGIN}/contacts/biofinity?pack=6`,
    `${INDEXNOW_ORIGIN}/contacts/biofinity#price`,
    `${INDEXNOW_ORIGIN}/contacts/by/base-curve/8.6`,
    `${INDEXNOW_ORIGIN}/contacts/%2e%2e/cart`,
  ]) {
    assert.equal(isAllowedIndexNowUrl(url), false, url);
  }
});

test("selection is sitemap-derived and deduplicated", () => {
  const xml = `<urlset><url><loc>${INDEXNOW_ORIGIN}</loc></url><url><loc>${INDEXNOW_ORIGIN}/contacts/biofinity</loc></url><url><loc>${INDEXNOW_ORIGIN}/contacts/biofinity</loc></url><url><loc>${INDEXNOW_ORIGIN}/cart</loc></url></urlset>`;
  assert.deepEqual(sitemapIndexNowUrls(xml), [INDEXNOW_ORIGIN, `${INDEXNOW_ORIGIN}/contacts/biofinity`]);
});

test("live response must be 200, unredirected, indexable and self-canonical", () => {
  const url = `${INDEXNOW_ORIGIN}/contacts/biofinity`;
  const response = (body, overrides = {}) => ({
    status: 200,
    url,
    body,
    headers: new Headers(),
    ...overrides,
  });
  const canonical = `<link rel="canonical" href="${url}"/>`;
  assert.equal(isIndexableCanonicalResponse(url, response(canonical)), true);
  assert.equal(isIndexableCanonicalResponse(INDEXNOW_ORIGIN, response(`<link rel="canonical" href="${INDEXNOW_ORIGIN}"/>`, { url: `${INDEXNOW_ORIGIN}/` })), true);
  assert.equal(isIndexableCanonicalResponse(url, response(canonical, { status: 404 })), false);
  assert.equal(isIndexableCanonicalResponse(url, response(canonical, { url: `${url}/` })), false);
  assert.equal(isIndexableCanonicalResponse(url, response('<meta name="robots" content="noindex"/>' + canonical)), false);
  assert.equal(isIndexableCanonicalResponse(url, response('<meta content="index, noindex" name="googlebot"/>' + canonical)), false);
  assert.equal(isIndexableCanonicalResponse(url, response('<link rel="canonical" href="https://honestlenses.com/contacts"/>')), false);
  assert.equal(isIndexableCanonicalResponse(url, response(canonical, { headers: new Headers({ "x-robots-tag": "noindex" }) })), false);
});
