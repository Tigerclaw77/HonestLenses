import { createHash } from "node:crypto";
import { open, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";

export const HEADLINE_STATES = [
  "LOCAL ONLY",
  "PUSHED NOT DEPLOYED",
  "DEPLOYED NOT VERIFIED",
  "PRODUCTION VERIFIED",
  "SEARCH STALE",
  "SEARCH HEALTHY",
  "ACTION REQUIRED",
];

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizePath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function isMeaningfulPath(filePath, config) {
  const normalized = normalizePath(filePath);
  const lower = normalized.toLowerCase();
  if (config.excludedPathPrefixes.some((prefix) => lower.startsWith(prefix.toLowerCase()))) return false;
  const extension = path.extname(lower);
  if (config.excludedExtensions.includes(extension)) return false;
  return config.meaningfulExtensions.includes(extension);
}

export function parsePorcelainStatus(text) {
  return text.split("\0").filter(Boolean).map((record) => {
    const status = record.slice(0, 2);
    const filePath = record.slice(3);
    return { status, path: normalizePath(filePath.includes(" -> ") ? filePath.split(" -> ").at(-1) : filePath) };
  });
}

export function classifyDeployment(input) {
  const problems = [];
  const states = [];
  if (input.staleDirtyFiles?.length) {
    states.push("LOCAL ONLY");
    problems.push(problem("LOCAL_SOURCE_STALE", "high", `${input.staleDirtyFiles.length} meaningful local source file(s) have remained uncommitted for over 24 hours.`));
  }
  if ((input.localAhead ?? 0) > 0) {
    states.push("LOCAL ONLY");
    problems.push(problem("LOCAL_COMMITS_UNPUSHED", "high", `${input.localAhead} local commit(s) are not pushed.`));
  }
  if ((input.remoteAhead ?? 0) > 0) {
    states.push("PUSHED NOT DEPLOYED");
    problems.push(problem("REMOTE_AHEAD_OF_PRODUCTION", "high", `${input.remoteAhead} remote commit(s) are not represented by production.`));
  }
  if (input.productionSha && input.remoteSha && input.productionSha !== input.remoteSha) {
    states.push("PUSHED NOT DEPLOYED");
    problems.push(problem("PRODUCTION_COMMIT_DRIFT", "high", "Production commit differs from the intended branch HEAD."));
  }
  if (["failure", "error", "cancelled", "canceled"].includes(input.deploymentState)) {
    states.push("ACTION REQUIRED");
    problems.push(problem("DEPLOYMENT_FAILED", "high", `The intended production deployment is ${input.deploymentState}.`));
  } else if (input.deploymentStale) {
    states.push("ACTION REQUIRED");
    problems.push(problem("DEPLOYMENT_STALE", "high", "The intended deployment is still pending beyond the configured threshold."));
  } else if (input.deploymentState === "success" && input.liveVerified) {
    states.push("PRODUCTION VERIFIED");
  } else if (input.deploymentState === "success") {
    states.push("DEPLOYED NOT VERIFIED");
  }
  return { states: unique(states), problems };
}

export function parseSitemap(xml) {
  assertXmlWellFormed(xml);
  if (!/^\s*<\?xml[\s\S]*<(urlset|sitemapindex)[\s>]/i.test(xml) && !/<(urlset|sitemapindex)[\s>]/i.test(xml)) {
    throw new Error("Sitemap is not valid sitemap XML.");
  }
  const urls = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => decodeXml(match[1].trim()));
  if (!urls.length) throw new Error("Sitemap XML contains no URLs.");
  for (const value of urls) new URL(value);
  return unique(urls);
}

function assertXmlWellFormed(xml) {
  const stack = [];
  const withoutOpaqueSections = xml
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  const tags = [...withoutOpaqueSections.matchAll(/<\s*(\/?)\s*([A-Za-z_][\w:.-]*)\b[^>]*(\/?)\s*>/g)];
  for (const tag of tags) {
    const closing = tag[1] === "/";
    const selfClosing = tag[3] === "/";
    const name = tag[2];
    if (closing) {
      if (stack.pop() !== name) throw new Error("Sitemap XML has mismatched elements.");
    } else if (!selfClosing) stack.push(name);
  }
  if (stack.length || !tags.length) throw new Error("Sitemap XML is not well formed.");
}

export function parseRobots(text) {
  const rules = [];
  let applies = false;
  const sitemaps = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line.includes(":")) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") applies = value === "*";
    if (key === "sitemap") sitemaps.push(value);
    if (applies && (key === "allow" || key === "disallow") && value) rules.push({ type: key, path: value });
  }
  return { rules, sitemaps };
}

export function isRobotsBlocked(url, robots) {
  const pathname = new URL(url).pathname;
  const matches = robots.rules.filter((rule) => pathname.startsWith(rule.path));
  if (!matches.length) return false;
  matches.sort((a, b) => b.path.length - a.path.length);
  return matches[0].type === "disallow";
}

export function inspectHtml(html, pageUrl) {
  const robotsMeta = [...html.matchAll(/<meta\b[^>]*name=["']robots["'][^>]*>/gi)].map((m) => m[0]).join(" ");
  const xRobotsNoindex = /\bnoindex\b/i.test(robotsMeta);
  const canonicalTag = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0] ?? "";
  const canonical = attribute(canonicalTag, "href");
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map((m) => {
    try { return new URL(m[1], pageUrl).href.replace(/\/$/, ""); } catch { return null; }
  }).filter(Boolean);
  const schemaTypes = new Set();
  const offerPrices = [];
  let malformedSchema = false;
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collectSchema(JSON.parse(match[1]), schemaTypes, offerPrices); } catch { malformedSchema = true; }
  }
  const visiblePrices = [...stripTags(html).matchAll(/\$\s*([0-9]+(?:\.[0-9]{2})?)/g)].map((m) => Number(m[1])).filter(Number.isFinite);
  return { noindex: xRobotsNoindex, canonical, links: unique(links), schemaTypes: [...schemaTypes], offerPrices: unique(offerPrices), visiblePrices: unique(visiblePrices), malformedSchema };
}

export function evaluateSeo(input, config) {
  const problems = [];
  if (input.robotsStatus !== 200) problems.push(problem("ROBOTS_UNAVAILABLE", "high", `robots.txt returned ${input.robotsStatus ?? "no response"}.`));
  if (!input.robots?.sitemaps?.includes(config.sitemapUrl)) problems.push(problem("ROBOTS_SITEMAP_MISSING", "high", "robots.txt does not declare the production sitemap."));
  if (input.sitemapError) problems.push(problem("SITEMAP_INVALID", "high", input.sitemapError));
  if (input.previousSitemapCount) {
    const delta = Math.abs(input.sitemapUrls.length - input.previousSitemapCount);
    const ratio = delta / Math.max(input.previousSitemapCount, 1);
    if (delta >= config.sitemapChangeAbsolute && ratio >= config.sitemapChangeRatio) problems.push(problem("SITEMAP_COUNT_DRIFT", "high", `Sitemap count changed from ${input.previousSitemapCount} to ${input.sitemapUrls.length}.`));
  }
  const failed = input.statusChecks.filter((item) => !item.ok);
  const redirected = input.statusChecks.filter((item) => item.redirected);
  if (failed.length) problems.push(problem("SITEMAP_URL_FAILURE", "high", `${failed.length} sitemap URL(s) did not return 200.`));
  if (redirected.length) problems.push(problem("SITEMAP_REDIRECT", "high", `${redirected.length} sitemap URL(s) redirect.`));
  for (const result of input.deepChecks) {
    if (!result.desktopOk || !result.mobileOk) problems.push(problem("PAGE_AVAILABILITY", "high", `Desktop or mobile availability failed for ${result.url}.`, result.url));
    if (result.noindex || result.xRobotsNoindex) problems.push(problem("PAGE_NOINDEX", "high", `Important page is marked noindex: ${result.url}.`, result.url));
    if (input.robots && isRobotsBlocked(result.url, input.robots)) problems.push(problem("PAGE_ROBOTS_BLOCKED", "high", `Important page is blocked by robots.txt: ${result.url}.`, result.url));
    if (!sameCanonical(result.canonical, result.url)) problems.push(problem("CANONICAL_MISMATCH", "high", `Canonical does not match ${result.url}.`, result.url));
    if (result.malformedSchema) problems.push(problem("SCHEMA_MALFORMED", "high", `Malformed JSON-LD on ${result.url}.`, result.url));
    const expected = config.expectedSchema[result.url] ?? [];
    const missing = expected.filter((type) => !result.schemaTypes.includes(type));
    if (missing.length) problems.push(problem("SCHEMA_MISSING", "high", `Missing expected schema on ${result.url}: ${missing.join(", ")}.`, result.url));
    if (expected.includes("Offer") && result.offerPrices.length && result.visiblePrices.length && !result.offerPrices.some((offer) => result.visiblePrices.includes(offer))) {
      problems.push(problem("PRICE_SCHEMA_MISMATCH", "high", `Visible price and Offer price differ on ${result.url}.`, result.url));
    }
  }
  const collectedLinks = new Set(input.deepChecks.flatMap((result) => result.links ?? []).map((url) => url.replace(/\/$/, "")));
  const missingLinks = config.priorityUrls.slice(1).filter((url) => !collectedLinks.has(url.replace(/\/$/, "")));
  if (missingLinks.length) problems.push(problem("PRIORITY_INTERNAL_LINK_MISSING", "medium", `${missingLinks.length} priority URL(s) were not linked from the representative sample.`));
  return { problems };
}

export function evaluateGsc(input, config, now = new Date()) {
  if (!input.authorized) return { states: [], problems: [], authorized: false };
  const problems = [];
  const downloaded = input.sitemap?.lastDownloaded ? new Date(input.sitemap.lastDownloaded) : null;
  const stale = !downloaded || now.getTime() - downloaded.getTime() > config.searchStaleHours * 3600000;
  if (stale) problems.push(problem("GSC_DOWNLOAD_STALE", "high", "Google Search Console has not downloaded the sitemap within the expected window."));
  if (input.sitemap?.isPending) problems.push(problem("GSC_SITEMAP_PENDING", "medium", "Google Search Console still reports the sitemap as pending."));
  if ((input.sitemap?.errors ?? 0) > 0 || (input.sitemap?.warnings ?? 0) > 0) problems.push(problem("GSC_SITEMAP_ERRORS", "high", `Google reports ${input.sitemap.errors ?? 0} sitemap error(s) and ${input.sitemap.warnings ?? 0} warning(s).`));
  if (Number.isFinite(input.liveCount) && Number.isFinite(input.sitemap?.processedCount) && input.liveCount !== input.sitemap.processedCount) problems.push(problem("GSC_COUNT_DRIFT", "high", `Live sitemap has ${input.liveCount} URLs while Google reports ${input.sitemap.processedCount} processed URLs.`));
  for (const item of input.inspections ?? []) {
    if (item.discoveredNeverCrawled) problems.push(problem("GSC_DISCOVERED_NEVER_CRAWLED", "high", `Priority URL remains discovered but never crawled: ${item.url}.`, item.url));
    if (item.indexed === false) problems.push(problem("GSC_PRIORITY_NOT_INDEXED", "high", `Priority URL is not indexed: ${item.url} (${item.coverageState || "reason unavailable"}).`, item.url));
    if (item.googleCanonical && item.userCanonical && !sameCanonical(item.googleCanonical, item.userCanonical)) problems.push(problem("GSC_CANONICAL_MISMATCH", "high", `Google-selected canonical differs for ${item.url}.`, item.url));
  }
  return { states: [stale ? "SEARCH STALE" : "SEARCH HEALTHY"], problems, authorized: true };
}

export function diffReports(previous, current) {
  const before = new Map((previous?.regressions ?? []).map((item) => [item.key, item]));
  const after = new Map((current.regressions ?? []).map((item) => [item.key, item]));
  return {
    added: [...after.keys()].filter((key) => !before.has(key)),
    resolved: [...before.keys()].filter((key) => !after.has(key)),
    unchanged: [...after.keys()].filter((key) => before.has(key)),
  };
}

export function shouldSendAlert(previous, current, now, repeatHours) {
  const highKeys = current.regressions.filter((item) => item.severity === "high").map((item) => item.key).sort();
  if (!highKeys.length) return { send: false, reason: "no-high-priority-failures", fingerprint: sha256("") };
  const fingerprint = sha256(highKeys.join("\n"));
  if (fingerprint !== previous?.lastAlertFingerprint) return { send: true, reason: "meaningful-change", fingerprint };
  const last = previous?.lastAlertAt ? new Date(previous.lastAlertAt) : null;
  if (!last || now.getTime() - last.getTime() >= repeatHours * 3600000) return { send: true, reason: "unresolved-high-priority-repeat", fingerprint };
  return { send: false, reason: "deduplicated", fingerprint };
}

export function shouldSkipScheduledRun(previous, now = new Date()) {
  if (!previous?.timestamp) return false;
  return centralDateKey(previous.timestamp) === centralDateKey(now);
}

export function centralDateKey(value) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export async function acquireLock(lockPath, staleMs) {
  try {
    const handle = await open(lockPath, "wx");
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    await handle.close();
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const info = await stat(lockPath);
    if (Date.now() - info.mtimeMs <= staleMs) throw new Error("Watchdog lock is already held.");
    await unlink(lockPath);
    return acquireLock(lockPath, staleMs);
  }
  return async () => { await unlink(lockPath).catch(() => {}); };
}

export async function readJson(filePath, fallback = null) {
  try { return JSON.parse(await readFile(filePath, "utf8")); } catch { return fallback; }
}

export function withTimeout(promise, ms, message = "Operation timed out") {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

export function problem(code, severity, message, url = null) {
  return { key: url ? `${code}:${url}` : code, code, severity, message, ...(url ? { url } : {}) };
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"))?.[1] ?? null;
}

function collectSchema(value, types, prices) {
  if (Array.isArray(value)) return value.forEach((item) => collectSchema(item, types, prices));
  if (!value || typeof value !== "object") return;
  const rawType = value["@type"];
  for (const type of Array.isArray(rawType) ? rawType : [rawType]) if (typeof type === "string") types.add(type);
  if ((rawType === "Offer" || (Array.isArray(rawType) && rawType.includes("Offer"))) && value.price != null) {
    const price = Number(value.price);
    if (Number.isFinite(price)) prices.push(price);
  }
  for (const child of Object.values(value)) collectSchema(child, types, prices);
}

function stripTags(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
}

function sameCanonical(a, b) {
  if (!a || !b) return false;
  try { return new URL(a).href.replace(/\/$/, "") === new URL(b).href.replace(/\/$/, ""); } catch { return false; }
}

function decodeXml(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'");
}

function unique(values) { return [...new Set(values)]; }
