import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { inspectHtml, isMeaningfulPath, parsePorcelainStatus } from "./lib.mjs";

const execFileAsync = promisify(execFile);
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36 HonestLenses-Watchdog/1.0";
const MOBILE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36 HonestLenses-Watchdog/1.0";

export async function loadAllowedEnvironment(repoRoot) {
  const filePath = path.join(repoRoot, ".vercel", ".env.production.local");
  const allowed = new Set(["RESEND_API_KEY", "FOUNDER_ALERT_EMAIL", "ARMORY_OPERATOR_ALERT_RECIPIENT", "WATCHDOG_GSC_CREDENTIALS_PATH", "GOOGLE_APPLICATION_CREDENTIALS"]);
  try {
    for (const line of (await readFile(filePath, "utf8")).split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || !allowed.has(match[1]) || process.env[match[1]]) continue;
      process.env[match[1]] = decodeEnvValue(match[2]);
    }
  } catch {}
}

export async function gitSnapshot(repoRoot, config, { fetchRemote = true } = {}) {
  // Never silently treat a stale tracking ref as the current deployment target.
  if (fetchRemote) await git(repoRoot, ["fetch", "--quiet", "origin", `+refs/heads/${config.intendedBranch}:refs/remotes/origin/${config.intendedBranch}`], 60000);
  const localSha = (await git(repoRoot, ["rev-parse", "HEAD"])).trim();
  const branch = (await git(repoRoot, ["branch", "--show-current"])).trim();
  // for-each-ref returns an empty field successfully for an untracked local branch.
  const upstream = branch ? (await git(repoRoot, ["for-each-ref", "--format=%(upstream:short)", `refs/heads/${branch}`])).trim() || null : null;
  const intendedRemoteRef = `origin/${config.intendedBranch}`;
  const remoteSha = (await git(repoRoot, ["rev-parse", intendedRemoteRef])).trim();
  const localAhead = Number((await git(repoRoot, ["rev-list", "--count", `${intendedRemoteRef}..HEAD`])).trim());
  const localBehind = Number((await git(repoRoot, ["rev-list", "--count", `HEAD..${intendedRemoteRef}`])).trim());
  const dirty = parsePorcelainStatus(await git(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
  const meaningfulDirtyFiles = [];
  const staleDirtyFiles = [];
  for (const item of dirty.filter((entry) => isMeaningfulPath(entry.path, config))) {
    meaningfulDirtyFiles.push(item.path);
    try {
      const info = await stat(path.join(repoRoot, item.path));
      if (Date.now() - info.mtimeMs >= config.sourceAgeHours * 3600000) staleDirtyFiles.push(item.path);
    } catch {}
  }
  const remoteCommittedAt = (await git(repoRoot, ["show", "-s", "--format=%cI", intendedRemoteRef])).trim();
  return { localSha, branch, upstream, intendedRemoteRef, remoteCommittedAt, remoteSha, localAhead, localBehind, meaningfulDirtyFiles, staleDirtyFiles };
}

export async function githubDeploymentSnapshot(config, remoteSha, previous, fetchImpl = fetch) {
  const endpoint = `https://api.github.com/repos/${config.repository}/commits/${remoteSha}/status`;
  const response = await fetchImpl(endpoint, { headers: { accept: "application/vnd.github+json", "user-agent": DESKTOP_UA } });
  if (!response.ok) throw new Error(`GitHub deployment status failed (${response.status}).`);
  const body = await response.json();
  const matches = (body.statuses ?? []).filter((item) => item.context === config.deploymentStatusContext).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  const selected = matches[0] ?? null;
  const state = selected?.state ?? "missing";
  const updatedAt = selected?.updated_at ?? null;
  const deploymentStale = ["pending", "queued", "in_progress"].includes(state) && updatedAt && Date.now() - new Date(updatedAt).getTime() > config.deploymentStaleHours * 3600000;
  const priorSha = previous?.git?.intendedRemoteRef === `origin/${config.intendedBranch}` ? previous?.commits?.production : null;
  const productionSha = state === "success" ? remoteSha : priorSha;
  return { deploymentState: state, deploymentUpdatedAt: updatedAt, deploymentStale, productionSha, deploymentTarget: selected?.target_url ?? null };
}

export async function countRemoteAhead(repoRoot, productionSha, remoteSha) {
  if (!productionSha || !remoteSha) return null;
  if (productionSha === remoteSha) return 0;
  try { return Number((await git(repoRoot, ["rev-list", "--count", `${productionSha}..${remoteSha}`])).trim()); } catch { return null; }
}

export async function checkProduction(config, previousSitemapCount, fetchImpl = fetch) {
  // Preserve independent evidence when a single request cannot obtain a response.
  const readResource = async (url) => {
    try {
      const response = await timedFetch(url, { redirect: "manual", headers: { "user-agent": DESKTOP_UA } }, config, fetchImpl);
      return { status: response.status, text: await response.text() };
    } catch { return { status: null, text: "", unavailable: true }; }
  };
  const [robotsResponse, sitemapResponse] = await Promise.all([readResource(config.robotsUrl), readResource(config.sitemapUrl)]);
  const robotsText = robotsResponse.text;
  const sitemapXml = sitemapResponse.text;
  const { parseSitemap, parseRobots, sha256 } = await import("./lib.mjs");
  let sitemapUrls = [];
  let sitemapError = !sitemapResponse.unavailable && sitemapResponse.status !== 200 ? `Sitemap fetch returned ${sitemapResponse.status}.` : null;
  if (!sitemapError && !sitemapResponse.unavailable) {
    try { sitemapUrls = parseSitemap(sitemapXml); } catch (error) { sitemapError = error.message; }
  }
  const robots = parseRobots(robotsText);
  const statusChecks = await mapLimit(sitemapUrls, config.statusConcurrency, (url) => checkUrlStatus(url, config, fetchImpl));
  const deepUrls = representativeSample([...new Set([...sitemapUrls, ...config.priorityUrls])], config.priorityUrls, config.deepSampleSize);
  const deepChecks = await mapLimit(deepUrls, 2, (url) => deepCheck(url, config, fetchImpl));
  return {
    robotsStatus: robotsResponse.status,
    robotsUnavailable: Boolean(robotsResponse.unavailable),
    sitemapUnavailable: Boolean(sitemapResponse.unavailable),
    sitemapError,
    robots,
    sitemapXml,
    sitemapHash: sha256(sitemapXml),
    sitemapUrls,
    previousSitemapCount,
    statusChecks,
    deepChecks,
  };
}

async function checkUrlStatus(url, config, fetchImpl) {
  try {
    let response = await timedFetch(url, { method: "HEAD", redirect: "manual", headers: { "user-agent": DESKTOP_UA } }, config, fetchImpl);
    if (response.status === 405) response = await timedFetch(url, { method: "GET", redirect: "manual", headers: { "user-agent": DESKTOP_UA, range: "bytes=0-1023" } }, config, fetchImpl);
    return { url, status: response.status, ok: response.status === 200, redirected: response.status >= 300 && response.status < 400, location: response.headers.get("location") };
  } catch (error) { return { url, status: null, ok: false, redirected: false, error: error.message }; }
}

async function deepCheck(url, config, fetchImpl) {
  try {
    const [desktop, mobile] = await Promise.all([
      timedFetch(url, { redirect: "manual", headers: { "user-agent": DESKTOP_UA } }, config, fetchImpl),
      timedFetch(url, { redirect: "manual", headers: { "user-agent": MOBILE_UA } }, config, fetchImpl),
    ]);
    const html = await desktop.text();
    const inspected = inspectHtml(html, url);
    return { url, desktopOk: desktop.status === 200, mobileOk: mobile.status === 200, xRobotsNoindex: /\bnoindex\b/i.test(desktop.headers.get("x-robots-tag") ?? ""), ...inspected };
  } catch (error) { return { url, desktopOk: false, mobileOk: false, noindex: false, canonical: null, links: [], schemaTypes: [], offerPrices: [], visiblePrices: [], malformedSchema: false, error: error.message }; }
}

export async function sendFounderEmail({ subject, text, idempotencyKey, fetchImpl = fetch }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const recipient = (process.env.FOUNDER_ALERT_EMAIL || process.env.ARMORY_OPERATOR_ALERT_RECIPIENT || "").trim();
  if (!apiKey || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error("Founder-only Resend configuration is unavailable.");
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify({ from: "Honest Lenses <support@honestlenses.com>", to: [recipient], subject, text }),
  });
  if (!response.ok) throw new Error(`Founder notification failed (${response.status}).`);
  return { sent: true };
}

export async function git(repoRoot, args, timeout = 30000) {
  const result = await execFileAsync("git", args, { cwd: repoRoot, encoding: "utf8", timeout, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
  return result.stdout;
}

function representativeSample(allUrls, priorityUrls, targetSize) {
  const selected = new Set(priorityUrls.filter((url) => allUrls.includes(url)));
  const remaining = allUrls.filter((url) => !selected.has(url));
  const slots = Math.max(0, targetSize - selected.size);
  for (let i = 0; i < slots && remaining.length; i++) selected.add(remaining[Math.floor(i * remaining.length / slots)]);
  return [...selected];
}

async function timedFetch(url, init, config, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try { return await fetchImpl(url, { ...init, signal: controller.signal }); } finally { clearTimeout(timer); }
}

async function mapLimit(values, concurrency, work) {
  const results = new Array(values.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (index < values.length) { const current = index++; results[current] = await work(values[current], current); }
  }));
  return results;
}

function decodeEnvValue(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1).replaceAll('\\n', '\n').replaceAll('\\"', '"').replaceAll('\\\\', '\\');
  return trimmed;
}
