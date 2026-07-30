# Honest Lenses production deployment package

Status: **release candidate frozen; ready for execution-time checks; not authorized for deployment**
Prepared: 2026-07-30
Package/runbook version: **1.1.0**
Pinned Supabase CLI: `2.109.1`

This is the permanent execution package for the reviewed Commerce v2 schema
and least-privilege migrations. It does not authorize `db push`, a production
database change, a live Stripe change, or enabling Commerce v2.

## Document index

| Order | Document | Use |
| ---: | --- | --- |
| 1 | [Production baseline](01-production-baseline.md) | Capture the authoritative schema, roles, catalog, migration ledger, and Storage configuration using read-only operations |
| 2 | [Drift verification](02-drift-verification.md) | Compare the repository, approved baseline, and fresh production metadata |
| 3 | [Backup verification](03-backup-verification.md) | Prove backup/PITR availability and restore confidence |
| 4 | [Migration package](04-migration-package.md) | Approved migration order, hashes, dependencies, locks, timing, and per-file checks |
| 5 | [Deployment runbook](05-deployment-runbook.md) | Operator sequence from freeze through reopening |
| 6 | [Production smoke tests](06-production-smoke-tests.md) | Ordered customer, admin, database, and Stripe checks |
| 7 | [Rollback guide](07-rollback-guide.md) | Incident classification, rollback, recovery, and integrity checks |
| 8 | [Monitoring guide](08-monitoring.md) | First-hour and first-day monitoring with thresholds |
| 9 | [Founder Go/No-Go](09-founder-go-no-go.md) | One-page decision checklist |
| 10 | [Deployment log template](10-deployment-log-template.md) | Permanent evidence record for the actual execution |
| 11 | [Production write drain](11-write-drain.md) | Executable drain, signed canaries, zero-write proof, phased reopening, and abort path |
| 12 | [Browser validation waiver](12-browser-validation-waiver.md) | Exact waived scenario, equivalent evidence, residual risk, and founder approval |
| 13 | [Release inventory](13-release-inventory.md) | Classification of every freeze-review change and cleanup disposition |

Printable artifact:

- [Founder Go/No-Go PDF](../../output/pdf/honest-lenses-founder-go-no-go.pdf)
- [Release package SHA-256 manifest](release-manifest.sha256)

Supporting read-only SQL:

- [Production catalog export](sql/production-catalog-export.sql)
- [Pre-migration assertions](sql/pre-migration-assertions.sql)
- [Post-migration assertions](sql/post-migration-assertions.sql)
- [Rollback recovery-row export](sql/rollback-recovery-rows.sql)
- [Exact Commerce v2 schema reverse](sql/commerce-v2-schema-reverse.sql)
- [Migration ledger export](sql/migration-ledger-export.sql)
- [Write-drain observation](sql/write-drain-observation.sql)

## Hard boundaries

- Never run `supabase db push` until every required founder checklist item is
  `PASS`.
- Never use `db reset`, `db pull`, `migration repair`, `--include-all`,
  `--include-seed`, or `--include-roles` during the production deployment.
- Never put the production schema dump into `supabase/migrations`; it is a
  baseline/recovery artifact, not a pending migration.
- Keep `COMMERCE_V2_ENABLED=false`.
- Do not perform live Stripe mutations unless a separately approved canary
  transaction is recorded in the deployment log.
- A `NOT VERIFIED` item is not a soft pass.

## Required evidence folder

At execution time create a timestamped folder outside source control:

```text
production-evidence/
  YYYYMMDDTHHMMSSZ/
    schema-public.sql
    roles.sql
    catalog.json
    post-migration-catalog.json
    pre-migration-assertions.json
    post-migration-assertions.json
    migration-ledger.json
    db-push-dry-run.txt
    security-advisor.json
    write-drain-observation-1.json
    write-drain-observation-2.json
    toolchain.txt
    bitlocker-status.txt
    supabase-project-identity.png
    supabase-backup-status.png
    supabase-pitr-status.png
    rollback-recovery-rows.json
    manifest.sha256
    deployment-log.md
```

The three Supabase PNG files may be replaced by the single three-page
`supabase-backup-pitr-evidence.pdf` defined in the backup procedure.

The database URL, credentials, API keys, customer data, and rollback recovery
rows must never be committed. A local folder outside Git on a drive whose
BitLocker status is `Fully Encrypted`, `100%`, and `Protection On` satisfies
the encrypted-evidence requirement. Limit access to the deployment operators.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1.1.0 | 2026-07-30 | Replaced the dedicated read-only-role prerequisite with a guarded owner capture; replaced Management API backup evidence with founder-verified Dashboard evidence; accepted protected BitLocker-local storage |
| 1.0.0 | 2026-07-29 | Initial frozen release-candidate package |

## Official references

- [Supabase CLI reference](https://supabase.com/docs/reference/cli/overview)
- [Database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Database backups and PITR](https://supabase.com/docs/guides/platform/backups)
- [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project)
- [Data API grant-default change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
