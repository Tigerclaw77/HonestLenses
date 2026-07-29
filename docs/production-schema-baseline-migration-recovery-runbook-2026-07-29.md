# Honest Lenses production schema baseline and migration recovery review

> **Historical evidence only.** Do not execute commands from this report.
> The authoritative release procedure is
> [`docs/production-deployment/README.md`](production-deployment/README.md).

Date: 2026-07-29
Scope: production schema provenance, migration transactions, recovery, and deployment runbook only
Production changes made: none
Deployment performed: no
Commerce v2 enabled: no
Live Stripe modified: no

## Decision

The two remaining concerns are not new architectural defects.

| Concern | Root cause | Classification | Status |
| --- | --- | --- | --- |
| Complete production schema baseline | The repository contains only one historical production migration. The production database contains a much older legacy schema whose originating DDL is not in `supabase/migrations`. Several later changes exist only as one-off SQL files in `docs/`. | Documentation + migration-history + operational issue | Authoritative read-only export still required before deployment |
| Migration transaction boundary | The security migration contained `BEGIN`/`COMMIT`, while the hosted executor also opened a transaction. Its inner `COMMIT` could end the executor transaction before migration-history recording. | Migration issue | Fixed locally by removing the file-level wrapper and making the local gate wrap each file |
| Recovery strategy | The prior report did not distinguish statement failure, ambiguous connection loss, post-commit application failure, and catastrophic restore. | Operational documentation issue | Resolved by this runbook; backup/PITR verification remains a required execution-time precondition |

Conditional production recommendation: **YES**, after the read-only baseline
artifacts are captured, reviewed, and checksummed and every pre-deployment gate
below passes. Until that preflight is completed, do not run `db push`.

## 1. Production schema baseline root cause

### What “repository lacks a complete production schema baseline” means

Production was intentionally left unchanged, but it was not left
uninspected. Read-only catalog inspection was performed. The concern is that
the inspected definitions were never saved as a complete executable,
versioned schema baseline.

Current production has 13 public tables, two public views, six public
functions, one public enum, one application trigger, 17 RLS policies, grants,
default privileges, indexes, constraints, and one Storage bucket configuration.
The repository's historical migration chain contains only the Resend delivery
migration. That migration depends on `public.orders`, proving that it cannot
recreate the database from an empty hosted Supabase project.

The remote migration ledger contains exactly:

| Version | Name | Result |
| --- | --- | --- |
| `20260721143337` | `resend_email_delivery_tracking` | Its normalized SQL SHA-256 is `2679bc10999c331892f71b34a4ee90185f65aaebd87f5ed3d3995993ccce5e1d`, an exact match to the corresponding repository SQL |

The local file had been named `20260721000000_resend_email_delivery_tracking.sql`.
That was migration-version drift, not object-definition drift. It has been
renamed locally to
`20260721143337_resend_email_delivery_tracking.sql` without changing its SQL.

### Complete discrepancy table

“Not represented” means there is no executable DDL in the ordered
`supabase/migrations` chain that creates the current production object from an
empty hosted Supabase database.

| Production object or metadata | Production evidence | Repository representation | Classification |
| --- | --- | --- | --- |
| `public.orders` | 109 columns, 276 rows, 424 kB total; enum/FKs/checks/indexes/RLS/policies | Only seven Resend columns are in the historical migration; several later columns are in disconnected `docs/*.sql`; foundational DDL and most columns are absent | Actual blocker for clean rebuild; documentation/migration issue for forward deploy |
| `public.addresses` | 12 columns, PK, `auth.users` FK, two non-PK indexes, RLS/policy | No migration | Migration issue |
| `public.federal_holidays` | 3 columns, PK/unique, RLS/policy | No migration | Migration issue |
| `public.order_events` | 8 columns, PK/FK/index, RLS/policy | No migration | Migration issue |
| `public.order_items` | 8 columns, PK/FK/unique/checks, RLS/policy | No legacy migration; Commerce v2 defines a different table in another schema | Migration issue |
| `public.patients` | 9 columns including generated `full_name`, PK/FK/indexes, RLS/policies | No migration | Migration issue |
| `public.user_patients` | 4 columns, composite PK/two FKs/index, RLS/policy | No migration | Migration issue |
| `public.profiles` | 4 columns, PK/FK/index, RLS/policy | No migration | Migration issue |
| `public.product_interest` | 5 columns, PK/unique, RLS/three policies | No migration | Migration issue |
| `public.resolver_audits` | 7 columns, PK, RLS/two policies | No migration | Migration issue |
| `public.site_reminders` | 5 columns, PK/unique, RLS/four policies | No migration | Migration issue |
| `public.order_email_deliveries` | 12 columns, PK/FK/index/RLS/grants | Exact historical migration | No discrepancy |
| `public.resend_webhook_events` | 6 columns, PK/FK/index/RLS/grants | Exact historical migration | No discrepancy |
| `public.admin_orders` | Creator-permission view owned by `postgres`; dropped by remediation | Definition absent from migrations; exact current definition recovered by read-only inspection | Documentation/migration issue; removal is intentional |
| `public.admin_orders_view` | Creator-permission view owned by `postgres`; dropped by remediation | Definition absent from migrations; exact current definition recovered by read-only inspection | Documentation/migration issue; removal is intentional |
| `public.order_status` | Labels: `draft`, `pending`, `verified`, `rejected`, `cancelled`, `fulfilled`, `returned`, `authorized`, `captured` | No migration | Migration issue |
| `public.calculate_passive_deadline(timestamptz,text,integer)` | Present, owner `postgres`, `search_path=public` | No migration | Migration issue |
| `public.generate_federal_holidays(integer,integer)` | Present, owner `postgres`, `search_path=public` | No migration | Migration issue |
| `public.insert_holiday(date,text)` | Present, owner `postgres`, `search_path=public` | No migration | Migration issue |
| `public.update_updated_at()` | Present, owner `postgres`, `search_path=public` | No migration | Migration issue |
| `public.record_transactional_email_send(...)` | Present, owner `postgres`, security invoker, empty search path | Exact historical migration | No discrepancy |
| `public.apply_resend_delivery_event(...)` | Present, owner `postgres`, security invoker, empty search path | Exact historical migration | No discrepancy |
| `public.orders_updated_at` trigger | `BEFORE UPDATE` on `public.orders`, calls `update_updated_at()` | No migration | Migration issue |
| 17 legacy RLS policies | Present across `orders`, `order_items`, `order_events`, `patients`, `user_patients`, `profiles`, `addresses`, `product_interest`, `resolver_audits`, `federal_holidays`, and `site_reminders` | No migrations | Migration issue |
| Existing relation/function grants and `postgres` default ACLs | Present; remediation intentionally replaces the application-facing grants/defaults | Historical provenance absent | Documentation issue; remediation result is covered by hosted/local gates |
| `prescriptions` Storage bucket | Private; current size/MIME limits are null | Bucket row is managed-schema data, not represented by schema migration; remediation updates it | Operational baseline issue |
| Six `docs/*.sql` files | Five describe production fields that are present; `order-recovery.sql` describes a table that is not in production | One-off instructions, not ordered migrations or ledger entries | Migration/operational issue |
| `docs/admin-orders-workflow.sql` | `fulfillment_status` and `archived_at` exist, but `admin_notes`, `needs_review`, `verified`, `passive_verified`, `doctor_confirmed`, and `blocked` do not | The current one-off file does not exactly describe production | Documentation drift |
| Local/remote Resend timestamp | Remote `20260721143337`; formerly local `20260721000000` | Filename corrected to the remote version | Fixed migration-history issue |
| Commerce v2 and security-remediation objects | Absent from production | Pending migrations, intentionally not applied | False alarm; expected pending state |

### Are migrations missing or objects manual?

Yes, the migration history is incomplete. Eleven foundational public tables,
the enum, two views, four legacy functions, the trigger, policies, and their
supporting constraints/indexes cannot be recreated from repository migrations.

The evidence proves those objects were created outside the repository's current
tracked migration chain. It does not prove whether every object was created in
the Dashboard, by a deleted migration history, or from another repository.
The `docs/*.sql` comments explicitly instruct an operator to “run once,” so
those six files are evidence of a manual operational path. They are not an
authoritative baseline.

There is no evidence of definition drift in the only object set that can be
compared exactly: the Resend migration SQL matches production. A full
production-versus-repository drift claim is otherwise impossible until the
schema dump is captured.

### Lowest-risk authoritative baseline procedure

Use an existing read-only direct database credential. Do not use `db pull` for
this gate and do not run `migration repair`. The following operations must be
read-only against production:

1. Pin Supabase CLI `2.109.1`.
2. Run `supabase migration list --db-url <read-only-url>` and save the output.
3. Run `supabase db dump --db-url <read-only-url> --schema public --file
   supabase/baseline/production-public-20260729.sql`.
4. Export read-only catalog metadata for:
   - extensions and versions;
   - enum labels;
   - relation and function owners;
   - columns/defaults/generated expressions;
   - constraints and indexes;
   - view and function definitions;
   - triggers;
   - RLS flags and policy expressions;
   - explicit grants and default ACLs;
   - the `prescriptions` bucket's `public`, `file_size_limit`, and
     `allowed_mime_types` values;
   - `supabase_migrations.schema_migrations`.
5. Produce SHA-256 checksums for every artifact and commit the schema-only dump
   and manifest if repository policy permits. Store any row-level recovery
   export encrypted and outside Git.
6. Restore the schema dump into an empty disposable Supabase project, then
   apply pending migrations in order and run the existing database gate.
7. Keep the dump outside `supabase/migrations`. It is a recovery/rebuild
   baseline, not a pending forward migration, and must never be pushed onto the
   already-populated production database.

Supabase documents that `db dump` excludes managed schemas such as `auth` and
`storage`, and excludes data/custom roles by default. That is why the catalog
and Storage bucket metadata exports are separate. Supabase also documents that
`migration list` compares timestamps only. See the
[CLI reference](https://supabase.com/docs/reference/cli/overview) and
[database migration guide](https://supabase.com/docs/guides/deployment/database-migrations).

## 2. Migration transaction boundary

### Why the hosted warning mattered

The former security migration had `BEGIN` at line 5 and `COMMIT` at its end.
The hosted migration API already wrapped the migration and its history insert.
PostgreSQL therefore emitted:

- `there is already a transaction in progress`;
- `there is no transaction in progress`.

The important risk was not the warning itself. An inner `COMMIT` can commit the
DDL/DML before the executor inserts the migration-history row. If that later
insert fails, the schema is changed but the ledger says the migration was not
applied.

Supabase CLI `2.109.1` explicitly runs all statements in a migration plus the
history insert in one `BEGIN`/`COMMIT` unless the file includes a
pipeline-incompatible statement such as `CREATE INDEX CONCURRENTLY`, `VACUUM`,
`ALTER SYSTEM`, or `CLUSTER`. The implementation is visible in the
[pinned CLI source](https://github.com/supabase/cli/blob/v2.109.1/apps/cli/src/legacy/shared/legacy-migration-apply.ts).

All three repository migrations now have:

| Migration | File-level `BEGIN`/`COMMIT` | Pipeline-incompatible statements |
| --- | ---: | ---: |
| `20260721143337_resend_email_delivery_tracking.sql` | 0 / 0 | 0 |
| `20260729144510_create_commerce_v2_phase1.sql` | 0 / 0 | 0 |
| `20260729160750_security_remediation_least_privilege.sql` | 0 / 0 | 0 |

Result: with CLI `2.109.1`, each file and its history row are one atomic
transaction.

### Split, combine, or reorganize?

Do not split or combine the migrations.

- The Resend migration is already applied and must remain at the exact remote
  version.
- Commerce v2 creates only dormant new schemas/objects. A single transaction
  prevents a half-built model.
- The security migration must remain one transaction because view removal,
  guest-owner conversion, grants, default privileges, Storage restrictions,
  and the private rate-limit function form one security boundary. Splitting
  would create the partially applied security model the gate is intended to
  prevent.

The only required reorganization was removal of the migration's own transaction
wrapper. The local gate now also wraps each file so validation matches the
production CLI boundary.

## 3. Failure and recovery analysis

### Migration 1 — Resend tracking

Production disposition: already applied; the corrected filename causes
`db push` to skip it.

| Failure point | Impact before commit | Locks/dependencies | Recovery |
| --- | --- | --- | --- |
| Add seven email columns to `public.orders` | Entire file rolls back | Brief `ACCESS EXCLUSIVE` on `orders`; depends on existing `orders` | Fix cause and rerun; no manual schema rollback |
| Create delivery/webhook tables, FKs, indexes, RLS | Entire file rolls back | Depends on `orders`; indexes are on new tables | Fix cause and rerun |
| Create/replace two functions | Entire file rolls back | Depends on new tables and `orders` columns | Fix function error and rerun |
| Revoke/grant table/function access | Entire file rolls back | Requires `anon`, `authenticated`, `service_role` | Confirm migration role/roles, then rerun |
| Connection loss after command returns ambiguously | Unknown until checked | None beyond the transaction | Query version `20260721143337` and object checksums; never rerun or repair based on assumption |

Expected production time: zero, because it is already recorded remotely.
Never reverse this migration as part of the pending deployment.

### Migration 2 — Commerce v2 phase 1

| Failure point | Impact before commit | Locks/dependencies | Recovery |
| --- | --- | --- | --- |
| Create `commerce_v2`/`legacy_archive` and schema grants | Entire file rolls back | Catalog locks; requires `service_role` | Correct role/privilege issue and rerun |
| Create 15 tables and constraints | Entire file rolls back | Internal ordering and hosted extensions; no legacy hot-table DDL | Correct failed definition/dependency and rerun |
| Create indexes | Entire file rolls back | Locks only newly created, empty tables; no `CONCURRENTLY` | Correct and rerun |
| Create 12 triggers and helper/RPC functions | Entire file rolls back | Depends on prior tables/functions | Correct failed function/trigger and rerun |
| Create two views | Entire file rolls back | Depends on prior Commerce v2 objects | Correct view dependency and rerun |
| RLS, grants, default privileges | Entire file rolls back | Requires Supabase roles and `postgres` migration owner | Stop if role is not `postgres`; correct environment and rerun |
| Post-commit application failure | Dormant schema remains | Commerce v2 flag remains false | Roll back application only; leave dormant schema in place |

Hosted idle execution completed in seconds. Allow 30 seconds operationally.
This migration does not rewrite legacy data and should not require customer
downtime. If a true reverse is required before any Commerce v2 writes, verify
all 15 tables are empty, drop both schemas in one transaction, and then mark
the migration version reverted. Leaving the dormant schema is safer.

### Migration 3 — least-privilege remediation

Current production evidence relevant to lock planning: `public.orders` has 276
rows, is 424 kB, and 243 rows use the shared guest UUID.

| Failure point | Impact before commit | Locks/dependencies | Recovery |
| --- | --- | --- | --- |
| Revoke and drop `admin_orders` views | Entire file rolls back, including grants | `ACCESS EXCLUSIVE` on views; fails if an undiscovered dependent object exists | Inspect dependency, update baseline/runbook, rerun |
| Drop `orders.user_id` NOT NULL and add `payment_attempt_generation` check/default | Entire file rolls back | `ACCESS EXCLUSIVE` on `orders`; check validation scans the small table | Abort on lock timeout; retry in a quieter window |
| Null shared guest UUID rows | Entire file rolls back | Row updates plus locks already held on `orders` | Fix data/check conflict and rerun; pre-export IDs provide post-commit recovery |
| Create `order_resume_tokens`, index, RLS/grants | Entire file rolls back | Depends on `orders` and Supabase roles | Fix dependency/role and rerun |
| Restrict legacy helpers and all public table/function/sequence privileges | Entire file rolls back | Catalog/ACL locks; depends on exact object/role inventory | Stop if inventory changed; update reviewed allowlist, then rerun |
| Restrict `prescriptions` bucket | Entire file rolls back | Row lock on `storage.buckets`; bucket must exist for one-row verification | Stop if zero or multiple rows updated; do not improvise |
| Replace `postgres` default ACLs | Entire file rolls back | Must execute as `postgres` | Abort if execution role differs |
| Create `security_private` table and rate-limit function | Entire file rolls back | New objects only | Correct and rerun |
| Final grants/history insert | Entire file rolls back with CLI `2.109.1` | Requires `service_role`; history is in same transaction | Correct and rerun |
| Connection loss with unknown commit result | Do not assume rollback | Transaction outcome must be inspected | Query ledger and the postconditions below; escalate only if schema/history disagree |
| Smoke-test failure after commit | Security model remains active | No transaction remains | Prefer forward fix or application rollback; use PITR only for destructive incompatibility |

Expected execution is under 30 seconds after locks are acquired. Set a
five-second lock timeout and a 120-second statement timeout for the migration
session. If a lock is not acquired in five seconds, abort and retry later; do
not wait behind production traffic.

### Recovery modes

| Incident | Preferred response | Downtime |
| --- | --- | --- |
| SQL statement fails before commit | CLI rolls back file and history row automatically; correct cause and retry | None beyond the brief write pause |
| Lock timeout | No migration changes commit; release maintenance mode and reschedule | Usually under one minute |
| Connection drops; commit outcome unknown | Keep writes paused, inspect ledger and exact postconditions, then decide | Minutes |
| Commerce migration commits but app smoke fails | Keep `COMMERCE_V2_ENABLED=false`; roll back app deployment; leave dormant schema | None/minimal |
| Security migration commits but one route is incompatible | Keep writes paused; forward-fix route or roll back app to a version that does not require removed views | Minutes |
| Security migration causes unrecoverable data/permission damage | Restore to the verified pre-migration PITR point/backup; reconcile Stripe events created after that point before reopening | Full restore downtime; duration depends on database size |

Supabase states that restores make the project inaccessible and duration
depends on database size. Verify the actual recovery window before deployment;
see [Database Backups](https://supabase.com/docs/guides/platform/backups).

## 4. Production deployment runbook

This is a runbook, not authorization to deploy.

### Roles

- Incident commander: owns go/no-go and abort decisions.
- Database operator: sole holder of the direct production credential.
- Application operator: controls maintenance mode/application release.
- Stripe verifier: test/read-only checks first; live operations only under the
  separately approved production plan.
- Observer: records timestamps, checksums, commands, results, and decisions.

No person should both execute and silently approve a failed gate.

### T-24 hours to T-1 hour

1. Freeze production DDL and merge activity.
2. Confirm `COMMERCE_V2_ENABLED=false` in every production runtime.
3. Confirm no worker, webhook handler, or cron can write to `commerce_v2`.
4. Confirm the repository commit, dirty-tree status, and migration SHA-256:
   - Resend: `436f288fca137665bbe94040c8282ce5c7bd1575a2774ae1a666162601d56fec`
   - Commerce v2: `e79d7e03c982809f4ee9a5f49fc5e2f68d4c6e7babe11465ca95b3382256194f`
   - Security remediation:
     `6d33638cbc727b8c30b78a11328b091f574856b77845a62ee66b62191d3cb99c`
5. Capture and approve the read-only schema baseline described above.
6. Confirm the remote ledger contains `20260721143337` and does not contain
   `20260729144510` or `20260729160750`.
7. Confirm a successful backup and exact PITR/latest recovery timestamp. Record
   recovery instructions and the person authorized to start a restore.
8. Export, encrypt, and retain:
   - IDs and current `user_id` values for rows with the shared guest UUID;
   - both admin view definitions and ACLs;
   - current policies, grants, and default ACLs;
   - current `prescriptions` bucket settings.
9. Confirm direct connection/session mode, migration role `postgres`, Postgres
   version, project ref, and region. Do not use a transaction pooler for DDL.
10. Confirm Supabase CLI exactly `2.109.1`.
11. Run the temporary local database gate:
    `npm run test:security:database`.
12. Restore the production baseline to a disposable hosted project, apply the
    two pending migrations with CLI `2.109.1`, and verify the exact postconditions.
13. Confirm Stripe mode and account identity. Do not change live Stripe
    products, prices, webhook endpoints, or objects as part of the migration.
14. Prepare application rollback and maintenance-mode controls. The repository
    has no built-in maintenance flag, so the application operator must identify
    the existing platform-level write-drain procedure before go/no-go.

### T-15 minutes

1. Announce the write window.
2. Record baseline health:
   - API error rate and latency;
   - active database sessions/long transactions;
   - checkout and admin queue counts;
   - Stripe authorization/capture/refund reconciliation counts;
   - current order count and shared-guest row count.
3. Reject go if a long transaction touches `public.orders`, if replication or
   database health is degraded, or if the baseline artifacts/checksums are
   missing.
4. Enable maintenance/write drain for checkout, order mutation, admin mutation,
   verification, fulfillment, and webhook processing. Reads may remain live.
5. Wait for in-flight writes to finish. Confirm no long-running transaction.

### Migration execution

Use CLI `2.109.1` and the reviewed direct production connection. Set session
timeouts so lock contention fails closed:

```powershell
$env:PGOPTIONS='-c lock_timeout=5s -c statement_timeout=120s'
supabase.cmd db push --db-url $env:HL_PRODUCTION_DIRECT_DATABASE_URL --dry-run
```

The dry run must list exactly:

1. `20260729144510_create_commerce_v2_phase1.sql`
2. `20260729160750_security_remediation_least_privilege.sql`

It must not list the Resend migration. If it lists anything else, abort.

Execute:

```powershell
supabase.cmd db push --db-url $env:HL_PRODUCTION_DIRECT_DATABASE_URL
```

`db push` applies pending files in timestamp order and records each file after
successful application. Do not use `--include-all`, `db reset`, `db pull`, or
`migration repair` during this deployment.

Expected timeline and locks:

| Migration | Expected | Lock expectation | Verification before continuing |
| --- | ---: | --- | --- |
| Commerce v2 | <30 s | Catalog/new-object locks only | Version present; 15 tables/2 views; all tables RLS; views security-invoker; anon/auth no usage or DML; service role access |
| Security remediation | <30 s after lock acquisition | Brief `ACCESS EXCLUSIVE` on `orders` and two views; row update on shared guest orders; ACL catalogs; one Storage bucket row | Version present; views absent; guest UUID count zero; new column/table/function present; bucket limits exact; grants/default ACLs exact |

Because CLI applies both pending files in one invocation, the operator must
record the completion/result of each version from the CLI output and then
verify both ledger rows. If Commerce v2 commits and security fails, Commerce v2
may remain as a dormant schema; keep the flag false, fix the security failure,
and rerun.

### Database verification

All must pass before writes resume:

- migration versions are exactly the historical Resend version plus the two
  pending versions;
- `public.admin_orders` and `public.admin_orders_view` are absent;
- no row retains shared UUID
  `11111111-1111-4111-8111-111111111111`;
- `orders.user_id` is nullable;
- `orders.payment_attempt_generation` exists, is non-null, and all values are
  positive;
- `public.order_resume_tokens` exists, has RLS, and anon/auth have no DML;
- all 14 listed public application tables have RLS and no anon/auth DML;
- `service_role` has required public DML;
- anon/auth cannot execute any public application function;
- `service_role` can execute required functions;
- `consume_rate_limit` is security-definer with an empty search path;
- future tables/functions created by `postgres` do not inherit anon/auth
  access and do inherit the reviewed service-role access;
- `prescriptions` is private, 10 MiB, JPEG/PNG only;
- `commerce_v2` has 15 tables and two security-invoker views;
- all Commerce v2 tables have RLS; anon/auth have no schema usage/DML/RPC;
- `COMMERCE_V2_ENABLED` remains false.

### Application and Stripe smoke tests

Run with dedicated smoke-test records and Stripe test mode where payment
mutation is involved. Do not make an unapproved live financial mutation.

| Flow | Success condition |
| --- | --- |
| Checkout | Existing production-compatible checkout creates/updates the legacy order only; Commerce v2 remains empty |
| Authorization | Test-mode PaymentIntent authorizes once; order amount/state match |
| Capture | Test-mode capture succeeds once; retry is idempotent |
| Refund | Test-mode refund succeeds once; retry is idempotent |
| Order lookup | Owner succeeds; anonymous/cross-account access is denied |
| Admin dashboard | Authorized admin can list and inspect; customer/anonymous cannot |
| Verification | Authorized workflow advances expected legacy state and records audit history |
| Fulfillment | Authorized admin transition succeeds and records audit history |
| Receipt | Owner/admin can retrieve; anonymous/cross-account access is denied |
| Internal feed | Unsigned request denied; correctly signed request accepted |

If the release uses live Stripe credentials, verification at this gate is
read-only: confirm account ID, webhook configuration, livemode separation, and
that no unexpected event backlog exists. Do not capture/refund/cancel a live
payment solely as a smoke test.

### Reopen

1. Deploy/activate only the production-compatible application release.
2. Keep `COMMERCE_V2_ENABLED=false`.
3. Resume webhook processing first and verify no authorization errors.
4. Resume admin/fulfillment writes.
5. Resume checkout writes last.
6. Record the reopen timestamp and all smoke-test identifiers.

## 5. Rollback and forward recovery

### Preferred rollback order

1. Stop writes and webhook consumers.
2. Set/confirm `COMMERCE_V2_ENABLED=false`.
3. Determine whether the failing migration committed by checking the ledger
   and object postconditions.
4. If only application smoke tests failed, roll back the application release;
   do not reverse the database automatically.
5. If Commerce v2 committed but is unused, leave it dormant.
6. If security remediation committed, prefer a reviewed forward fix.
7. Use full PITR/backup restore only for confirmed destructive
   incompatibility/data loss. After restore, reconcile all Stripe events and
   database writes that occurred after the recovery point before reopening.

### Optional Commerce v2 reverse SQL

Use only if the feature was never enabled and every Commerce v2 table is empty:

```sql
begin;

do $$
declare
  populated_tables integer;
begin
  select count(*) into populated_tables
  from pg_stat_user_tables
  where schemaname = 'commerce_v2'
    and n_live_tup > 0;

  if populated_tables > 0 then
    raise exception 'commerce_v2 contains data; reverse aborted';
  end if;
end
$$;

drop schema if exists commerce_v2 cascade;
drop schema if exists legacy_archive cascade;

commit;
```

After independent schema verification, a separately approved operator may mark
`20260729144510` reverted. `migration repair` changes only migration history;
it does not reverse SQL. Never run it before verifying the schema state.

### Security reverse SQL

There is intentionally no generic down migration. A blind reverse would
restore the anonymous admin-view exposure and shared guest ownership model.
If a reverse is formally approved while writes are stopped, generate exact SQL
from the preflight artifacts to:

1. restore the 243 captured order IDs to their captured `user_id` values only
   where `user_id is null`;
2. verify no null remains before restoring `orders.user_id NOT NULL`;
3. restore both view definitions and their exact pre-change ACLs;
4. restore exact pre-change grants, policies, and `postgres` default ACLs;
5. restore exact pre-change Storage bucket values;
6. drop `consume_rate_limit`, `security_private`, and
   `order_resume_tokens` only if their tables contain no post-migration data;
7. drop `payment_attempt_generation` only after proving no deployed code
   depends on it.

Execute the generated statements in one transaction. If any prerequisite
fails, roll back and use forward recovery or PITR. Do not use a partial
permission rollback.

### Data-integrity verification after any recovery

- migration ledger matches the actual object state;
- no orphan FKs or invalid constraints/indexes;
- order, payment-intent, capture, refund, and fulfillment counts reconcile;
- no duplicate Stripe event or operation idempotency keys;
- no order has an impossible payment/fulfillment state;
- owner/cross-account/admin authorization matrix passes;
- Storage prescription access and limits are correct;
- audit events exist for every administrative mutation;
- Commerce v2 remains disabled.

## 6. Monitoring and objective criteria

### First hour

At 0, 5, 15, 30, and 60 minutes review:

- database CPU, connections, lock waits, deadlocks, replication/restarts;
- 5xx/401/403 rates by checkout, order, admin, receipt, verification,
  fulfillment, internal, and webhook routes;
- checkout success and PaymentIntent authorization/capture failures;
- webhook signature, duplicate, delayed, and projection errors;
- rate-limit errors and `security_private` growth;
- order count, shared guest UUID count, null-owner distribution;
- failed audit-event writes;
- Storage upload rejections by size/MIME;
- Commerce v2 row counts, which must remain zero while disabled.

### First day

At 2, 4, 8, 12, and 24 hours:

- repeat first-hour checks at lower frequency;
- reconcile Stripe events/PaymentIntents/refunds to legacy order state;
- inspect admin integrity/system-health dashboard;
- sample owner, cross-account, admin, receipt, verification, and fulfillment
  paths;
- confirm no direct anon/auth database grants reappeared;
- confirm no migration, Dashboard DDL, or default-privilege drift;
- record and classify every alert.

### Abort criteria

Stop before migration if any of these is true:

- production baseline or checksum manifest is missing/unapproved;
- backup/PITR recovery point is missing or unverified;
- CLI is not `2.109.1`;
- execution role is not `postgres`;
- dry run lists anything other than the two expected pending migrations;
- Commerce v2 is enabled anywhere;
- long transactions or unhealthy database metrics make lock acquisition unsafe;
- production schema/ledger differs from the reviewed inventory.

Stop/roll back during or after migration if any of these is true:

- a migration/history row outcome is ambiguous;
- lock wait exceeds five seconds;
- any migration fails;
- any protected object grants anon/auth access;
- a required service route loses access;
- shared guest UUID count is nonzero after remediation;
- bucket restrictions are not exact;
- cross-account or privilege-escalation smoke test succeeds;
- payment state diverges from Stripe or idempotency fails;
- error rate exceeds the pre-declared incident threshold for two consecutive
  five-minute windows;
- unexpected Commerce v2 writes occur.

### Success criteria

Production may remain live only when:

- baseline artifacts and checksums are approved;
- both pending migration versions and exact postconditions pass;
- Commerce v2 remains disabled and empty;
- all authorization/payment/operational smoke tests pass;
- no migration, lock, database health, or elevated error alert remains open;
- Stripe reconciliation is exact for all deployment-window events;
- first-hour monitoring completes without an abort condition;
- the incident commander records an explicit success decision.

## 7. Required fixes and documentation

Completed locally:

1. Renamed the Resend migration to match the exact production ledger version.
2. Removed explicit `BEGIN`/`COMMIT` from the security migration.
3. Changed the local database gate to wrap every migration file in its own
   transaction.
4. Re-ran the local database gate successfully on PostgreSQL 17.6. It applied
   all three files atomically and all existing least-privilege assertions
   passed.
5. Added this baseline, failure, recovery, and deployment runbook.

Required before execution:

1. Capture and approve the read-only production schema/catalog baseline.
2. Verify a restorable backup/PITR point.
3. Repeat the exact-baseline disposable hosted rehearsal after the dump exists.
4. Identify the platform-level production write-drain procedure.
5. Record named operators, thresholds, timestamps, commands, and checksums in
   the deployment log.

No additional broad architecture audit is recommended. The remaining work is
operational evidence collection, not feature or model redesign.
