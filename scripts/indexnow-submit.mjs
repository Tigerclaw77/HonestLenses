import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  INDEXNOW_ORIGIN,
  isAllowedIndexNowUrl,
  isIndexableCanonicalResponse,
  sitemapIndexNowUrls,
} from "./indexnow-url-policy.mjs";

const args = process.argv.slice(2);
const all = args.includes("--all");
const dryRun = args.includes("--dry-run");
const changed = args.filter((arg) => arg.startsWith("--changed=")).map((arg) => arg.slice(10));

if (all === Boolean(changed.length) || args.some((arg) =>
  arg !== "--all" && arg !== "--dry-run" && !arg.startsWith("--changed="))) {
  throw new Error("Use --all for the initial submission, or --changed=/public-path for updates; add --dry-run to inspect only.");
}

async function readKey() {
  const names = (await readdir(path.join(process.cwd(), "public")))
    .filter((name) => /^[a-f0-9]{32}\.txt$/.test(name));
  if (names.length !== 1) throw new Error("Expected exactly one IndexNow root key file");
  const key = names[0].slice(0, -4);
  const value = await readFile(path.join(process.cwd(), "public", names[0]), "utf8");
  if (value !== key) throw new Error("IndexNow key file content does not match its filename");
  return { key, location: `${INDEXNOW_ORIGIN}/${names[0]}` };
}

async function fetchText(url) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  return { response, body: await response.text() };
}

const { key, location } = await readKey();
const sitemapUrl = `${INDEXNOW_ORIGIN}/sitemap.xml`;
const sitemap = await fetchText(sitemapUrl);
if (sitemap.response.status !== 200 || sitemap.response.url !== sitemapUrl) {
  throw new Error("The production sitemap is not available at the canonical host");
}
const sitemapUrls = sitemapIndexNowUrls(sitemap.body);
if (!sitemapUrls.length) throw new Error("No eligible canonical URLs found in the production sitemap");

const requested = all
  ? sitemapUrls
  : changed.map((value) => new URL(value, INDEXNOW_ORIGIN).href);
for (const url of requested) {
  if (!isAllowedIndexNowUrl(url) || !sitemapUrls.includes(url)) {
    throw new Error(`URL is not an allowed canonical sitemap entry: ${url}`);
  }
}

const verified = [];
const skipped = [];
for (let start = 0; start < requested.length; start += 8) {
  const batch = requested.slice(start, start + 8);
  const results = await Promise.all(batch.map(async (url) => {
    try {
      const { response, body } = await fetchText(url);
      return { url, okay: isIndexableCanonicalResponse(url, {
        status: response.status,
        url: response.url,
        headers: response.headers,
        body,
      }) };
    } catch {
      return { url, okay: false };
    }
  }));
  for (const result of results) (result.okay ? verified : skipped).push(result.url);
}

if (skipped.length) console.warn(`Excluded ${skipped.length} URLs without a live self-canonical indexable 200: ${skipped.join(", ")}`);
if (!verified.length || (!all && skipped.length)) {
  throw new Error("No submission: requested URLs failed live indexability verification");
}
console.log(`Verified ${verified.length} canonical public URLs for IndexNow${dryRun ? " (dry run)" : ""}.`);

if (!dryRun) {
  const verification = await fetchText(location);
  if (verification.response.status !== 200 || verification.response.url !== location || verification.body.trim() !== key) {
    throw new Error("The production IndexNow key file is not verified");
  }
  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: "honestlenses.com",
      key,
      keyLocation: location,
      urlList: verified,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const result = (await response.text()).slice(0, 500);
  console.log(`IndexNow response: HTTP ${response.status}${result ? ` ${result}` : ""}`);
  if (response.status !== 200 && response.status !== 202) process.exitCode = 1;
}
