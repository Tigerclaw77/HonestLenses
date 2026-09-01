# Founder authority policy

This is the canonical repository policy for Honest Lenses production decisions. It supersedes conflicting approval language in release-specific runbooks, checklists, scripts, and generated artifacts.

> The founder is the final authority for Honest Lenses production changes. Safety checks and runbooks provide defaults and warnings, not vetoes. When the founder explicitly authorizes a deployment, migration, rollback, hotfix, or scoped waiver, that authorization satisfies repository approval requirements for that scope. Automation must continue unless a genuine technical prerequisite makes execution impossible.

## Precedence

1. **Explicit founder instruction**
2. **Current technical safety conditions**
3. **Automated recommendations**
4. **Runbook defaults**

Repository controls may detect risk, warn, recommend precautions, and request explicit intent for destructive work. They may not add another approval layer after a scoped founder decision.

## Genuine hard blockers

Only these conditions stop a founder-authorized operation:

- a required credential or authentication is actually unavailable;
- the target service or provider is unavailable;
- the requested operation is technically impossible;
- execution would necessarily perform an action the founder explicitly prohibited or did not authorize, including unrelated scope or destructive work without explicit destructive intent.

A failed integrity or target check may reveal one of those blockers. Otherwise, stale release metadata, missing paperwork, an unsigned historical waiver, fixed migration counts, release tags, restore rehearsals, write drains, canaries, named operators, RPO/RTO signoffs, and multi-stage ceremonies are recommendations. They become warnings—not vetoes—after scoped founder authorization.

## Executable override

Set both values in the execution environment:

```text
FOUNDER_GO=1
FOUNDER_GO_SCOPE=commit:<full-sha>,migration:<exact-filename>
```

Every requested scope must match an entry exactly. Extra or missing scope is a hard blocker against unrelated deployment. The instruction that sets or accompanies these values must be an explicit founder decision; environment variables alone do not manufacture authorization.

For destructive work, the founder's original instruction must explicitly authorize the destructive operation and the execution environment must record that intent with `FOUNDER_DESTRUCTIVE_GO=1`. This records scope; it is not a second approval ceremony.

Use `npm run governance:check -- --scope <scope> [--scope <scope>]` to evaluate a decision. Use `--require-env NAME` for each credential that the selected procedure genuinely needs. Advisory failures supplied with `--advisory` are reported as warnings under the override. A genuine hard blocker always produces a nonzero exit.

## Protections that remain

- verify the exact target and project;
- compare migration history and integrity dynamically for the requested migration;
- protect credentials and never print or store secrets;
- detect destructive operations and require explicit founder intent;
- exclude unrelated commits, migrations, and data changes;
- run relevant tests and build validation when practical;
- warn clearly about irreversible actions and failed recommendations.

Historical release documents remain useful evidence for the release they name. Their fixed tags, counts, projects, and ceremonies do not automatically govern a later scoped change.

## Current Founder Override hotfix authorization

The founder explicitly authorized the following exact scope:

- commit `5c4f79930c3d0fda47173e309e7f298a54cefd26`;
- migration `20260901194500_add_atomic_founder_verification_override.sql`;
- migration-first deployment after migration verification;
- waiver of restore rehearsal, live Stripe canary, multi-stage write drain, and browser ceremony beyond a normal production smoke test.

This satisfies repository approval, signoff, and GO requirements for that scope only. It does not supply missing production credentials, authenticate to Supabase or Vercel, verify provider availability, authorize unrelated changes, or authorize payment, customer, or fulfillment mutations.
