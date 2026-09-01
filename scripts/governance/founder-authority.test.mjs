import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { evaluateFounderAuthority } from "./founder-authority.mjs";

const hotfixScopes = [
  "commit:5c4f79930c3d0fda47173e309e7f298a54cefd26",
  "migration:20260901194500_add_atomic_founder_verification_override.sql",
];

test("stale release metadata becomes warnings for the scoped hotfix", () => {
  const result = evaluateFounderAuthority({
    founderGo: true,
    authorizedScopes: hotfixScopes,
    requestedScopes: hotfixScopes,
    advisories: ["RC4 tag", "fixed migration count", "restore rehearsal", "Stripe canary", "write drain"],
  });
  assert.equal(result.proceed, true);
  assert.equal(result.decision, "founder_override_acknowledged");
  assert.equal(result.warnings.length, 5);
});

test("missing real credentials remain a hard blocker", () => {
  const result = evaluateFounderAuthority({
    founderGo: true,
    authorizedScopes: hotfixScopes,
    requestedScopes: hotfixScopes,
    technicalBlockers: [{ type: "missing_credentials", detail: "Production database authentication unavailable." }],
  });
  assert.equal(result.proceed, false);
  assert.equal(result.decision, "hard_blocked");
});

test("destructive operations require explicit founder intent", () => {
  const denied = evaluateFounderAuthority({ founderGo: true, authorizedScopes: hotfixScopes, requestedScopes: hotfixScopes, destructive: true });
  assert.equal(denied.proceed, false);
  const allowed = evaluateFounderAuthority({ founderGo: true, authorizedScopes: hotfixScopes, requestedScopes: hotfixScopes, destructive: true, destructiveAuthorized: true });
  assert.equal(allowed.proceed, true);
});

test("founder authorization excludes unrelated changes", () => {
  const result = evaluateFounderAuthority({ founderGo: true, authorizedScopes: hotfixScopes, requestedScopes: [...hotfixScopes, "migration:unrelated.sql"] });
  assert.equal(result.proceed, false);
  assert.equal(result.blockers[0].type, "founder_prohibition");
});

test("without explicit founder override advisory gates still require approval", () => {
  const result = evaluateFounderAuthority({ authorizedScopes: hotfixScopes, requestedScopes: hotfixScopes, advisories: ["test failure"] });
  assert.equal(result.proceed, false);
  assert.equal(result.decision, "approval_required");
});

test("agent and release guidance reference canonical authority without universal stale vetoes", async () => {
  const agentPolicy = await readFile(new URL("../../AGENTS.md", import.meta.url), "utf8");
  const runbook = await readFile(new URL("../../docs/production-deployment/05-deployment-runbook.md", import.meta.url), "utf8");
  const checklist = await readFile(new URL("../../docs/production-deployment/09-founder-go-no-go.md", import.meta.url), "utf8");
  assert.match(agentPolicy, /Founder override acknowledged; proceeding with the scoped action/);
  assert.match(runbook, /Founder authority policy/);
  assert.match(runbook, /Do not import this document's RC tag/);
  assert.match(checklist, /FOUNDER_GO=1/);
  assert.doesNotMatch(checklist, /Rule: every required item must be `PASS`/);
});
