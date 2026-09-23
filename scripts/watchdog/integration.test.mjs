// Real Git repositories and the real runner; all HTTP/email calls are intercepted.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { git, countRemoteAhead, githubDeploymentSnapshot } from "./runtime.mjs";
import { classifyDeployment, shouldSendAlert } from "./lib.mjs";

const exec = promisify(execFile);
const source = path.dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(path.join(os.tmpdir(), "hl-watchdog-integration-"));
try {
  const remote = path.join(temp, "remote.git");
  const repo = path.join(temp, "repo");
  await mkdir(repo);
  await git(temp, ["init", "--bare", "--initial-branch=main", remote]);
  await git(repo, ["init", "--initial-branch=main"]);
  await git(repo, ["config", "user.name", "Watchdog Test"]);
  await git(repo, ["config", "user.email", "watchdog@example.invalid"]);
  await git(repo, ["remote", "add", "origin", remote]);
  const scripts = path.join(repo, "scripts", "watchdog");
  await mkdir(scripts, { recursive: true });
  for (const file of ["run.mjs", "runtime.mjs", "lib.mjs", "watchdog.config.json"]) await cp(path.join(source, file), path.join(scripts, file));
  // Prevent discovery of host credentials, including ADC, in this fixture.
  await writeFile(path.join(scripts, "gsc.mjs"), "export async function discoverGoogleCredential(){return null;} export const getAccessToken=()=>{}, retrieveGscData=()=>{}, submitSitemap=()=>{};");
  const config = JSON.parse(await readFile(path.join(scripts, "watchdog.config.json"), "utf8"));
  Object.assign(config, { intendedBranch: "main", priorityUrls: ["https://honestlenses.com/"], expectedSchema: {}, deepSampleSize: 1 });
  await writeFile(path.join(repo, ".gitignore"), ".watchdog/\n");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "Fixture"]);
  await git(repo, ["push", "-u", "origin", "main"]);
  const canonicalSha = (await git(repo, ["rev-parse", "HEAD"])).trim();
  const preload = path.join(temp, "http.mjs");
  await writeFile(preload, `
    import { appendFileSync } from 'node:fs';
    globalThis.fetch = async (url, init = {}) => {
      url = String(url);
      if (url === 'https://api.resend.com/emails') {
        appendFileSync(process.env.MAIL_LOG, init.body + '\\n');
        if(process.env.SCENARIO === 'mail-failure') return new Response('', {status:503});
        return new Response('{}');
      }
      if (process.env.SCENARIO === 'offline') throw new Error('fixture offline');
      if(url.startsWith('https://api.github.com/')) {
        if(['github-unavailable','github-only-unavailable'].includes(process.env.SCENARIO)) return new Response('', {status:403});
        if(process.env.SCENARIO === 'missing-status') return Response.json({statuses:[]});
        return Response.json({statuses:[{context:'Vercel – honest-lenses',state:process.env.SCENARIO === 'deploy-failure'?'failure':'success',updated_at:new Date().toISOString()}]});
      }
      if(url.endsWith('/robots.txt')) return new Response('User-agent: *\\nSitemap: https://honestlenses.com/sitemap.xml');
      if(url.endsWith('/sitemap.xml')) return new Response(process.env.SCENARIO === 'bad-sitemap' ? '<bad>' : '<urlset><url><loc>https://honestlenses.com/</loc></url></urlset>');
      if(process.env.SCENARIO === 'page-offline') throw new Error('fixture page timeout');
      return new Response('<link rel="canonical" href="https://honestlenses.com/">', {status: ['page-failure','github-unavailable','mail-failure'].includes(process.env.SCENARIO)?503:200});
    };
  `);
  let runIndex = 0;
  async function run(scenario = "healthy", expectedMail = 0) {
    config.runtimeDirectory = `.watchdog/run-${runIndex++}`;
    await writeFile(path.join(scripts, "watchdog.config.json"), JSON.stringify(config));
    const mailLog = path.join(temp, `mail-${runIndex}.jsonl`);
    const { stdout } = await exec(process.execPath, ["--import", pathToFileURL(preload).href, path.join(scripts, "run.mjs")], {
      cwd: repo, windowsHide: true, env: { ...process.env, SCENARIO: scenario, MAIL_LOG: mailLog, RESEND_API_KEY: "fixture", FOUNDER_ALERT_EMAIL: "fixture@example.invalid" },
    });
    const report = JSON.parse(await readFile(path.join(repo, config.runtimeDirectory, "LATEST.json"), "utf8"));
    const mails = (await readFile(mailLog, "utf8").catch(() => "")).trim().split("\n").filter(Boolean);
    assert.equal(mails.length, expectedMail, `${scenario}: email attempts`);
    if (!expectedMail) assert(!report.headlineStates.includes("ACTION REQUIRED"), stdout);
    return report;
  }
  for (const [branch, upstream] of [["main", "origin/main"], ["codex/tracked", "origin/codex/tracked"], ["codex/no-upstream", null]]) {
    if (branch !== "main") {
      await git(repo, ["switch", "-c", branch]);
      await writeFile(path.join(repo, "work.md"), branch);
      await git(repo, ["add", "work.md"]);
      await git(repo, ["commit", "-m", branch]);
      if (upstream) await git(repo, ["push", "-u", "origin", branch]);
    }
    const report = await run();
    assert.equal(report.git.branch, branch);
    assert.equal(report.git.upstream, upstream);
    assert.equal(report.commits.remote, canonicalSha);
    assert.equal(report.commits.production, canonicalSha);
    console.log(`PASS ${branch}: upstream=${upstream}, no ACTION REQUIRED, zero emails`);
  }
  await git(repo, ["switch", "--detach"]);
  assert.equal((await run()).git.upstream, null);
  await run("offline");
  await run("github-only-unavailable");
  await run("page-offline");
  await run("missing-status"); // Recent commit: deployment grace period.
  config.deploymentStaleHours = -1; // Force the same fixture commit beyond grace.
  await run("missing-status", 1);
  config.deploymentStaleHours = 6;
  await run("bad-sitemap", 1);
  await run("page-failure", 1);
  await run("deploy-failure", 1);
  await run("github-unavailable", 1); // Unavailable GitHub must not hide confirmed HTTP failures.
  const mailFailure = await run("mail-failure", 1);
  assert.equal(mailFailure.alertResult.reason, "notification-unavailable");
  await git(repo, ["remote", "set-url", "origin", path.join(temp, "missing.git")]);
  assert((await run()).diagnostics.some((item) => item.startsWith("Git snapshot")));
  await run("page-failure", 1); // Failed fetch must not hide production failures either.
  assert.equal(await countRemoteAhead(repo, "f".repeat(40), canonicalSha), null);
  const production = await githubDeploymentSnapshot(config, canonicalSha, { commits: { production: "old" } }, async () => Response.json({statuses:[]}));
  assert.equal(production.productionSha, null, "Do not reuse a historical baseline for another branch");
  for (const input of [{ localAhead: 5, staleDirtyFiles: ["work.md"] }, {remoteAhead: 1, productionSha: "old", remoteSha: "new"}]) {
    assert.equal(shouldSendAlert(null, {regressions: classifyDeployment(input).problems}, new Date(), 72).send, false);
  }
  assert(classifyDeployment({deploymentState: "missing", driftActionable: true}).problems.some((p) => p.severity === "high"));
  assert(classifyDeployment({remoteAhead: 1, productionSha: "old", remoteSha: "new", driftActionable: true}).problems.some((p) => p.severity === "high"));
} finally {
  assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep));
  await rm(temp, { recursive: true, force: true });
}
console.log("Watchdog branch and alert-routing integration tests passed (no real email or production writes).");
