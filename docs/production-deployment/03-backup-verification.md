# Backup and restore verification

Do not assume a Supabase backup, PITR window, or restorable Storage object
backup exists. Verify each independently before migration.

## 1. Read-only backup metadata

Use a fine-grained Management API token with `backups_read` only:

```powershell
$headers=@{ Authorization="Bearer $env:SUPABASE_ACCESS_TOKEN" }
$uri="https://api.supabase.com/v1/projects/$env:HL_PRODUCTION_PROJECT_REF/database/backups"
$backupState=Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
$backupState | ConvertTo-Json -Depth 20 |
  Set-Content -Encoding utf8 '<evidence-folder>\backups.json'
```

Expected HTTP status: `200`.

Record:

- project region;
- `walg_enabled`;
- `pitr_enabled`;
- each backup ID, type, status, and `inserted_at`;
- `earliest_physical_backup_date_unix`;
- `latest_physical_backup_date_unix`.

Do not call `restore-pitr`, `undo`, or any `POST`, `PATCH`, or `DELETE`
endpoint during verification.

## 2. Pass criteria

One of these recovery paths must be explicitly approved:

### Path A — PITR

- `pitr_enabled=true`;
- `walg_enabled=true`;
- earliest/latest physical recovery timestamps are present;
- latest recovery point is at or after the recorded pre-migration checkpoint,
  allowing for a quiet database where no newer WAL is necessary;
- retention extends beyond the planned first-day monitoring period;
- founder accepts the documented restore downtime and RPO.

### Path B — completed physical/daily backup

- at least one backup has `status=COMPLETED`;
- its timestamp is before the migration and within the accepted RPO;
- a current logical schema dump and encrypted rollback-row export also exist;
- founder explicitly accepts loss of writes between backup and incident;
- a restore-to-new-project rehearsal has passed.

If neither path passes, backup status is `FAIL` and deployment is `NO-GO`.

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

Until the read-only API response and restore rehearsal are captured:

- Backup verified: `NOT VERIFIED`
- PITR verified: `NOT VERIFIED`
- Restore confidence: `NOT VERIFIED`

Supabase documents backup retention, PITR recovery windows, restoration
downtime, and Storage limitations in
[Database Backups](https://supabase.com/docs/guides/platform/backups).
