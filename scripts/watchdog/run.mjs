#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  acquireLock,
  classifyDeployment,
  diffReports,
  evaluateGsc,
  evaluateSeo,
  problem,
  readJson,
  sha256,
  shouldSendAlert,
  shouldSkipScheduledRun,
  withTimeout,
} from "./lib.mjs";
import {
  checkProduction,
  countRemoteAhead,
  githubDeploymentSnapshot,
  gitSnapshot,
  loadAllowedEnvironment,
  sendFounderEmail,
} from "./runtime.mjs";
import { discoverGoogleCredential, getAccessToken, retrieveGscData, submitSitemap } from "./gsc.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "..", "..");
const config = JSON.parse(await readFile(path.join(scriptDirectory, "watchdog.config.json"), "utf8"));
const runtimeDirectory = path.resolve(repoRoot, config.runtimeDirectory);
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const scheduled = args.has("--scheduled");
const testNotificationOnly = args.has("--test-notification-only");

await mkdir(runtimeDirectory, { recursive: true });
await loadAllowedEnvironment(repoRoot);

if (testNotificationOnly) {
  await sendFounderEmail({
    subject: "TEST — Honest Lenses Deployment and Search Watchdog",
    text: [
      "TEST — Honest Lenses Deployment and Search Watchdog",
      "",
      "Founder-only delivery test. No customer, order, prescription, or secret data is included.",
      "The watchdog is read-only and cannot commit, push, deploy, publish, request indexing, or alter customer data.",
    ].join("\n"),
    idempotencyKey: "honest-lenses-watchdog-test-v1",
  });
  console.log("Test notification sent to the configured founder-only destination.");
} else {
  const releaseLock = await acquireLock(path.join(runtimeDirectory, "watchdog.lock"), config.overallTimeoutMs * 2);
  try {
    await withTimeout(run(), config.overallTimeoutMs, "Watchdog exceeded its bounded overall timeout.");
  } catch (error) {
    await recordFailure(error);
    console.error(`Watchdog failed: ${safeMessage(error)}`);
    process.exitCode = 1;
  } finally {
    await releaseLock();
  }
}

async function run() {
  const now = new Date();
  const statePath = path.join(runtimeDirectory, "state.json");
  const latestPath = path.join(runtimeDirectory, "LATEST.json");
  const previousState = await readJson(statePath, {});
  const previousReport = await readJson(latestPath, null);
  if (scheduled && shouldSkipScheduledRun({ timestamp: previousState.lastScheduledAttemptAt }, now)) {
    console.log("Scheduled watchdog already attempted today; skipped.");
    return;
  }
  if (scheduled) {
    previousState.lastScheduledAttemptAt = now.toISOString();
    await writeFile(statePath, `${JSON.stringify(previousState, null, 2)}\n`, { mode: 0o600 });
  }

  const git = await gitSnapshot(repoRoot, config, { fetchRemote: !dryRun });
  const production = await githubDeploymentSnapshot(config, git.remoteSha, previousReport);
  const productionChecks = await checkProduction(config, previousReport?.sitemap?.urlCount ?? null);
  const seo = evaluateSeo(productionChecks, config);
  const liveVerified = !seo.problems.some((item) => item.severity === "high");
  const remoteAhead = await countRemoteAhead(repoRoot, production.productionSha, git.remoteSha);
  const deployment = classifyDeployment({ ...git, ...production, remoteAhead, liveVerified });

  const discoveredCredential = await discoverGoogleCredential();
  let accessToken = null;
  let gscData = { authorized: false, sitemap: null, inspections: [] };
  let authorizationRequired = null;
  let sitemapSubmitted = false;
  if (discoveredCredential) {
    try {
      accessToken = await getAccessToken(discoveredCredential);
      const data = await retrieveGscData({ accessToken, siteUrl: config.searchConsoleSiteUrl, sitemapUrl: config.sitemapUrl, priorityUrls: config.priorityUrls });
      gscData = { authorized: true, ...data };
      const materialHash = sha256([...productionChecks.sitemapUrls].sort().join("\n"));
      if (!dryRun && previousState.sitemapMaterialHash && previousState.sitemapMaterialHash !== materialHash) {
        await submitSitemap({ accessToken, siteUrl: config.searchConsoleSiteUrl, sitemapUrl: config.sitemapUrl });
        sitemapSubmitted = true;
      }
    } catch (error) {
      authorizationRequired = `Existing Google credential could not access the Search Console property: ${safeMessage(error)}`;
      gscData = { authorized: false, sitemap: null, inspections: [] };
    }
  } else {
    authorizationRequired = "Create or use a Google service account with Search Console API enabled, add its service-account email as a Full user of sc-domain:honestlenses.com, save the JSON key outside this repository, and set WATCHDOG_GSC_CREDENTIALS_PATH to that absolute file path in the scheduled task environment.";
  }
  const gsc = evaluateGsc({ ...gscData, liveCount: productionChecks.sitemapUrls.length }, config, now);

  const regressions = dedupeProblems([...deployment.problems, ...seo.problems, ...gsc.problems]);
  const headlineStates = unique([
    ...deployment.states,
    ...gsc.states,
    ...(regressions.some((item) => item.severity === "high") ? ["ACTION REQUIRED"] : []),
  ]);
  const report = {
    timestamp: now.toISOString(),
    mode: dryRun ? "dry-run" : scheduled ? "scheduled" : "manual",
    headlineStates,
    commits: { local: git.localSha, remote: git.remoteSha, production: production.productionSha },
    git: { branch: git.branch, upstream: git.upstream, localAhead: git.localAhead, localBehind: git.localBehind, remoteAheadOfProduction: remoteAhead, meaningfulDirtyFiles: git.meaningfulDirtyFiles, staleDirtyFiles: git.staleDirtyFiles },
    deployment: { state: production.deploymentState, updatedAt: production.deploymentUpdatedAt, target: production.deploymentTarget, liveVerified },
    sitemap: { url: config.sitemapUrl, hash: productionChecks.sitemapHash, materialHash: sha256([...productionChecks.sitemapUrls].sort().join("\n")), urlCount: productionChecks.sitemapUrls.length, failedUrlCount: productionChecks.statusChecks.filter((item) => !item.ok).length, redirectCount: productionChecks.statusChecks.filter((item) => item.redirected).length, submittedOnThisRun: sitemapSubmitted },
    gsc: { authorized: gscData.authorized, lastSubmitted: gscData.sitemap?.lastSubmitted ?? null, lastDownloaded: gscData.sitemap?.lastDownloaded ?? null, pending: gscData.sitemap?.isPending ?? null, submittedCount: gscData.sitemap?.submittedCount ?? null, processedCount: gscData.sitemap?.processedCount ?? null, errors: gscData.sitemap?.errors ?? null, warnings: gscData.sitemap?.warnings ?? null, priorityUrls: gscData.inspections },
    regressions,
    changeSincePreviousRun: null,
    recommendedHumanAction: recommendation(regressions, authorizationRequired),
    authorizationRequired,
    controls: { automaticCommit: false, automaticPush: false, automaticDeploy: false, automaticPublish: false, requestIndexing: false, customerDataAccess: false },
    lastAlertFingerprint: previousReport?.lastAlertFingerprint ?? null,
    lastAlertAt: previousReport?.lastAlertAt ?? null,
    alertResult: { sent: false, reason: dryRun ? "dry-run" : "not-evaluated" },
  };
  report.changeSincePreviousRun = diffReports(previousReport, report);

  if (!dryRun) {
    const decision = shouldSendAlert(previousReport, report, now, config.alertRepeatHours);
    report.alertResult = { sent: false, reason: decision.reason };
    if (decision.send) {
      await sendFounderEmail({
        subject: `[Watchdog] ${headlineStates.join(" | ")}`,
        text: alertText(report),
        idempotencyKey: `honest-lenses-watchdog-${decision.fingerprint}-${now.toISOString().slice(0, 10)}`,
      });
      report.alertResult = { sent: true, reason: decision.reason };
      report.lastAlertFingerprint = decision.fingerprint;
      report.lastAlertAt = now.toISOString();
    }
    await writeFile(statePath, `${JSON.stringify({ ...previousState, sitemapMaterialHash: report.sitemap.materialHash, lastCompletedAt: now.toISOString() }, null, 2)}\n`, { mode: 0o600 });
  }

  const reportJsonPath = dryRun ? path.join(runtimeDirectory, "LATEST.DRY-RUN.json") : latestPath;
  const reportMarkdownPath = dryRun ? path.join(runtimeDirectory, "LATEST.DRY-RUN.md") : path.join(runtimeDirectory, "LATEST.md");
  await writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await writeFile(reportMarkdownPath, renderMarkdown(report), { mode: 0o600 });
  await writeFile(path.join(runtimeDirectory, "last-run.log"), `${now.toISOString()} SUCCESS ${report.mode} ${headlineStates.join(" | ")}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ status: "success", mode: report.mode, headlineStates, commits: report.commits, sitemapCount: report.sitemap.urlCount, gscAuthorized: report.gsc.authorized, regressions: report.regressions.length, alert: report.alertResult }, null, 2));
}

async function recordFailure(error) {
  const timestamp = new Date().toISOString();
  const failure = { timestamp, headlineStates: ["ACTION REQUIRED"], regressions: [problem("WATCHDOG_RUN_FAILURE", "high", safeMessage(error))], recommendedHumanAction: "Run the documented manual command and inspect the local last-run log.", controls: { automaticCommit: false, automaticPush: false, automaticDeploy: false, automaticPublish: false, requestIndexing: false, customerDataAccess: false } };
  await writeFile(path.join(runtimeDirectory, "LATEST.FAILURE.json"), `${JSON.stringify(failure, null, 2)}\n`, { mode: 0o600 });
  await writeFile(path.join(runtimeDirectory, "last-run.log"), `${timestamp} FAILURE ${safeMessage(error)}\n`, { mode: 0o600 });
  if (!dryRun) {
    try { await sendFounderEmail({ subject: "[Watchdog] ACTION REQUIRED — watchdog run failed", text: `Honest Lenses watchdog failed.\n\n${safeMessage(error)}\n\nNo customer or secret data is included.`, idempotencyKey: `honest-lenses-watchdog-failure-${timestamp.slice(0, 10)}` }); } catch {}
  }
}

function recommendation(regressions, authorizationRequired) {
  if (regressions.length) return regressions.filter((item) => item.severity === "high").slice(0, 3).map((item) => item.message).join(" ");
  if (authorizationRequired) return authorizationRequired;
  return "No human action is required.";
}

function alertText(report) {
  return [
    "Honest Lenses Deployment and Search Watchdog",
    "",
    `State: ${report.headlineStates.join(" | ")}`,
    `Sitemap: ${report.sitemap.urlCount} URLs`,
    `Commits: local ${short(report.commits.local)}, remote ${short(report.commits.remote)}, production ${short(report.commits.production)}`,
    "",
    ...report.regressions.filter((item) => item.severity === "high").slice(0, 8).map((item) => `- ${item.message}`),
    "",
    `Recommended action: ${report.recommendedHumanAction}`,
    "",
    "This report contains no customer, order, prescription, or secret data.",
  ].join("\n");
}

function renderMarkdown(report) {
  return `# Honest Lenses Deployment and Search Watchdog — LATEST\n\n- Run: ${report.timestamp}\n- State: ${report.headlineStates.join(" | ")}\n- Local / remote / production: ${report.commits.local} / ${report.commits.remote} / ${report.commits.production}\n- Sitemap: ${report.sitemap.urlCount} URLs; hash ${report.sitemap.hash}\n- GSC: ${report.gsc.authorized ? `downloaded ${report.gsc.lastDownloaded ?? "unknown"}; processed ${report.gsc.processedCount ?? "unknown"}` : "authorization required"}\n- Alert: ${report.alertResult.sent ? "sent" : report.alertResult.reason}\n\n## Regressions\n\n${report.regressions.length ? report.regressions.map((item) => `- [${item.severity.toUpperCase()}] ${item.message}`).join("\n") : "None."}\n\n## Recommended human action\n\n${report.recommendedHumanAction}\n`;
}

function dedupeProblems(items) { return [...new Map(items.map((item) => [item.key, item])).values()]; }
function unique(items) { return [...new Set(items)]; }
function short(sha) { return sha?.slice(0, 7) ?? "unknown"; }
function safeMessage(error) { return error instanceof Error ? error.message.replace(/[\r\n]+/g, " ").slice(0, 500) : "Unknown failure"; }
