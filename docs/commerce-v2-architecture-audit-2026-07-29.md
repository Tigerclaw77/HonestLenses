# Honest Lenses commerce v2: database audit, target architecture, and rollout

> **Historical evidence only.** Do not execute commands from this report.
> The authoritative release procedure is
> [`docs/production-deployment/README.md`](production-deployment/README.md).

Date: 2026-07-29
Connected Supabase project: `abhkbdyzfbcmpjrobwxq` (`Honest Lenses`, `us-east-1`)
Postgres: 17.6.1.063
Scope: read-only production audit plus local, additive Phase 1 implementation

## Executive assessment

The current `public.orders` row is simultaneously the cart, order, payment
projection, verification workflow, fulfillment workflow, customer feedback
record, email state, and operational queue input. Its 116 columns and
distributed route mutations make contradictory states possible. It should not
be the basis of the next model.

The recommended boundary is a new service-role-only `commerce_v2` schema. It
stores independent facts for orders, immutable item snapshots, payments,
Stripe events, prescription verification, fulfillment, adjustments, and
operational events. Queues and health are security-invoker projections.
Production behavior remains unchanged in Phase 1.

Production is **not ready for cutover**. The migration has not been applied,
active orders have not been imported or reconciled, old/new projections have
not been compared, and downstream checkout, receipt, portal, admin, and Armory
consumers have not switched.

## Audit method and limitations

The audit inspected the connected project catalog, row counts, columns,
constraints, foreign keys, indexes, policies, functions, triggers, extensions,
storage, migrations, advisors, and application references. Counts are a
point-in-time snapshot. Supabase-managed schemas were inspected for ownership
and object counts but are classified as platform-managed rather than redesigned
object by object.

No production rows, schema objects, storage objects, scheduled jobs, Stripe
objects, or deployments were changed.

## Schema inventory

| Schema | Inventory | Classification | Future responsibility |
| --- | ---: | --- | --- |
| `public` | 13 tables, 2 views | KEEP selectively / DEPRECATE commerce | Legacy application data during migration |
| `auth` | 23 tables | KEEP | Supabase-managed authentication |
| `storage` | 8 tables | KEEP WITH MODIFICATIONS | Supabase-managed object metadata; add reviewed bucket policies and limits |
| `realtime` | 11 relations, including partitions | KEEP | Supabase-managed realtime |
| `vault` | 1 table and 1 view | KEEP | Supabase-managed secrets |
| `extensions`, `pg_catalog`, `information_schema` | platform/catalog objects | KEEP | PostgreSQL/Supabase internals |
| `supabase_migrations` | migration ledger | KEEP WITH MODIFICATIONS | Reconcile local/remote migration history |
| `commerce_v2` | local Phase 1 proposal | ADD | Canonical commerce and operations |
| `legacy_archive` | local empty archive namespace | ADD | Immutable legacy snapshots after reviewed cutover |

There are no application materialized views. There are no installed or active
`pg_cron`/`pg_net` jobs. Reconciliation therefore uses a protected HTTP route
that can later be invoked by the approved scheduler.

## Public table register

Application references are based on repository search, not inferred solely
from table names.

| Table | Rows | Current purpose and dependencies | Application readers / writers | Decision | Migration complexity / risk | Future responsibility |
| --- | ---: | --- | --- | --- | --- | --- |
| `orders` | 273 | Cart, order, payment, Rx, verification, fulfillment, admin adjustment, feedback, email, archive. Parent of items/events/email and referenced by several workflow tables. | Nearly every checkout, cart, order, verification, admin, receipt, recovery, and Armory route reads or writes it. | SPLIT, then ARCHIVE | Very high / critical | Import active facts into domain tables; immutable historical snapshot |
| `order_items` | 0 | Intended line items; FK to orders | Order creation attempts inserts; no durable production use | REPLACE | Medium / low volume | `commerce_v2.order_items` immutable commercial snapshot |
| `order_events` | 0 | Intended audit trail; FK to orders | Verification/admin routes attempt inserts | REPLACE | Medium / audit gap | `commerce_v2.order_events`, append-only |
| `patients` | 2 | Patient identity/details | Patient and checkout workflows | KEEP WITH MODIFICATIONS | Medium / sensitive data | Patient domain outside commerce; reference by snapshot, not destructive FK |
| `user_patients` | 0 | User/patient association | Little or no active use found | DEPRECATE pending product decision | Low / low | Rebuild only if multi-patient accounts remain required |
| `profiles` | 0 | User profile; live schema has no `role` column | `admin-auth.ts` queries `profiles.role` | KEEP WITH MODIFICATIONS | High / authorization | Define a real role source or remove the broken role lookup |
| `addresses` | 1 | Reusable address | Checkout/customer flows | KEEP WITH MODIFICATIONS | Low / PII | Customer address book; orders retain immutable shipping snapshot |
| `product_interest` | 1 | Product lead/interest capture | Product interest endpoint | KEEP | Low | Marketing lead data, separate from commerce |
| `resolver_audits` | 160 | Lens resolver audit | Resolver route writes; operational analysis reads | KEEP WITH MODIFICATIONS | Low / retention | Product resolution telemetry with retention policy |
| `federal_holidays` | 231 | Passive verification business-day calendar | Verification deadline functions/routes | KEEP | Low | Shared calendar reference |
| `site_reminders` | 1 | Site reminder/recovery state | Limited reminder workflow | KEEP WITH MODIFICATIONS | Low | Messaging domain; clarify ownership and retention |
| `order_email_deliveries` | 3 | Transactional email delivery projection; FK to orders | Email delivery server functions | KEEP until archive, then SPLIT | Medium / customer support | Messaging ledger referencing stable archived order ID |
| `resend_webhook_events` | 8 | Resend webhook idempotency/event record; FK to orders | Resend webhook route/functions | KEEP WITH MODIFICATIONS | Low / missing index | Messaging event ledger; add `order_id` index |

### Public views

| View | Current issue | Decision |
| --- | --- | --- |
| `admin_orders` | Default security-definer behavior; grants to `anon` and `authenticated`; duplicates order projection | DEPRECATE and revoke during reviewed security remediation |
| `admin_orders_view` | Same exposure and overlapping responsibility | DEPRECATE and revoke during reviewed security remediation |

Both were reported as security errors by the database advisor. The v2 views use
`security_invoker = true` and are service-role-only.

### Functions and triggers

| Object | Finding | Decision |
| --- | --- | --- |
| `apply_resend_delivery_event` | Service-only messaging mutation | KEEP |
| `record_transactional_email_send` | Service-only messaging mutation | KEEP |
| `calculate_passive_deadline` | Verification calendar helper; executable by anon/auth | KEEP WITH MODIFICATIONS; narrow execute grants |
| `generate_federal_holidays` | Calendar maintenance; executable by anon/auth | KEEP WITH MODIFICATIONS; admin/service only |
| `insert_holiday` | Calendar mutation; executable by anon/auth | KEEP WITH MODIFICATIONS; admin/service only |
| `update_updated_at` | Generic trigger helper; executable by anon/auth | KEEP WITH MODIFICATIONS; revoke unnecessary direct execute |
| `orders_updated_at` | Only application trigger found | ARCHIVE with legacy table |

There are no active public triggers enforcing payment, verification,
fulfillment, or audit invariants. V2 adds timestamp triggers plus rejection
triggers on append-only facts.

### Enum, constraints, and foreign keys

The public `order_status` enum mixes order and payment concepts:
`draft`, `pending`, `verified`, `rejected`, `cancelled`, `fulfilled`,
`returned`, `authorized`, and `captured`. It is DEPRECATED for v2.

Important integrity findings:

- `orders.user_id` is `NOT NULL`, while its auth foreign key uses
  `ON DELETE SET NULL`; account deletion can fail.
- Several historical child records use `ON DELETE CASCADE`, which is
  inappropriate for accounting and audit history.
- Payment, verification, and fulfillment truth are represented mostly by
  loosely related nullable columns and booleans rather than constrained
  lifecycle records.
- The v2 model deliberately does not FK historical customer identity to
  `auth.users`, and all canonical/audit FKs use `RESTRICT` or `SET NULL`, never
  cascade deletion.

### Index and policy findings

- `resend_webhook_events.order_id` lacks an index.
- Advisors report `auth.uid()` init-plan performance warnings on policies for
  `orders`, `order_items`, `order_events`, `profiles`, and `patients`.
- `patients` and `product_interest` have overlapping permissive policies.
- Several indexes are currently unused; low volume makes this non-urgent, but
  they should be reassessed after cutover rather than copied into v2.
- `order_email_deliveries` and `resend_webhook_events` have RLS enabled without
  end-user policies. That is coherent for service-only tables but should be
  documented explicitly.
- V2 enables RLS on every table, grants no `anon`/`authenticated` access, and
  grants service-role access only.

### Extensions, storage, schedules, and migrations

Installed extensions are `plpgsql`, `pgcrypto`, `pg_stat_statements`,
`supabase_vault`, and `uuid-ossp`. No extension change is required for Phase 1.

Storage has one private bucket, `prescriptions`, with 345 objects. No explicit
bucket file-size or MIME limits and no storage policies were returned by the
audit. It currently behaves as service-role-only. KEEP WITH MODIFICATIONS:
define size/type limits, retention, and explicit access policies before any
customer-direct upload redesign.

The remote migration ledger contained only
`20260721143337_resend_email_delivery_tracking`, while the corresponding local
file is named `20260721000000_resend_email_delivery_tracking.sql`. This drift
must be reconciled before applying new migrations. The new local migration was
created with the Supabase CLI as
`20260729144510_create_commerce_v2_phase1.sql`.

Authentication has 104 users, one user with application-role metadata, no
user-role metadata, and zero profile rows. Because `profiles.role` does not
exist live, the current admin role lookup fails and authorization effectively
depends on the email allowlist. This is a founder/security decision, not a
commerce migration detail, and must be corrected before cutover.

## Data quality findings and disposition

| Finding | Count | Disposition |
| --- | ---: | --- |
| Draft order with a PaymentIntent reference | 39 | ACTIVE MIGRATION; query Stripe, preserve ID, import factual state; a created/unconfirmed intent may be valid |
| Fulfillment terminal while payment is not captured | 2 | ACCOUNTING REVIEW; unsafe to correct automatically |
| Verification boolean/status conflict | 245 | ARCHIVE ONLY for completed history; active records require evidence-based import warning |
| Captured amount differs from order total | 1 | ACCOUNTING REVIEW; may be a legitimate admin adjustment |
| Orders with PaymentIntent reference | 62 | ACTIVE MIGRATION; Stripe reconciliation required |
| Orders without PaymentIntent reference | 211 | ARCHIVE or active warning based on operational state |
| `passive_deadline` vs `passive_deadline_at` conflict | 0 observed | DEPRECATE duplicate; import only supported fact |
| Payment state without intent | 0 | No correction needed |
| Quantity projection conflict | 0 observed | Do not change existing quantity logic |

Dead or nearly dead projections include `rx_source`, `brand_confidence`,
`od_review_status`, `revised_total`, several OCR projections, and all archive
columns. Patient names also exist in three representations. Historical
inconsistency must remain visible in the archive; the importer must emit
warnings rather than synthesize facts.

## Target ownership and source-of-truth rules

| Concept | Canonical owner | Rule |
| --- | --- | --- |
| Commercial agreement | `orders`, `order_items` | Immutable pricing/product/customer/shipping snapshots at placement |
| Stripe payment truth | `payments` plus `payment_events` | Stripe IDs and amounts are never detached after temporary failure |
| Prescription workflow | `prescription_verifications` and events | Never inferred from or modified by payment/reconciliation |
| Supplier/shipment workflow | `fulfillments` and events | Independent lifecycle with immutable quantity snapshot |
| Admin correction | `order_adjustments` | Append-only delta and previous/new state; never rewrites captured history |
| Operational audit | `order_events` | Append-only actor, time, reason, previous/new state, metadata |
| Queue/readiness | `order_operational_projection` | Computed; every order gets exactly one queue |
| Health | `system_health_summary` | Computed counts over queues, inbox, and reconciliation |

The order status is intentionally small: `open`, `cancelled`, or `completed`.
Payment, verification, and fulfillment each own their own lifecycle.

## Phase 1 schema

The additive migration creates:

- `commerce_v2.orders`
- `commerce_v2.order_items`
- `commerce_v2.payments`
- `commerce_v2.payment_events`
- `commerce_v2.payment_event_inbox`
- `commerce_v2.payment_operations`
- `commerce_v2.prescription_verifications`
- `commerce_v2.prescription_verification_events`
- `commerce_v2.fulfillments`
- `commerce_v2.fulfillment_events`
- `commerce_v2.order_adjustments`
- `commerce_v2.order_events`
- `commerce_v2.reconciliation_runs`
- `commerce_v2.reconciliation_findings`
- `commerce_v2.legacy_imports`
- `commerce_v2.order_operational_projection`
- `commerce_v2.system_health_summary`

`payment_events`, domain event tables, adjustments, and order events reject
updates and deletes. `apply_payment_projection` keeps Stripe occurrence time
separate from local projection-observation time. Because webhook and
reconciliation processors retrieve current Stripe state, the observation time
prevents a slower concurrent fetch from rewinding a newer projection without
rewriting the immutable event chronology.

## Canonical commerce service

`CommerceService` centralizes create/reuse, amount update, capture, cancel, and
refund. Stable keys are based on order, operation, and logical amount/object.
`payment_operations` checkpoints the Stripe response before applying the
database projection. If Stripe succeeds and the database fails, a retry resumes
from that response; it does not issue another logical Stripe mutation. If
Stripe is temporarily unavailable, the existing PaymentIntent row and ID are
unchanged.

Existing routes are intentionally not switched in Phase 1:

| Existing mutation surface | Phase 1 | Cutover action |
| --- | --- | --- |
| `/api/checkout/pay` | unchanged | Replace body with commerce service create/reuse |
| `/api/checkout/authorized` | unchanged | Consume canonical projection; stop direct payment writes |
| `/api/checkout/capture` | unchanged | Delegate capture |
| `/api/orders/[id]/pay` | unchanged | Remove or compatibility-delegate |
| `/api/orders/[id]/capture` | unchanged | Remove or compatibility-delegate |
| `/api/orders/[id]/cancel` | unchanged | Delegate cancel; never clear intent on outage |
| `/api/orders/[id]/reauthorize` | unchanged | Delegate amount update/new intent policy |
| `/api/verification/complete` and `/process` | unchanged | Verification service only; request payment capture through commerce service |
| Admin capture/quantity adjustments | unchanged | Append adjustment; invoke commerce service when a Stripe mutation is needed |
| Arbitrary `/api/orders/[id]/status` | unchanged | Remove or constrain to explicit audited order transitions |

Permanent dual write is rejected. Phase 2 imports, Phase 3 compares, and Phase 4
switches each write boundary atomically.

## Stripe webhook

`POST /api/webhooks/stripe`:

1. refuses traffic unless `COMMERCE_V2_ENABLED=true`;
2. reads the raw request body;
3. verifies `Stripe-Signature` using `STRIPE_WEBHOOK_SECRET`;
4. claims a unique Stripe event ID in an immutable ledger/inbox transaction;
5. ignores unsupported types explicitly;
6. resolves PaymentIntent/order references without deleting any reference;
7. retrieves current Stripe state, so partial or out-of-order payloads are not
   treated as canonical;
8. applies only a non-older current-state observation;
9. records an operational event and marks the inbox result.

Supported projections cover authorization, capture, cancellation, failure,
refund, and dispute events. Duplicate completed events return success without
reprocessing. Failed events are retryable; abandoned processing claims become
retryable after five minutes.

## Reconciliation

`POST /api/internal/commerce/reconcile` requires the existing constant-time
`CRON_SECRET` bearer check and the v2 feature flag. It:

- retrieves up to 100 stale payments per run (hard maximum 500);
- compares lifecycle, currency, authorized/capturable/captured/refunded/
  disputed amounts, and latest charge;
- writes a human-readable immutable finding before applying current Stripe
  truth;
- preserves the PaymentIntent reference on errors;
- records run totals and failure state;
- has no verification repository method and cannot alter prescription state.

No schedule was created because the connected database has no scheduler
extension and deployment is out of scope. The approved platform scheduler
should invoke this endpoint after cutover.

## Operational queues and admin authority

The v2 projection assigns each order one of:

`action_required`, `awaiting_payment`, `awaiting_verification`,
`ready_to_fulfill`, `in_fulfillment`, `cancelled`, or `completed`.

An active impossible/drift state receives `action_required` plus a
human-readable reason. The health view separately counts any missing reason,
making the invariant observable.

`apply_admin_override` locks and updates the order and appends both an immutable
adjustment and immutable order event in one transaction. A non-empty reason and
actor are required. Payment facts are not updated. The UI may warn or confirm,
but the database function does not hard-block an authorized admin from setting
the canonical order terminal state.

## Legacy archive strategy

Use immutable copies in `legacy_archive`, not an immediate table rename:

1. create archive tables with the original column shapes;
2. copy every legacy row and record source counts/checksums;
3. attach `legacy_archive.reject_mutation` to every archived table;
4. revoke all end-user writes and grant support/accounting read access through
   narrowly scoped security-invoker views;
5. retain original Stripe IDs and inconsistencies;
6. keep `legacy_order_id`/`legacy_imports` mappings in v2;
7. only after comparison/cutover, remove writes to `public.orders`.

Copies keep rollback simple during staged comparison. A rename would couple
cutover to every old query and make rollback riskier.

## Migration and rollback

### Phase 1 — local implementation

- Review and apply the additive schema.
- Configure secrets but leave `COMMERCE_V2_ENABLED=false`.
- Validate RLS/grants and webhook signature behavior in a non-production
  project.

Rollback: drop the new schemas only in the non-production environment before
any import. Production legacy behavior is unchanged.

### Phase 2 — controlled import

- Archive all legacy rows.
- Import active orders only.
- Preserve source snapshots and `legacy_order_id`.
- Reconcile each PaymentIntent against Stripe.
- Import verification only from explicit evidence.
- Emit `legacy_imports.warning_codes`; never invent missing facts.

Rollback: disable v2, stop import workers, and continue using legacy. Imported
v2 data remains isolated for diagnosis.

### Phase 3 — shadow comparison

- Compare queue, totals, payment, verification, and fulfillment projections.
- Categorize every discrepancy as archive-only, active migration, accounting
  review, safe correction, or unsafe correction.
- Exercise receipt, portal, admin, and Armory read adapters against both models.

Rollback: disable shadow readers; no legacy write path changed.

### Phase 4 — cutover

- Freeze a short write window.
- Run final import/reconciliation and compare counts.
- Switch checkout and mutation adapters to the commerce service.
- Switch readers one bounded surface at a time.
- Enable signed webhooks and reconciliation.
- Make legacy tables read-only only after smoke tests pass.

Rollback: disable v2 routes, restore legacy adapters, and keep new records for
manual replay. Do not reverse-copy projections into legacy automatically.

## Founder decisions required

1. Is an immutable archive copy with scoped support/accounting views acceptable,
   and what is the legal retention period?
2. Which active legacy states qualify for import versus support-only archive?
3. Who owns accounting review for the two fulfillment/payment contradictions
   and one captured-total discrepancy?
4. Should admin identity be stored in a dedicated role table, app metadata, or
   an external identity provider? The current profile-role path is broken.
5. Should partial refunds leave the order open by default, or require an
   explicit admin order-state decision?
6. Which scheduler will invoke reconciliation, at what cadence, and where
   should alerts go?
7. What customer-direct prescription upload MIME/size/retention policy is
   required?

## Local validation results

Passed on 2026-07-29:

- full `npm test`, including existing cart, shipping, email, authorization,
  queue, receipt/customer-access, and production-integrity matrices;
- v2 lifecycle tests for duplicate/out-of-order webhooks, invalid signatures,
  Stripe-success/database-failure resume, Stripe failure, stable concurrent
  checkout keys, cancellation, capture, adjustment separation, refunds,
  disputes, and reconciliation isolation;
- v2 static schema contracts for required tables, append-only triggers,
  service-role isolation, queue/reason/health contracts, admin audit, archive
  protection, and non-cascading history;
- `npx tsc --noEmit`;
- `npm run lint` with zero warnings;
- production `npm run build`;
- conflict-marker scan and `git diff --check`.

The SQL has not been executed by a PostgreSQL engine. This repository has no
local Supabase `config.toml`, Docker/Postgres runtime, or disposable database.
Running `db reset --linked` would be destructive to the linked production
project and was intentionally not attempted. Engine-backed migration and schema
validation remains a required non-production gate.

## Readiness gates

Before production:

- reconcile local and remote migration history;
- review SQL and apply only to a non-production Supabase branch/project;
- rerun security/performance advisors;
- prove archive row counts/checksums and mutation rejection;
- import/reconcile active orders and resolve accounting-review items;
- compare every operational queue with zero missing reasons;
- validate webhook replay with Stripe test mode;
- run checkout, authorization, capture, cancellation, refunds, verification,
  fulfillment, receipts, portal, admin, and Armory end to end;
- document secret rotation, scheduler, alerting, cutover, and rollback owners;
- obtain founder approval for the decisions above.
