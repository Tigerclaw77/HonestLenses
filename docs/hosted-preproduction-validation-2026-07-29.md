# Honest Lenses hosted pre-production validation gate

> **Historical evidence only.** Do not execute commands from this report.
> The authoritative release procedure is
> [`docs/production-deployment/README.md`](production-deployment/README.md).

Date: 2026-07-29
Scope: disposable hosted Supabase production rehearsal
Result: **Completed with material limitations**
Production recommendation: **NO-GO**

## Executive result

The least-privilege remediation behaved correctly in a real hosted Supabase
project. Hosted Auth, PostgREST, RLS, grants, protected RPCs, admin
authorization, audit history, Storage bucket restrictions, failed-migration
atomicity, Commerce v2 append-only controls, and Stripe test-mode behavior all
produced the expected results.

This is still not sufficient to recommend production:

1. The repository does not contain a complete historical production schema.
   The rehearsal therefore used a documented synthetic legacy baseline plus
   application-compatibility columns, not an exact production schema clone.
2. The security migration contains its own `begin`/`commit` while the hosted
   migration executor also wraps migrations. PostgreSQL logged nested
   transaction warnings. The migration succeeded, but the exact production
   executor and transaction boundary must be reviewed.
3. There is no down migration for the destructive security changes. A failed
   statement is atomic, but restoring the removed views and prior guest-owner
   data requires a backup or an explicitly reviewed forward recovery.
4. Stripe test mode passed in isolation, but no hosted public application was
   deployed, so end-to-end Stripe webhook-to-hosted-database convergence was
   not exercised.
5. Browser-backed anonymous behavior was observed, but a persistent stale
   browser session prevented clean customer/admin cookie scenarios. Equivalent
   real hosted Auth bearer-token tests passed at the HTTP/API layer.

Production and live Stripe were not accessed or modified. Commerce v2 stayed
disabled. No deployment occurred.

## 1. Hosted validation environment

- Project: `Honest Lenses Preprod Security Rehearsal 20260729`
- Disposable project ref: `heliobdbygrchesgedja`
- Region: `us-east-1`
- Project status during validation: `ACTIVE_HEALTHY`
- PostgreSQL management version: `17.6.1.147`
- PostgreSQL server: `17.6`, 64-bit Linux, GCC 15.2.0
- Release channel: `ga`
- Supabase platform version: no single version identifier was exposed by the
  project-management or SQL interfaces
- Security Advisor version: not exposed; the current hosted database linter was
  run after final privilege cleanup
- Project cost: `$0/month`

Installed extensions:

| Extension | Version | Schema |
| --- | --- | --- |
| `pg_stat_statements` | 1.11 | `extensions` |
| `pgcrypto` | 1.3 | `extensions` |
| `plpgsql` | 1.0 | `pg_catalog` |
| `supabase_vault` | 0.3.1 | `vault` |
| `uuid-ossp` | 1.1 | `extensions` |

Role checks:

- `anon` and `authenticated` do not have `BYPASSRLS`.
- Neither `anon` nor `authenticated` is a member of `service_role`.
- `service_role` has `BYPASSRLS`, as expected for server-only access.
- Migration-created application objects were owned by `postgres`.

## 2. Migration execution log

The three repository migrations were applied unchanged and in timestamp order.
Validation-only migrations are clearly labeled and must never be deployed.

| Hosted version | Migration | Classification | Result |
| --- | --- | --- | --- |
| 20260729205125 | `validation_hosted_legacy_baseline` | synthetic hosted fixture | pass |
| 20260729205200 | `resend_email_delivery_tracking` | repository migration `20260721000000` | pass |
| 20260729205217 | `create_commerce_v2_phase1` | repository migration `20260729144510` | pass |
| 20260729205223 | `security_remediation_least_privilege` | repository migration `20260729160750` | pass with nested-transaction warnings |
| 20260729205558 | `validation_application_compatibility_fixture` | validation-only fixture | pass |
| 20260729205657 | `validation_order_event_audit_compatibility` | validation-only fixture | pass |
| 20260729210042 | `validation_temporarily_expose_orders_for_rls_probe` | temporary RLS probe grant | pass |
| 20260729210144 | `validation_remove_temporary_orders_grants` | grant cleanup | pass |
| 20260729210250 | `validation_armory_application_compatibility` | validation-only fixture | pass |
| 20260729210257 | `validation_temporarily_expose_orders_for_rls_probe_retry` | temporary RLS probe grant | pass |
| 20260729210328 | `validation_remove_temporary_orders_grants_retry` | grant cleanup | pass |
| 20260729210341 | `validation_temporarily_expose_orders_for_rls_probe_final` | temporary RLS probe grant | pass |
| 20260729210409 | `validation_remove_temporary_orders_grants_final` | final grant cleanup | pass |
| 20260729210527 | `validation_commerce_v2_admin_audit_probe` | validation-only audit data | pass |
| 20260729210603 | `validation_default_privilege_probe_create` | validation-only privilege probe | pass |
| 20260729210621 | `validation_default_privilege_probe_cleanup` | probe cleanup | pass |

An intentional halfway-failure migration was rejected and was not written to
migration history.

Migration observations:

- No dependency, ownership, constraint, index, trigger, view, grant, or RLS
  creation failure occurred.
- The first orchestration command initially stopped after one successful
  migration because the caller misread the nested success response. It did not
  cause a database failure or partial migration.
- Hosted execution took seconds per migration in an idle disposable database.
  This does not prove production lock duration under load.
- PostgreSQL logged `there is already a transaction in progress` and `there is
  no transaction in progress` around the security migration's explicit
  transaction statements. This requires migration-executor review.
- No direct data loss occurred in the fixture. The remediation intentionally
  drops two exposed views and nulls the known shared guest owner UUID; recovery
  of the original values is not possible from the migration alone.

## 3. Schema, ownership, grants, and RLS

- Commerce v2: 15/15 tables have RLS enabled.
- Public application fixture: 14/14 tables have RLS enabled.
- `security_private.rate_limit_buckets` has RLS enabled.
- All tested application tables, functions, and views are owned by `postgres`.
- Commerce v2 views use `security_invoker = true`.
- Public anonymous admin views are absent.
- `anon` and `authenticated` have no final direct DML privilege on protected
  application tables.
- `anon` and `authenticated` have no execute privilege on protected RPCs.
- `service_role` retains required table and RPC access.
- Final `public.orders` privileges:
  - `anon SELECT`: false
  - `authenticated SELECT`: false
  - `authenticated UPDATE`: false
  - `service_role SELECT`: true
- A new table and function created by the migration role inherited no anonymous
  or authenticated access and did inherit `service_role` access.
- Supabase-managed `supabase_admin` default ACLs still include Data API roles,
  but the migration role is `postgres`; the explicit probe confirmed the
  remediation's `postgres` defaults take effect. Production must use the same
  migration role.
- The prescriptions bucket is private, limited to 10 MiB, and restricted to
  JPEG and PNG.
- The shared guest-owner row was converted to `user_id = NULL`.

The full hosted catalog inventory confirmed the expected primary keys, unique
constraints, foreign keys, checks, operational indexes, 12 Commerce v2
triggers, two owner policies on `public.orders`, and pinned empty function
search paths.

## 4. Security Advisor results

The final hosted Security Advisor run returned no `WARN` or `ERROR` security
finding.

It returned 29 `INFO` instances of `rls_enabled_no_policy`:

- 15 Commerce v2 server-only tables
- 13 public server-only tables
- 1 private rate-limit table

Classification: **acceptable risk, not a false positive**.

The Advisor is correct that these tables have RLS without policies. That is the
intentional deny-by-default model: browser roles have no grants, no policies,
and no direct access; server routes use `service_role`. Adding permissive
policies would weaken this design. The only client-owner policies are the two
temporary-probe-tested policies on `public.orders`, while final direct grants
remain revoked.

Advisor reference:
[RLS enabled with no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

The performance Advisor separately reported:

- Five legacy fixture foreign keys without covering indexes: confirmed
  maintainability/performance findings for review.
- Unused indexes in the fresh project: insufficient observation and expected
  in a new rehearsal database, not evidence that the indexes should be removed.

Performance references:
[unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) and
[unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## 5. Hosted RLS and authorization results

Real hosted Auth users and sessions were created for customer A, customer B,
and an app-metadata admin. All users were deleted after each run.

| Scenario | Result |
| --- | --- |
| Anonymous read of protected orders | denied |
| Anonymous protected RPC | denied |
| Anonymous removed admin view | denied/not found |
| Anonymous protected email table | denied |
| Customer A list | only customer A order returned |
| Customer A read customer B UUID | zero rows |
| Customer A forged UUID | zero rows |
| Customer A update own row | one row |
| Customer A update customer B row | zero rows |
| Customer A reassign owner to customer B | RLS denied |
| Authenticated protected rate-limit RPC | denied |
| Service rate-limit RPC | allowed |
| Role membership/BYPASSRLS escalation | denied |

The owner-policy test required a temporary validation-only `SELECT, UPDATE`
grant to `authenticated` so hosted PostgREST could reach RLS. That grant was
revoked after every attempt. Final catalog checks prove it is absent.

Hosted application authorization results:

| Request | Expected | Actual |
| --- | ---: | ---: |
| anonymous order API | 401 | 401 |
| owner order API | 200 | 200 |
| cross-account order API | 403 | 403 |
| forged order API | 404 | 404 |
| expired/invalid bearer | 401 | 401 |
| owner receipt | 200 HTML | 200 HTML |
| cross-account receipt | 404 | 404 |
| owner prescription mutation | remain pending | 200, remained pending |
| cross-account prescription | 403 | 403 |
| customer admin API | 403 | 403 |
| admin orders API | 200 | 200 |
| admin fulfillment override | 200 plus audit | 200 plus audit |
| unsigned internal Armory request | 401 | 401 |
| valid signed internal Armory request | 200 | 200 |

Admin override history was present in `public.order_events`. A Commerce v2
admin override also produced exactly one immutable adjustment and one
`admin_override` event.

## 6. Browser validation

The final repository-wrapper attempt started reliably on loopback and loaded
the candidate application against the disposable hosted project.

Observed:

- Home page: 200 and visually/semantically rendered.
- A pre-existing stale browser session showed a signed-in shell.
- Direct `/admin/orders` with that non-admin/stale state redirected to `/cart`;
  no admin dashboard data rendered.
- Direct customer order URL without a valid hosted owner context rendered 404.
- The browser client blocked direct receipt navigation with
  `net::ERR_BLOCKED_BY_CLIENT`; the same receipt authorization paths passed
  through hosted-backed HTTP requests.
- The UI logout control did not clear the persistent stale session reliably.

Clean customer/admin browser-cookie validation is therefore **incomplete**.
No more launcher/session work was attempted, per instruction. Real hosted Auth
sessions and all equivalent authorization paths were validated through HTTP/API
requests as listed above.

## 7. Stripe test-mode validation

The dedicated Stripe gate passed with `livemode = false` for every returned
Stripe object:

- generic decline
- expired card
- idempotent PaymentIntent create
- changed-parameter idempotency rejection
- over-capture rejection
- capture retry idempotency
- over-refund rejection
- refund retry idempotency
- cancellation retry idempotency
- simulated temporary connection failure with unchanged state
- valid webhook signature accepted
- tampered webhook signature rejected
- stale webhook signature rejected
- reconciliation to `partially_refunded`

The successful test capture was 1,099 cents and the idempotent test refund was
100 cents.

Limitations:

- No live Stripe key or object was used.
- No application was deployed, so Stripe could not deliver real remote webhook
  retries to a hosted public endpoint.
- The Stripe gate and hosted database gate both passed, but end-to-end hosted
  webhook-to-database convergence remains unproven.
- Duplicate, delayed, and out-of-order database projection behavior remains
  covered by the repository's Commerce v2 tests and schema/RPC checks, not by a
  live remote hosted webhook delivery.

## 8. Commerce compatibility and operational regression

Commerce v2 stayed disabled.

Hosted-backed results passed for:

- order lookup
- receipt access
- prescription authorization and mutation resistance
- admin order dashboard API
- fulfillment override
- admin audit history
- signed internal operational feed

Repository regression:

- `npm test`: pass, including authentication, upload validation, cart,
  shipping, email delivery, internal auth, admin workflow, operational queue,
  customer order access, production integrity, Commerce v2 lifecycle, and
  schema contract matrices
- `npm run build`: pass; TypeScript, 154 static pages, and all dynamic routes
  compiled

Not fully proven in hosted browser form:

- end-to-end checkout with hosted database state
- clean customer/admin cookies
- real remote webhook delivery
- full verification email workflow
- vendor fulfillment integration

## 9. Rollback rehearsal

An intentional migration executed:

1. create a probe schema;
2. create a table inside it;
3. divide by zero.

The hosted executor rejected the migration. Follow-up checks confirmed:

- probe schema absent
- probe table absent
- failed migration history row absent
- anonymous order privilege still absent
- authenticated order privilege still absent

This proves statement-failure atomicity for the hosted executor.

It does **not** prove a complete business rollback of the security migration.
There is no down migration, and the migration removes views and rewrites the
shared guest owner. The production recovery model must therefore be one of:

1. restore from a verified pre-migration backup/PITR point; or
2. use a reviewed forward-recovery migration with captured pre-change data.

Do not improvise a partial privilege rollback during an incident.

## 10. Remaining risks

1. Exact production-shaped schema compatibility is unproven.
2. The production migration executor and nested transaction boundaries are
   unreviewed.
3. A complete security-migration reverse path is absent.
4. Hosted browser customer/admin cookie flows are incomplete.
5. End-to-end hosted Stripe webhook convergence is incomplete.
6. Production lock duration under live workload is unknown.
7. Five legacy foreign keys need an index review.
8. The production execution role must be confirmed as `postgres`.
9. Commerce v2's paused worker/idempotency design decisions remain outside this
   gate and unresolved.

## 11. Remaining founder decisions

1. Authorize and provide an exact schema-only production baseline or a
   production-derived empty-data branch for one final rehearsal.
2. Choose and approve the production recovery strategy: PITR/backup restore or
   reviewed forward recovery.
3. Require a migration review that confirms the executor, role, transaction
   boundary, lock plan, and migration-history behavior.
4. Decide whether the 29 deny-by-default Advisor `INFO` findings are formally
   accepted as policy.
5. Schedule a clean-profile browser session for customer/admin cookies.
6. Schedule a public test deployment only after the above decisions, so Stripe
   test webhooks can be delivered and reconciled end to end.

## 12. Final grades

| Area | Grade | Basis |
| --- | --- | --- |
| Security | B+ | Hosted least privilege passed; exact production baseline absent |
| Authentication | B | Hosted Auth sessions passed; clean browser cookies incomplete |
| Authorization | A- | Hosted RLS/API cross-account and admin tests passed |
| Database | B- | Schema controls passed; exact baseline and reverse migration absent |
| API | B+ | Hosted-backed authorization matrix passed |
| Commerce v2 | C | Disabled as required; core model passes, operational blockers remain |
| Operational readiness | C | Build/tests pass; rollback, locks, browser, and webhook rehearsal incomplete |

## 13. Production recommendation

**NO-GO**

The hosted project confirms the local least-privilege findings, but the gate
does not establish exact production-schema behavior, a safe full rollback, or
end-to-end hosted Stripe webhook convergence. A deployment runbook is
intentionally not produced because production is not recommended.

Required before reconsidering production:

1. Rehearse against an exact approved schema baseline.
2. Review transaction boundaries and the production migration role.
3. Approve and rehearse backup/PITR or forward recovery.
4. Complete clean-profile customer/admin browser validation.
5. Complete a public test deployment's Stripe test-webhook convergence.

## 14. Cleanup

- Temporary Auth users: deleted after each run.
- Temporary RLS grants: revoked after each run and re-verified absent.
- Temporary default-privilege objects: dropped.
- Intentional rollback objects: transactionally absent.
- Local validation browser tab: closed.
- Local validation server: terminated.
- Local PID/log files: removed.
- Temporary local Supabase link metadata: removed.
- Disposable Supabase project: permanently deleted; the subsequent project
  inventory confirmed ref `heliobdbygrchesgedja` is absent.
