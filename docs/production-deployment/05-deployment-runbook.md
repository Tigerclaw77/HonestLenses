# Production deployment runbook

> Governance: [Founder authority policy](00-founder-authority.md). This sequence is the default for the July Commerce v2 release. For a later scoped change, use the exact requested commit and dynamically verified pending migration set. Under `FOUNDER_GO=1`, waived or irrelevant steps are warnings; only canonical genuine hard blockers stop execution.

## Scope before ceremony

Record the exact commit, migration filenames, target project, and founder-authorized waivers. Do not import this document's RC tag, fixed migration count, Commerce v2, Stripe canary, restore rehearsal, browser waiver, or write-drain requirements into an unrelated release. Validate the decision with `npm run governance:check` and the exact requested scopes.

Version: **1.2.0** — Effective: **2026-07-30**

This document is preparation only. Do not execute it without a separate,
explicit production authorization.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1.2.0 | 2026-07-30 | Made the Supabase Session pooler on port 5432 canonical; replaced session-default read-only enforcement with transaction-scoped enforcement; replaced `pg_dumpall` with repository-controlled roles export |
| 1.1.0 | 2026-07-30 | Founder-approved baseline process: guarded production-owner capture, Dashboard backup/PITR evidence, and BitLocker-local evidence storage |
| 1.0.0 | 2026-07-29 | Initial frozen release-candidate deployment runbook |

## Roles

- Founder/incident commander: final go/no-go and restore authority.
- Database operator: executes the reviewed CLI commands.
- Application operator: controls write drain, application release, and flags.
- Stripe operator: verifies account/events and executes an approved canary.
- Recorder/observer: records every result and timestamp.

The database operator must not self-approve a failed or ambiguous gate.

## T-24 hours

1. Freeze database migrations and production DDL.
2. Check out the exact full commit SHA in the founder-authorized scope, verify
   `HEAD` matches it, and exclude all unrelated working-tree changes from the
   release artifact. An annotated tag is optional unless the scope names one.
3. Complete [Production baseline capture](01-production-baseline.md) using the
   production database owner through the Supabase Shared Pooler in Session
   mode on port `5432`. Every repository SQL capture must begin a server-
   enforced read-only transaction, verify `transaction_read_only=on` inside
   that transaction, and finish with `ROLLBACK`. Use only the pinned clients
   and repository SQL, prohibit interactive SQL, and clear the credential
   immediately after the second capture.
4. Complete [Drift verification](02-drift-verification.md).
5. Have the founder capture and sign the exact Supabase Dashboard backup/PITR
   evidence required by [Backup verification](03-backup-verification.md). No
   Management API token is required.
6. Verify all migration filenames and hashes in
   [Migration package](04-migration-package.md).
7. In a clean PowerShell session define the native-exit guard and run the full
   release suite:

   ```powershell
   function Assert-NativeSuccess([string]$Operation) {
     if ($LASTEXITCODE -ne 0) {
       throw "$Operation failed with native exit code $LASTEXITCODE"
     }
   }

   npm.cmd test
   Assert-NativeSuccess 'npm test'
   npm.cmd run lint
   Assert-NativeSuccess 'npm run lint'
   npx.cmd tsc --noEmit
   Assert-NativeSuccess 'TypeScript check'
   npm.cmd run build
   Assert-NativeSuccess 'production build'
   npm.cmd run test:security:database
   Assert-NativeSuccess 'database security gate'
   npm.cmd run test:security:baseline-toolchain
   Assert-NativeSuccess 'baseline toolchain gate'
   git diff --check
   Assert-NativeSuccess 'conflict/whitespace check'
   ```

8. Confirm previous hosted Supabase/RLS and Stripe test-mode evidence remains
   attached to the release.
9. Confirm `COMMERCE_V2_ENABLED=false` in every production runtime and worker.
10. Confirm no scheduled job or webhook consumer writes to `commerce_v2`.
11. Verify production Supabase project ref, region, Shared Pooler Session-mode
    connection on port `5432`, and migration role `postgres`. Direct or IPv6
    connectivity is not required.
12. Verify production Stripe account ID, webhook endpoint, signing-secret
    mapping, and livemode separation read-only.
13. Prepare and verify the executable
    [production write drain](11-write-drain.md), including the canary secret,
    exact same-commit deployment artifacts for every mode, operator, and
    rollback-to-`all` artifact.
14. Review [Rollback guide](07-rollback-guide.md), named restore operator,
    accepted RPO/RTO, and Stripe replay plan.
15. Create the [deployment log](10-deployment-log-template.md).
16. Confirm the evidence folder is outside Git on a local BitLocker-protected
    drive and `bitlocker-status.txt` shows `Fully Encrypted`, `100%`, and
    `Protection On`.

Absent evidence must be reported accurately. Without founder authorization the default recommendation is `NO-GO`; with a scoped founder override, absent or waived advisory evidence is a warning unless it exposes a genuine hard blocker.

## T-30 minutes

Record:

- database CPU/connections/locks/long transactions;
- API 5xx, latency, and authorization-error baseline;
- current order count and shared guest UUID count;
- webhook backlog and last successfully processed Stripe event;
- open reconciliation findings;
- admin Action Required and fulfillment queue counts;
- current Commerce v2 row count, which must be zero/absent.

Reject go if:

- database health is degraded;
- any transaction touching `public.orders` has run longer than 30 seconds;
- migration history/catalog changed after baseline approval;
- a Stripe webhook backlog or unresolved reconciliation issue exists;
- founder checklist has a required item other than `PASS`.

## T-10 minutes: write drain

1. Announce the write window.
2. Follow [Production write drain](11-write-drain.md) to promote the exact
   release commit with `PRODUCTION_WRITE_DRAIN_MODE=all`.
3. Prove a normal write is blocked and a representative read succeeds.
4. Let requests admitted by the previous deployment complete.
5. Capture two `write-drain-observation.sql` results 30 seconds apart.
6. Require no active/prepared writer and identical table-write counters.
7. Capture final rollback rows and pre-migration assertions.
8. Record the exact UTC checkpoint and verified restore point.

Reads may stay available if the application supports it safely.

## Dry run

Reacquire `HL_PRODUCTION_SESSION_POOLER_URL` through the exact secure prompt
and route validation in baseline step 2. It must identify the approved project,
Shared Pooler host, and port `5432`; never log or persist it. Pin timeout
safety:

```powershell
$env:PGOPTIONS='-c lock_timeout=5s -c statement_timeout=120s'
supabase.cmd --version
$cliVersion=$LASTEXITCODE
if ($cliVersion -ne 0) { throw "Supabase version check failed: $cliVersion" }

$dryRun=supabase.cmd db push `
  --db-url $env:HL_PRODUCTION_SESSION_POOLER_URL `
  --dry-run
Assert-NativeSuccess 'Supabase migration dry run'
$dryRun | Set-Content -Encoding utf8 '<evidence-folder>\db-push-dry-run.txt'
```

Expected:

```text
20260729144510_create_commerce_v2_phase1.sql
20260729160750_security_remediation_least_privilege.sql
```

The Resend migration must not appear. No other migration may appear.

The dry run lists pending migrations; it does not prove their SQL will succeed.
The exact SQL was already validated locally and in the disposable hosted
rehearsal.

## Final go/no-go

The founder may use [Founder Go/No-Go](09-founder-go-no-go.md) as a risk worksheet. An explicit scoped founder instruction is itself the GO decision and requires no additional signature or ceremony. Proceed after the executable scope check unless a genuine hard blocker is present.

## Migration execution

Run once:

```powershell
supabase.cmd db push `
  --db-url $env:HL_PRODUCTION_SESSION_POOLER_URL
Assert-NativeSuccess 'Supabase migration push'
```

Do not add `--include-all`, `--include-seed`, or `--include-roles`.

Expected behavior:

1. CLI applies `20260729144510` and its history row in one transaction.
2. CLI applies `20260729160750` and its history row in a separate transaction.
3. Total idle hosted time is expected under one minute.
4. A lock wait longer than five seconds aborts rather than queues.

Record the start/end/result for each migration from CLI output. If Commerce v2
commits and security remediation fails, keep Commerce v2 disabled and dormant,
investigate the security failure, and do not reopen writes.

## Immediate database verification

```powershell
$psql=Join-Path $env:LOCALAPPDATA `
  'HonestLensesTools\PostgreSQL-17.10\pgsql\bin\psql.exe'
$postAssertions=& $psql -X --set ON_ERROR_STOP=1 --quiet --tuples-only --no-align `
  --dbname $env:HL_PRODUCTION_SESSION_POOLER_URL `
  --file 'docs/production-deployment/sql/post-migration-assertions.sql'
Assert-NativeSuccess 'post-migration assertions'
$postAssertions | Set-Content -Encoding utf8 `
  '<evidence-folder>\post-migration-assertions.json'
```

Expected: all 12 checks are `PASS`; check 10 proves
`transaction_read_only=on` inside the assertions transaction. The file begins
with `BEGIN TRANSACTION READ ONLY` and finishes with `ROLLBACK`; no
session-default read-only setting is required.

Then run:

```powershell
$advisorOutput=supabase.cmd --output-format json db advisors `
  --db-url $env:HL_PRODUCTION_SESSION_POOLER_URL `
  --type security `
  --level info `
  --fail-on warn
Assert-NativeSuccess 'Supabase Security Advisor'
$advisorOutput | Set-Content -Encoding utf8 `
  '<evidence-folder>\security-advisor.json'

$finalCatalog=& $psql -X --set ON_ERROR_STOP=1 --quiet --tuples-only --no-align `
  --dbname $env:HL_PRODUCTION_SESSION_POOLER_URL `
  --file 'docs/production-deployment/sql/production-catalog-export.sql'
Assert-NativeSuccess 'final production catalog'
$finalCatalog | Set-Content -Encoding utf8 `
  '<evidence-folder>\post-migration-catalog.json'

Remove-Item Env:HL_PRODUCTION_SESSION_POOLER_URL -ErrorAction SilentlyContinue
Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue
if (Test-Path Env:HL_PRODUCTION_SESSION_POOLER_URL) {
  throw 'Production Session pooler credential cleanup failed'
}
```

Expected:

- exit zero;
- no `WARN` or `ERROR`;
- any `INFO` is individually classified against the approved deny-by-default
  model.

Capture a fresh catalog and manifest. Verify expected post-migration object,
owner, RLS, grant, default-ACL, function, trigger, view, enum, index, and
Storage state.

## Smoke tests and phased reopening

The reviewed application release is already active in mode `all`. Do not
switch commits while reopening.

1. Confirm `COMMERCE_V2_ENABLED=false`.
2. Run the read-only HTTP matrix and signed customer/admin canaries.
3. Execute [Production smoke tests](06-production-smoke-tests.md) in order.
4. Reopen through same-commit deployments in exact mode order:
   `webhooks`, `operations`, `off`.
5. At every phase, prove the next group remains blocked and complete the
   observation interval in [Production write drain](11-write-drain.md).
6. Do not resume broad traffic on a partial pass.

## Remain live

Production may remain live only if:

- migration/assertion/advisor results pass;
- Commerce v2 remains disabled and empty;
- all critical smoke tests pass;
- Stripe state reconciles;
- no abort threshold fires during the first hour;
- the incident commander records an explicit “remain live” decision.

Follow [Monitoring](08-monitoring.md) for 24 hours.
