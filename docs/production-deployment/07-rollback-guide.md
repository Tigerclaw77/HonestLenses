# Operational rollback and recovery guide

> Governance: [Founder authority policy](00-founder-authority.md). This is the default recovery guidance; explicit scoped founder decisions control whether advisory rehearsal and ceremony are required.

Database rollback is not the default response. First determine whether the
failure is pre-commit, post-commit but forward-compatible, or destructive.

## Before rollback

1. Stop checkout, admin mutations, verification, fulfillment, and webhooks.
2. Confirm `COMMERCE_V2_ENABLED=false`.
3. Record incident start and last known good UTC timestamp.
4. Preserve application/database/Stripe logs and current catalog.
5. Query migration history read-only.
6. Run post-migration assertions read-only and save the output.
7. Identify which migration committed; do not infer from a disconnected CLI.
8. Record all Stripe events and database writes after the recovery point.
9. Confirm verified backup/PITR target, RPO/RTO, restore operator, and approval.

## Decision matrix

| State | Action |
| --- | --- |
| Lock timeout or statement failure; no history row | No schema rollback; CLI transaction already reverted |
| Connection lost; commit outcome unknown | Keep writes stopped; inspect ledger/object postconditions |
| Commerce v2 committed, security failed | Leave dormant schema; fix/retry security migration |
| Both migrations committed, application release fails | Roll back application release; keep compatible database changes |
| Security migration creates a localized route incompatibility | Prefer forward application/database fix |
| Confirmed destructive data/permission corruption | Restore verified PITR/backup after explicit approval |

## Rollback sequence

1. Keep writes/webhooks stopped.
2. Roll back the application release if it is the failing component.
3. Re-run read-only owner/grant/RLS/integrity checks.
4. If the database remains forward-compatible, leave both migrations applied.
5. If a dormant Commerce v2 reverse is explicitly approved, execute only
   [`sql/commerce-v2-schema-reverse.sql`](sql/commerce-v2-schema-reverse.sql).
   It locks and checks all 15 Commerce tables with exact `EXISTS` queries in
   one transaction before dropping either schema. It never uses
   `pg_stat_user_tables` estimates.

   The database gate proves:

   - all empty tables permit reversal;
   - one populated table aborts and names the table;
   - multiple populated tables abort and name every populated table;
   - a concurrent insert cannot race between the emptiness checks and drops.

6. Only after independent schema verification may a separately approved
   operator mark `20260729144510` reverted in migration history.
7. Do not use a generic down migration for security remediation.

## Security remediation recovery

A blind reverse would restore the confirmed anonymous admin-view exposure and
shared guest ownership model.

Preferred order:

1. forward-fix the incompatible route/permission;
2. roll back the application to a version compatible with the remediated
   database;
3. PITR/backup restore for destructive incompatibility.

If an exceptional reverse is approved, generate exact SQL from:

- encrypted `rollback-recovery-rows.json`;
- pre-change admin view definitions/ACLs;
- policies/grants/default ACLs in `catalog.json`;
- pre-change Storage bucket values.

The generated transaction must:

1. restore only captured order IDs whose `user_id` is still null;
2. verify no null before restoring `orders.user_id NOT NULL`;
3. restore exact views and ACLs;
4. restore exact policies/grants/default ACLs;
5. restore exact Storage values;
6. remove new rate-limit/recovery objects only if they contain no new data;
7. abort on any mismatch.

This reverse reintroduces security risk and is permitted only while the
application is isolated.

## Full restore

Use PITR/backup restore only after the incident commander approves the data-loss
window and downtime.

1. Record recovery target in UTC.
2. Stop all writers and webhook consumers.
3. Snapshot current incident evidence.
4. Start the approved Supabase restore.
5. Do not make further changes until project status is healthy.
6. Verify schema, ledger, Auth metadata, Storage metadata, and application
   integrity.
7. Replay/reconcile every Stripe event after the recovery point.
8. Restore missing non-database Storage objects through the separate Storage
   recovery procedure.
9. Run the full authorization/order/admin/receipt smoke matrix.
10. Reopen writes in the normal staged order.

## Verification after rollback/recovery

- schema/catalog matches the selected state;
- migration ledger matches actual objects;
- no invalid constraint/index or orphan FK;
- order count and captured rollback rows reconcile;
- payment authorization/capture/refund state matches Stripe;
- no duplicate webhook/operation idempotency key;
- verification/fulfillment state is possible and audited;
- owner succeeds and cross-account/anonymous access fails;
- service routes function; browser roles remain least privilege;
- prescription metadata and files are available;
- Commerce v2 remains disabled.

## When rollback must not be attempted

- commit outcome is unknown;
- no verified restore point exists;
- migration state and history disagree;
- Commerce v2 contains data;
- rollback SQL was generated from stale/missing evidence;
- restoring would lose unreconciled Stripe or order writes;
- the proposed security reverse would expose production while traffic is live;
- only a forward-compatible application error exists;
- incident command has not authorized the accepted data-loss window.
