# Final migration package

Pinned executor: Supabase CLI `2.109.1`
Migration role: `postgres`
Commerce v2 flag: `false`

## Inventory

Exactly three migration files exist. No obsolete migration remains.

| Order | Migration | Purpose | Production action |
| ---: | --- | --- | --- |
| 1 | `20260721143337_resend_email_delivery_tracking.sql` | Existing email delivery tables, fields, functions, RLS, and grants | Already applied; must be skipped |
| 2 | `20260729144510_create_commerce_v2_phase1.sql` | Create dormant Commerce v2 schemas, 15 tables, functions, triggers, views, RLS, and least-privilege grants | Pending |
| 3 | `20260729160750_security_remediation_least_privilege.sql` | Remove exposed admin views/shared guest ownership; restrict grants/default ACLs/Storage; add secure recovery and rate limiting | Pending |

The historical Resend filename now exactly matches remote migration history.
All three SQL files have no file-level `BEGIN`/`COMMIT` and contain no
`CONCURRENTLY`, `VACUUM`, `ALTER SYSTEM`, or `CLUSTER` statement.

Supabase CLI `2.109.1` therefore applies each file and its migration-history
row in one transaction.

## File 1 — historical Resend migration

- SHA-256:
  `436f288fca137665bbe94040c8282ce5c7bd1575a2774ae1a666162601d56fec`
- Expected runtime during this deployment: zero; skipped.
- Dependencies: existing `public.orders`, `service_role`, `pgcrypto`/UUID
  facilities supplied by hosted Supabase.
- Lock implication if unexpectedly listed: it would request an exclusive
  schema lock on `orders`; this is an immediate abort condition.
- Rollback implication: do not reverse; it is existing production state.
- Verification:
  - local/remote version `20260721143337` matches;
  - canonical SQL SHA-256 assertion passes;
  - dry run does not list it.

## File 2 — Commerce v2 phase 1

- SHA-256:
  `e79d7e03c982809f4ee9a5f49fc5e2f68d4c6e7babe11465ca95b3382256194f`
- Expected runtime: under 30 seconds based on hosted idle rehearsal.
- Locks: catalog locks and locks on new, empty Commerce v2 objects only; no
  rewrite or lock on the legacy `public.orders` table.
- Dependencies:
  - hosted Supabase roles including `service_role`;
  - `auth.users`;
  - standard hosted UUID/crypto capabilities;
  - migration owner `postgres`.
- Ordering: must precede the security migration so the final privilege/default
  state is evaluated after all Commerce objects exist.
- Rollback:
  - statement failure rolls back the file and history row;
  - after commit, leave the schema dormant with
    `COMMERCE_V2_ENABLED=false`;
  - drop schemas only if every Commerce v2 table is proven empty and a reverse
    is explicitly approved.
- Verification:
  - version `20260729144510` is present;
  - schemas `commerce_v2` and `legacy_archive` exist and owner is `postgres`;
  - exactly 15 Commerce v2 tables and two views exist;
  - all tables have RLS;
  - views have `security_invoker=true`;
  - anon/auth have no schema usage, table DML, or function execute;
  - service role retains reviewed access;
  - all Commerce v2 tables remain empty.

## File 3 — least-privilege remediation

- SHA-256:
  `6d33638cbc727b8c30b78a11328b091f574856b77845a62ee66b62191d3cb99c`
- Expected runtime: under 30 seconds after locks are acquired.
- Locks:
  - `ACCESS EXCLUSIVE` on the two admin views;
  - brief `ACCESS EXCLUSIVE` on `public.orders` for nullability/column change
    and check validation;
  - row locks for shared guest order conversion;
  - catalog/ACL locks for grants/default privileges;
  - one row lock on `storage.buckets`.
- Dependencies:
  - exact pre-migration public object inventory;
  - migration owner `postgres`;
  - Supabase `anon`, `authenticated`, and `service_role`;
  - `public.orders` and `storage.buckets.id='prescriptions'`;
  - completed confidential rollback-row export.
- Ordering: last, because it establishes the final least-privilege boundary.
- Rollback:
  - statement failure is atomic;
  - post-commit reverse is not automatic because it would restore the
    confirmed insecure admin views/shared guest model;
  - prefer application rollback/forward database fix;
  - use verified PITR for destructive incompatibility.
- Verification:
  - version `20260729160750` is present;
  - admin views absent;
  - shared guest UUID count zero;
  - `orders.user_id` nullable;
  - `payment_attempt_generation` valid;
  - `order_resume_tokens` exists, RLS enabled, browser roles denied;
  - every reviewed public table has RLS and browser-role DML revoked;
  - protected functions cannot be executed by browser roles;
  - service role access remains;
  - `consume_rate_limit` is security-definer with empty search path and
    service-role-only execute;
  - prescriptions bucket is private, 10 MiB, JPEG/PNG only;
  - `postgres` default ACLs deny browser roles and explicitly support the
    server role.

## Package verification commands

```powershell
Get-ChildItem 'supabase/migrations' -File -Filter '*.sql' |
  Sort-Object Name |
  Select-Object -ExpandProperty Name

Get-ChildItem 'supabase/migrations' -File -Filter '*.sql' |
  Sort-Object Name |
  Get-FileHash -Algorithm SHA256

Select-String -Path 'supabase/migrations/*.sql' `
  -Pattern '(?i)^\s*(begin|commit)\s*;|concurrently|\bvacuum\b|alter\s+system|^\s*cluster\b'
```

Expected:

- exactly the three filenames above;
- exact hashes above;
- the prohibited-statement search returns no match.

## Current rehearsal evidence

- Local PostgreSQL 17.6 database gate: pass after transaction-wrapper removal.
- Disposable hosted Supabase rehearsal: schema/RLS/grants/functions/triggers/
  views/ownership pass.
- Intentional failed hosted migration: fully rolled back with no history row.
- Security Advisor: no `WARN`/`ERROR`; deny-by-default no-policy findings were
  classified acceptable.
