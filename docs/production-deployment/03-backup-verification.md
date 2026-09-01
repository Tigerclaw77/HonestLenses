# Backup and restore verification

> Governance: [Founder authority policy](00-founder-authority.md). Backup and restore evidence is strongly recommended. A scoped founder waiver converts missing rehearsal, RPO/RTO paperwork, or named-operator evidence to warnings unless the requested operation is destructive or current conditions make recovery capability a genuine technical prerequisite.

Do not assume a Supabase backup, PITR window, or restorable Storage object
backup exists. Verify each independently before migration.

## 1. Founder-verified Dashboard evidence

No Management API token is required. The founder opens the production project
in the Supabase Dashboard and captures either these three screenshots or one
three-page PDF containing the same views:

1. `supabase-project-identity.png`: Settings/General with production project
   name, project ref, and region visible.
2. `supabase-backup-status.png`: Database/Backups with latest completed backup
   status, type, timestamp, and the available backup/retention list visible.
3. `supabase-pitr-status.png`: PITR enabled/disabled state and, when enabled,
   earliest/latest available recovery points and recovery window.

The PDF alternative is `supabase-backup-pitr-evidence.pdf`, with those views
in that order. Every view must be legible and visibly associated with the same
production project. Do not include secrets or customer data.

The founder records their name, verification UTC, project ref/region, backup
status/type/time, PITR state/window, selected recovery path, and accepted RPO
in `deployment-log.md`. The founder also records that no restore, clone, or
other mutation was initiated. Any missing, stale, or ambiguous value is
`NOT VERIFIED`.

## 2. Pass criteria

One of these recovery paths must be explicitly approved:

### Path A — PITR

- the Dashboard shows PITR enabled;
- earliest/latest recovery timestamps and the recovery window are visible;
- latest recovery point is at or after the recorded pre-migration checkpoint,
  allowing for a quiet database where no newer WAL is necessary;
- retention extends beyond the planned first-day monitoring period;
- founder accepts the documented restore downtime and RPO.

### Path B — completed physical/daily backup

- the Dashboard shows at least one completed backup;
- its timestamp is before the migration and within the accepted RPO;
- a current logical schema dump and encrypted rollback-row export also exist;
- founder explicitly accepts loss of writes between backup and incident;
- a restore-to-new-project rehearsal has passed.

If neither path passes, report backup status as `FAIL`. Without founder
authorization, the default recommendation is `NO-GO`; with a scoped founder
waiver it is a warning unless it creates a genuine hard blocker.

## 3. Restore confidence

A listed backup is not proof of restorability. Before the production window,
restore the selected backup or PITR point to a new disposable project using
Supabase's “Restore to a New Project” workflow.

This operation must target a new project, never production. Record:

- source recovery point;
- target project ref and region;
- start/end timestamps and total duration;
- PostgreSQL version;
- schema/catalog checksum comparison;
- migration ledger;
- application relation counts;
- Auth user count;
- Storage bucket metadata;
- integrity and authorization smoke-test results.

Pass criteria:

- restore completes without error;
- restored schema/catalog matches the selected source point;
- required Auth metadata is present;
- order/payment/fulfillment integrity checks pass;
- the restored project can support the documented forward migration;
- measured restore duration is accepted as the incident downtime estimate.

Delete the disposable project only after evidence is retained and cleanup is
approved.

## 4. Storage recovery limitation

Supabase database backups include Storage metadata but do not restore the
underlying objects deleted from the Storage service.

Before go:

- inventory the `prescriptions` bucket object count and metadata read-only;
- confirm the organization's separate Storage object backup/retention process;
- confirm how a missing prescription object is restored;
- record the responsible operator and recovery SLA.

If prescription files have no recovery method, record the limitation and have
the founder accept it. A database PITR restore alone is not a complete Storage
recovery plan.

## 5. Rollback prerequisites

All must be present:

- verified recovery point identifier and UTC timestamp;
- restore authority and named operator;
- tested restore-to-new-project evidence;
- encrypted `rollback-recovery-rows.json`;
- pre-change view definitions, policies, grants, and default ACLs in
  `catalog.json`;
- pre-change Storage bucket settings;
- Stripe event-replay/reconciliation procedure for events after the recovery
  point;
- application write-drain and reopen procedures;
- accepted RPO and measured/estimated RTO.

## Status

Until the founder-verified Dashboard evidence and restore rehearsal are
captured:

- Backup verified: `NOT VERIFIED`
- PITR verified: `NOT VERIFIED`
- Restore confidence: `NOT VERIFIED`

Supabase documents backup retention, PITR recovery windows, restoration
downtime, and Storage limitations in
[Database Backups](https://supabase.com/docs/guides/platform/backups).
