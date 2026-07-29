# Honest Lenses database security gate validation

> **Historical evidence only.** Do not execute commands from this report.
> The authoritative release procedure is
> [`docs/production-deployment/README.md`](production-deployment/README.md).

Date: 2026-07-29
Scope: local working tree and isolated validation systems only
Final recommendation: **Still NO-GO**

## Executive result

The least-privilege migration is valid PostgreSQL and its intended security
model passed an adversarial rehearsal on a disposable PostgreSQL 17.6 cluster.
The previously exposed legacy admin views were readable and updatable before
remediation, then absent and inaccessible after remediation. All known public
and Commerce v2 application tables had RLS enabled. Direct Data API access for
`anon` and `authenticated` was denied, while `service_role` retained the
server-side access the application requires. Function, view, sequence, future
default privilege, append-only, audit, private storage, and rate-limit checks
also passed.

Local browser and HTTP authorization checks passed for the scenarios that the
isolated mock supports. Stripe failure injection passed using an
`sk_test_...` credential only. The full regression suite, ESLint, TypeScript,
and production build passed.

This gate does **not** authorize production work. A Supabase disposable branch
and a standalone disposable project were both rejected by the provider control
plane with `INVALID_ARGUMENT`, and local Docker was unavailable. The database
proof therefore used a faithful synthetic legacy fixture on embedded
PostgreSQL, not an exact hosted clone of the production schema. Hosted
PostgREST/Auth/Storage behavior and the hosted Supabase Security Advisor remain
unverified. Production was never connected, queried, or changed.

The SQL is now technically credible enough for the next rehearsal, but it is
not yet safe to apply to production without an exact-schema hosted clone,
preflight inventory, Advisor review, backup/rollback plan, and an authorized
maintenance window.

## Safety controls observed

- No deployment was performed.
- No production database connection or SQL was used.
- No production Supabase data was read.
- No live Stripe credential was loaded by the Stripe gate.
- All returned Stripe objects asserted `livemode === false`.
- Commerce v2 remained disabled.
- All local PostgreSQL clusters and browser-validation services were stopped.
- All generated PID and launcher log files were removed.
- No Supabase branch or project was created, so there is no external validation
  resource or hourly cost left running.

## 1. Migrations executed

The isolated database runner created Supabase-compatible `anon`,
`authenticated`, and `service_role` roles, applied the synthetic fixture, and
then applied the repository migrations in this order:

| Order | File | SHA-256 |
| --- | --- | --- |
| Fixture | `supabase/validation/0000_legacy_security_fixture.sql` | `95ec7eb846e1d0a518a784fdc0f94d71c6c0dd668086cbdec4198aad957e4abd` |
| 1 | `supabase/migrations/20260721000000_resend_email_delivery_tracking.sql` | `99a747e2dc0155cc48408c1ac3a4bf5be7913eeba2ec73a924a0bac276d6c8ef` |
| 2 | `supabase/migrations/20260729144510_create_commerce_v2_phase1.sql` | `e79d7e03c982809f4ee9a5f49fc5e2f68d4c6e7babe11465ca95b3382256194f` |
| 3 | `supabase/migrations/20260729160750_security_remediation_least_privilege.sql` | `8305f1b093a44aaf4f126a3405630d47135dd1f23e025509f4b8d620ce791b89` |

The fixture is validation-only and contains fabricated `.invalid` identities
and `pi_test_...` references. It must never be deployed.

Before remediation, `anon` could select all three fixture orders through the
admin view and successfully update it. This reproduced the vulnerable privilege
shape without copying production data.

## 2. Permissions verified

### Role model

| Principal | Database identity | Intended access | Result |
| --- | --- | --- | --- |
| Anonymous browser | `anon` | No direct application-table DML or RPC execution | Pass |
| Authenticated customer | `authenticated` | No direct Data API DML; customer access goes through ownership-checked server routes | Pass |
| Application server | `service_role` | Required table DML, sequence access, view reads, and RPC execution | Pass |
| Application admin | Authenticated user with protected admin metadata/allowlist | No independent database role; server checks admin authority, then uses audited server operations | Pass |
| SQL `PUBLIC` | All roles | No inherited function execution or sensitive schema access | Pass |

### Public application tables

The following 14 public tables were individually checked:

`orders`, `order_items`, `order_events`, `patients`, `user_patients`,
`profiles`, `addresses`, `product_interest`, `resolver_audits`,
`federal_holidays`, `site_reminders`, `order_email_deliveries`,
`resend_webhook_events`, and `order_resume_tokens`.

For every table:

| Role | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `anon` | Denied | Denied | Denied | Denied |
| `authenticated` | Denied | Denied | Denied | Denied |
| `service_role` | Allowed | Allowed | Allowed | Allowed |

The server-only choice is intentional. It prevents a second, implicit
PostgREST authorization model from drifting away from the canonical Next.js
ownership checks. The existing owner RLS policies remain defense in depth, but
table grants make direct customer Data API access fail closed.

### Commerce v2 tables

The following 15 tables were individually checked:

`orders`, `order_items`, `payments`, `payment_events`,
`payment_event_inbox`, `payment_operations`,
`prescription_verifications`, `prescription_verification_events`,
`fulfillments`, `fulfillment_events`, `order_adjustments`, `order_events`,
`reconciliation_runs`, `reconciliation_findings`, and `legacy_imports`.

For every table:

| Role | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `anon` | Denied | Denied | Denied | Denied |
| `authenticated` | Denied | Denied | Denied | Denied |
| `service_role` | Allowed | Allowed | Allowed | Allowed |

This proves schema compatibility only. Commerce v2 is still disabled and is not
a cutover candidate.

### Views

| View | Security mode | `anon` | `authenticated` | `service_role` |
| --- | --- | --- | --- | --- |
| `public.admin_orders` | Dropped | No access | No access | Not present |
| `public.admin_orders_view` | Dropped | No access | No access | Not present |
| `commerce_v2.order_operational_projection` | `security_invoker` | No access | No access | SELECT |
| `commerce_v2.system_health_summary` | `security_invoker` | No access | No access | SELECT |

### Functions and RPCs

Seven public functions were inventoried. `anon` and `authenticated` could
execute none; `service_role` could execute all seven. The functions were:

- `calculate_passive_deadline`
- `generate_federal_holidays`
- `insert_holiday`
- `update_updated_at`
- `record_transactional_email_send`
- `apply_resend_delivery_event`
- `consume_rate_limit`

Eight Commerce v2 functions were inventoried. All were `security invoker`, had a
pinned empty `search_path`, were denied to `anon`/`authenticated`, and were
executable by `service_role`:

- `set_updated_at`
- `reject_append_only_mutation`
- `claim_payment_event`
- `finish_payment_event`
- `apply_payment_projection`
- `fail_payment_operation`
- `apply_admin_override`
- the legacy archive mutation guard

All public sequences denied `PUBLIC`, `anon`, and `authenticated`; usage/select
was available to `service_role`.

Future default privileges were also tested by creating new table and function
objects after the migration:

- new public tables: no `anon`/`authenticated` access; `service_role` access;
- new public functions: no `PUBLIC`/`anon`/`authenticated` execute;
  `service_role` execute.

The migration was corrected during this gate because schema-scoped default
function privilege revocation alone did not override PostgreSQL's global
built-in `PUBLIC EXECUTE` default. The final migration includes the required
global default revocation.

## 3. RLS policies and attacks

All 14 public application tables and all 15 Commerce v2 tables reported RLS
enabled. The private rate-limit table also had RLS enabled.

The representative legacy fixture contains these owner policies:

| Policy | Operation | Predicate | Attack result |
| --- | --- | --- | --- |
| `orders_customer_select` | SELECT | `auth.uid() = user_id` | Owner predicate worked; cross-account read failed |
| `orders_customer_update` | UPDATE | `auth.uid() = user_id` for `USING` and `WITH CHECK` | Cross-account update failed |

After the server-only grants were applied, direct `authenticated` order access
was denied even for an owner. This is deliberate defense in depth: authorization
is performed by the application before the service-role query.

Adversarial database checks:

- anonymous order read: denied;
- authenticated direct order read/update: denied;
- cross-account update: denied;
- privilege inheritance from `authenticated` to `service_role`: absent;
- service-role operational read: allowed;
- fixed shared guest owner: cleared to `NULL`;
- Commerce v2 append-only row mutation: rejected with SQLSTATE `55000`;
- admin override: created both an adjustment and an order event;
- private prescription bucket: non-public, 10 MB limit, JPEG/PNG only;
- rate limiter: first two attempts allowed, third denied.

The Commerce v2 schema intentionally has no client policies because it is
server-only. RLS plus revoked client grants creates deny-by-default behavior.

## 4. Security-definer audit

`public.consume_rate_limit` was the only `security definer` function after
remediation. It is necessary so the application can atomically update a private
rate-limit table without exposing that table. It passed these checks:

- owned by the migration owner, not a client role;
- empty, pinned `search_path`;
- fully qualified references;
- no `PUBLIC`, `anon`, or `authenticated` execute;
- execute granted only to `service_role`;
- underlying `security_private` schema/table inaccessible to client roles;
- RLS enabled on the underlying table.

No security-definer views remained. Both Commerce v2 views were
`security_invoker`. No exposed security-definer function or view was found.

## 5. Browser and HTTP authorization validation

### Launcher outcome

The generic standalone browser launcher was unreliable in this Windows sandbox
because its child environment inherited a duplicated/invalid PATH and one CLI
attempt hung. Per instruction, it was not redesigned. The final attempt used
the repository wrapper. That wrapper reliably started the mock Supabase service
and Next.js on loopback, and the supported in-app browser connected
successfully. All services and artifacts were subsequently cleaned up.

### Real browser observations

| Principal | Scenario | Result |
| --- | --- | --- |
| Anonymous | Browse `/` | Storefront rendered with no protected order data |
| Anonymous | Direct `/admin/orders` | Redirected to `/login?next=/admin/orders` |
| Anonymous | Direct known `/order/{id}` | No protected content rendered |

### Browser-equivalent HTTP/API matrix

All identities and records were fabricated locally.

| Scenario | Expected | Actual |
| --- | --- | --- |
| Anonymous GET owner order API | 401 | 401 |
| Customer A GET own order | 200 | 200 |
| Customer A GET customer B order | 403 | 403 |
| Customer B GET customer A order | 403 | 403 |
| Customer A GET forged valid UUID | 404 | 404 |
| Expired/invalid bearer GET order | 401 | 401 |
| Admin token through customer-order endpoint | Denied absent ownership | 403 |
| Anonymous GET admin orders API | 401 | 401 |
| Customer GET admin orders API | 403 | 403 |
| Expired bearer GET admin orders API | 401 | 401 |
| Admin GET admin orders API | 200 | 200 |
| Anonymous GET receipt | Non-enumerating denial | 404 |
| Owner GET receipt | 200 | 200 HTML, private/no-store |
| Cross-account GET receipt | Non-enumerating denial | 404 |
| Customer POST own Rx with forged `verification_status: verified` | Accept evidence but force pending | 200, returned `pending` |
| Customer POST Rx to other account | 403 | 403 |
| Anonymous POST admin verification | 401 | 401 |
| Customer POST admin verification | 403 | 403 |
| Expired bearer POST admin verification | 401 | 401 |
| Customer request for private Rx image URL | 403 | 403 |
| Admin request for private Rx image URL | Passed authorization, mock lacks Storage signing endpoint | 500 mock limitation |

The executable route-policy test also enumerated every current Route Handler and
proved that each handler has exactly one public, authenticated,
customer-owned, admin, internal, webhook, or capability classification.
Unit-level checks covered stale/tampered guest capabilities, unsafe mutation
origins, bearer-versus-cookie precedence, open redirects, and stale/tampered
internal signatures.

Not positively proven in a real hosted browser session:

- complete checkout submission and cancellation;
- Supabase magic-link cookie refresh;
- actual hosted expired-session refresh behavior;
- private Storage signed URL retrieval;
- an end-to-end admin fulfillment/adjustment mutation through hosted
  PostgREST;
- concurrent browser races.

Those are production blockers, not silent passes.

## 6. Stripe test-mode failure injection

The test runner reads only `STRIPE_SECRET_KEY_TEST`, requires an `sk_test_`
prefix, asserts `livemode === false` on returned objects, forces Commerce v2
off, and never falls back to the repository's default Stripe key.

Test run ID: `c529b8dc-51b4-45c3-8d5c-524600413bb8`.

| Scenario | Result |
| --- | --- |
| Generic declined card | `StripeCardError`, `card_declined/generic_decline` |
| Expired card | `expired_card` |
| Idempotent PaymentIntent creation retry | Same PaymentIntent returned |
| Idempotency-key parameter tampering | `StripeIdempotencyError` |
| Capture greater than authorization | `amount_too_large` |
| Legacy centralized capture | First capture performed; retry converged as already captured |
| Over-refund | Rejected by Stripe |
| Refund retry | Same refund returned; no duplicate refund |
| Cancellation retry | First cancelled; retry converged as already cancelled |
| Temporary Stripe outage | `StripeConnectionError`; local intent reference/state unchanged |
| Webhook valid signature | Accepted |
| Webhook tampered signature | Rejected |
| Webhook stale timestamp | Rejected |
| Duplicate webhook | Existing handler tests passed |
| Out-of-order webhook | Existing handler tests passed |
| Delayed/retried webhook | Existing handler tests passed |
| DB failure followed by webhook retry | Existing handler tests passed |
| Reconciliation | Stripe retrieval projected `partially_refunded`, captured 1099, refunded 100 |

Captured test-mode objects cannot be deleted; they remain labeled in the Stripe
test account. All uncaptured disposable objects were cancelled by the runner.
No live object was read or modified.

The passing V2 unit tests do not resolve the paused design findings concerning a
worker dying after an event is marked `processing` or amount-derived
idempotency keys. Commerce v2 must remain disabled.

## 7. Security Advisor

The hosted Supabase Security Advisor could not be run because no disposable
hosted project could be created and production access was prohibited. The
official Advisor is therefore **not claimed as passed**.

Equivalent catalog checks on the isolated PostgreSQL cluster returned zero for:

| Check | Count | Classification |
| --- | ---: | --- |
| Application tables with RLS disabled | 0 | Clean in isolated fixture |
| Exposed security-definer views | 0 | Clean |
| Client-executable security-definer functions | 0 | Clean |
| Exposed sensitive columns through client grants/views | 0 | Clean |

This is strong SQL evidence but not a substitute for the hosted Advisor, which
also evaluates hosted configuration and Supabase-specific integration state.

## 8. Penetration-style verification

Attempted attacks included:

- pre-remediation anonymous admin-view read and update;
- anonymous and cross-account order access;
- IDOR through known and forged UUIDs;
- cross-account receipt access;
- prescription read/write escalation;
- customer-forged verification status;
- customer-to-admin privilege escalation;
- expired and invalid bearer use;
- explicit invalid bearer fallback to guest access;
- unsafe browser mutation origins;
- guest capability tampering and expiry;
- stale/tampered signed internal requests;
- direct SQL role switching;
- RLS owner bypass;
- role inheritance to `service_role`;
- append-only row mutation;
- direct RPC execution;
- security-definer/search-path exposure;
- future-object privilege regression;
- Stripe request replay/idempotency tampering;
- duplicate, stale, invalid, and out-of-order webhook behavior;
- over-capture, over-refund, cancellation retry, and temporary outage;
- client lifecycle-state manipulation.

No tested path produced unauthorized protected data, a duplicate test payment,
or an unaudited database admin override after remediation.

## 9. Regression results

All commands completed successfully:

- `npm test`
  - security regression and route authorization matrix;
  - upload validation;
  - cart quantities;
  - annual shipping across 108 SKUs;
  - email delivery;
  - internal bearer authorization;
  - admin workflow overrides;
  - operational queue matrix;
  - guest/customer order access;
  - production integrity;
  - Commerce v2 lifecycle and schema-contract tests.
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
  - lens coverage;
  - validation invariants;
  - optimized Next.js build;
  - 154 generated pages.
- `git diff --check` reported no whitespace errors; only Windows line-ending
  notices.

Database and Stripe gates:

- `npm run test:security:database` — passed on disposable PostgreSQL 17.6.
- `npm run test:security:stripe` — passed in Stripe test mode.

## 10. Remaining risks and blockers

### Security risks

1. The exact production schema and row distribution were not rehearsed. The
   fixture models known objects but cannot prove there are no unknown grants,
   functions, views, owners, or dependencies.
2. Hosted Supabase Auth, PostgREST, Storage, and Advisor behavior remains
   unverified.
3. Full hosted browser flows and concurrency/crash-window behavior remain.
4. OCR must remain off pending vendor/legal privacy, retention, and access
   decisions.
5. Session replay/exception capture must remain off pending privacy review.
6. Guest access expires but has no immediate server-side revocation.
7. CSP is not yet nonce/hash based.
8. Resume capabilities still briefly appear in query strings.
9. Supabase leaked-password protection and admin MFA are external controls.

### Database risks

1. The repository does not contain a complete historical production baseline.
2. A hosted exact-schema clone has not validated extension availability,
   dependencies, object ownership, grants, policies, PostgREST schema exposure,
   storage metadata, or migration runtime/locking.
3. The real hosted Advisor has not run.
4. Rollback SQL and backup/restore rehearsal are not yet recorded.
5. The server-only model requires every browser operation to remain behind the
   canonical application authorization boundary; future direct Supabase client
   features must not silently assume table grants.

### Production blockers

1. Create or restore an exact production-schema clone in a non-production
   Supabase project.
2. Apply the migrations there and rerun this database matrix against the real
   object inventory.
3. Run the hosted Security Advisor and resolve/classify every warning.
4. Run hosted browser flows for anonymous, customer, cross-account, admin,
   receipt, Rx, checkout, cancellation, stale/expired session, and Storage URL
   cases.
5. Validate migration locks/runtime, take a verified backup, and prepare tested
   rollback/emergency SQL.
6. Independently review the final SQL and authorize a production maintenance
   operation. This report grants no production authority.

## 11. Updated grades

Grades distinguish the unchanged production system from the locally validated
candidate.

| Area | Current production | Local candidate | Rationale |
| --- | --- | --- | --- |
| Security | **F** | **B+** | Broad local remediation and adversarial checks pass; hosted/production exposure remains unchanged. |
| Authentication | **C+** | **B+** | Canonical validated bearer/cookie model and fail-closed sessions pass locally; hosted refresh/MFA remains. |
| Authorization | **F** | **A-** | Local ownership/admin/API and database-deny model pass; production grants are unchanged. |
| Database | **F** | **B** | Real PostgreSQL migration and privilege proof now pass, but only against a representative fixture, not an exact hosted clone. |
| API | **C-** | **B+** | Route policy, IDOR, admin, receipt, Rx manipulation, replay, and build tests pass; hosted end-to-end coverage remains. |
| Commerce v2 | **D+ / disabled** | **D+ / disabled** | Compatibility SQL passes, but known event-worker and idempotency architecture defects remain. |

## 12. Production-remediation safety and redesign

**Production database remediation is not yet safe to perform.** The migration
is valid and passed an isolated PostgreSQL rehearsal, which removes the prior
SQL-level uncertainty. The remaining uncertainty is environmental: exact
schema completeness, hosted object ownership/dependencies, Supabase-specific
behavior, operational locking, and rollback.

No further redesign of the canonical application authorization model is
recommended before the hosted validation gate. The server-only Data API model
should be documented and preserved.

Redesign is still required before Commerce v2 can be enabled:

- durable webhook enqueue/lease/retry recovery;
- persisted unique command identifiers rather than amount-derived keys;
- crash-safe operation ledger and reconciliation ownership;
- complete production migration baseline and cutover plan.

## 13. Final recommendation

**Still NO-GO.**

The gate materially improves confidence: the migration, permissions, RLS
posture, security-definer boundary, browser/API ownership controls, Stripe test
failures, and regression suite all pass locally. It does not meet the prompt's
standard for a production recommendation because the hosted exact-schema
database, hosted Security Advisor, and full hosted browser authorization flows
were not positively verified.

The next action is a non-production hosted clone rehearsal—not deployment and
not production SQL.

## Reproduction artifacts

- `scripts/security/run-database-gate.mjs`
- `scripts/security/run-stripe-test-gate.ts`
- `scripts/security/start-browser-validation-server.mjs`
- `scripts/security/mock-supabase.mjs`
- `supabase/validation/0000_legacy_security_fixture.sql`
- `supabase/validation/README.md`
- `supabase/migrations/20260729160750_security_remediation_least_privilege.sql`

Reference behavior was checked against the official
[Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Supabase API security guidance](https://supabase.com/docs/guides/api/securing-your-api),
[Supabase Database Advisors](https://supabase.com/docs/guides/database/database-advisors),
[Stripe testing guidance](https://docs.stripe.com/testing?testing-method=payment-methods),
[Stripe manual capture guidance](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method),
and [Stripe webhook guidance](https://docs.stripe.com/webhooks?lang=node).
