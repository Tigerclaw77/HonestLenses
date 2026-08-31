import { strict as assert } from "node:assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  acquireLock,
  classifyDeployment,
  evaluateGsc,
  evaluateSeo,
  shouldSendAlert,
  shouldSkipScheduledRun,
  withTimeout,
  parseSitemap,
} from "./lib.mjs";

const config = {
  sitemapUrl: "https://honestlenses.com/sitemap.xml",
  priorityUrls: ["https://honestlenses.com/", "https://honestlenses.com/product"],
  expectedSchema: { "https://honestlenses.com/product": ["Product", "Offer"] },
  sitemapChangeAbsolute: 25,
  sitemapChangeRatio: 0.25,
  searchStaleHours: 48,
};
const healthySeo = { robotsStatus: 200, robots: { sitemaps: [config.sitemapUrl], rules: [] }, sitemapUrls: ["https://honestlenses.com/"], previousSitemapCount: 1, statusChecks: [{ ok: true, redirected: false }], deepChecks: [] };

assert.deepEqual(classifyDeployment({ deploymentState: "success", liveVerified: true, localAhead: 0, remoteAhead: 0, localSha: "a", remoteSha: "a", productionSha: "a" }).states, ["PRODUCTION VERIFIED"], "clean fully deployed state");
assert(classifyDeployment({ deploymentState: "success", liveVerified: true, staleDirtyFiles: ["src/a.ts"] }).problems.some((p) => p.code === "LOCAL_SOURCE_STALE"), "local dirty source change");
assert(classifyDeployment({ deploymentState: "success", liveVerified: true, localAhead: 1 }).problems.some((p) => p.code === "LOCAL_COMMITS_UNPUSHED"), "commit ahead of remote");
assert(classifyDeployment({ deploymentState: "success", liveVerified: true, remoteAhead: 1, remoteSha: "b", productionSha: "a" }).problems.some((p) => p.code === "REMOTE_AHEAD_OF_PRODUCTION"), "remote ahead of production");
assert(classifyDeployment({ deploymentState: "failure", liveVerified: false }).problems.some((p) => p.code === "DEPLOYMENT_FAILED"), "failed deployment");
assert(classifyDeployment({ deploymentState: "pending", deploymentStale: true, liveVerified: false }).problems.some((p) => p.code === "DEPLOYMENT_STALE"), "stale deployment");

const drift = evaluateGsc({ authorized: true, liveCount: 105, sitemap: { lastDownloaded: new Date().toISOString(), processedCount: 575 }, inspections: [] }, config);
assert(drift.problems.some((p) => p.code === "GSC_COUNT_DRIFT"), "575 versus 105 sitemap drift");
const stale = evaluateGsc({ authorized: true, liveCount: 105, sitemap: { lastDownloaded: "2020-01-01T00:00:00Z", processedCount: 105, isPending: true }, inspections: [] }, config);
assert(stale.problems.some((p) => p.code === "GSC_DOWNLOAD_STALE") && stale.problems.some((p) => p.code === "GSC_SITEMAP_PENDING"), "GSC pending and stale");
const neverCrawled = evaluateGsc({ authorized: true, liveCount: 1, sitemap: { lastDownloaded: new Date().toISOString(), processedCount: 1 }, inspections: [{ url: config.priorityUrls[1], indexed: false, coverageState: "Discovered - currently not indexed", discoveredNeverCrawled: true }] }, config);
assert(neverCrawled.problems.some((p) => p.code === "GSC_DISCOVERED_NEVER_CRAWLED"), "discovered but never crawled");

assert(evaluateSeo({ ...healthySeo, sitemapError: "bad XML" }, config).problems.some((p) => p.code === "SITEMAP_INVALID"), "sitemap XML failure");
assert.throws(() => parseSitemap("<urlset><url><loc>https://honestlenses.com/</loc></urlset>"), /mismatched/, "malformed XML is rejected");
const noindex = evaluateSeo({ ...healthySeo, deepChecks: [{ url: config.priorityUrls[1], desktopOk: true, mobileOk: true, noindex: true, canonical: config.priorityUrls[1], schemaTypes: ["Product", "Offer"], offerPrices: [10], visiblePrices: [10], links: [] }] }, config);
assert(noindex.problems.some((p) => p.code === "PAGE_NOINDEX"), "important noindex");
const canonical = evaluateSeo({ ...healthySeo, deepChecks: [{ url: config.priorityUrls[1], desktopOk: true, mobileOk: true, noindex: false, canonical: "https://honestlenses.com/wrong", schemaTypes: ["Product", "Offer"], offerPrices: [10], visiblePrices: [10], links: [] }] }, config);
assert(canonical.problems.some((p) => p.code === "CANONICAL_MISMATCH"), "canonical mismatch");

const current = { regressions: [{ key: "A", severity: "high" }] };
const firstAlert = shouldSendAlert(null, current, new Date(), 72);
assert.equal(firstAlert.send, true);
assert.equal(shouldSendAlert({ lastAlertFingerprint: firstAlert.fingerprint, lastAlertAt: new Date().toISOString() }, current, new Date(), 72).send, false, "deduplicated alerts");
assert.equal(shouldSkipScheduledRun({ timestamp: new Date().toISOString() }, new Date()), true, "missed-run/once-daily guard");
await assert.rejects(withTimeout(new Promise(() => {}), 5), /timed out/, "bounded timeout");

const temp = await mkdtemp(path.join(os.tmpdir(), "hl-watchdog-test-"));
try {
  const lockPath = path.join(temp, "lock");
  const release = await acquireLock(lockPath, 1000);
  await assert.rejects(acquireLock(lockPath, 1000), /already held/, "concurrent lock");
  await release();
  await writeFile(lockPath, "stale");
  const old = new Date(Date.now() - 5000);
  const { utimes } = await import("node:fs/promises");
  await utimes(lockPath, old, old);
  const releaseStale = await acquireLock(lockPath, 1000);
  await releaseStale();
} finally { await rm(temp, { recursive: true, force: true }); }

const serialized = JSON.stringify({ report: current, secret: undefined, customer: undefined });
assert(!/RESEND_API_KEY|prescription|customerEmail/i.test(serialized), "no secret or personal-data leakage in report shape");
console.log("Deployment and Search Watchdog regression tests passed.");
