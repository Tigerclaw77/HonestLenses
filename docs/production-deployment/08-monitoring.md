# First-hour and first-day monitoring

> Governance: [Founder authority policy](00-founder-authority.md). Monitoring thresholds are recommendations unless a current technical condition makes them necessary for the requested operation.

Record UTC timestamps, dashboards/queries used, observed value, threshold, and
operator decision in the deployment log.

## Thresholds

Where a stable production baseline exists, the stricter of the relative and
absolute threshold applies.

| Signal | Warning | Abort/escalate |
| --- | --- | --- |
| HTTP 5xx | >2% or >2× baseline for 5 min | >5% for 5 min or two warning windows |
| Checkout/payment route failures | >2 consecutive canary/customer failures | any systematic failure or incorrect amount/state |
| p95 API latency | >2× baseline for 10 min | >3× baseline for 10 min |
| DB CPU | >80% for 10 min | >90% for 10 min with degraded requests |
| DB connections | >80% of limit | >90% or rejected connection |
| Lock wait | any >5 s | blocked migration/write or deadlock |
| Deadlocks/database restarts | any | immediate incident |
| Legitimate server `42501`/RLS failure | any | immediate write drain |
| Anonymous/cross-account protected access success | any | immediate critical incident |
| Stripe webhook processing failure | any unresolved >2 min | any unresolved >5 min or backlog growth |
| Webhook backlog | >3 events or oldest >2 min | oldest >5 min |
| Reconciliation mismatch | any unexplained | any payment/order amount or terminal-state mismatch |
| Commerce v2 row | any while disabled | immediate critical incident |
| Integrity dashboard critical finding | any | immediate write drain |
| Customer reports | 2 similar in 15 min | any privacy/payment report or 3 similar in 30 min |

Expected anonymous/cross-account denials are not incidents. Alert on unexpected
success or on legitimate server requests losing access.

## First hour

Observe at T+0, +5, +15, +30, +45, and +60 minutes.

### Application logs

- errors by route/status/error code;
- checkout/order/admin/receipt/verification/fulfillment failures;
- unexpected 401/403/404/42501;
- timeouts and dependency failures;
- rate-limit function errors;
- Storage upload MIME/size rejections.

### Database

- CPU, memory, connections, pool saturation;
- active/idle-in-transaction sessions;
- locks, waits, deadlocks;
- migration history unchanged after expected rows;
- RLS/grants/owners/default ACL unchanged;
- shared guest UUID count zero;
- Commerce v2 empty;
- integrity dashboard healthy.

### Stripe

- endpoint delivery health;
- last received/processed event;
- failures, retry schedule, backlog age;
- duplicate/idempotency handling;
- PaymentIntent/capture/refund state for canary and deployment-window orders;
- open reconciliation findings.

### Authorization

- owner order/receipt succeeds;
- anonymous and cross-account access remains denied;
- non-admin admin request remains denied;
- admin operations produce audit events;
- unsigned internal request denied and signed request accepted.

### Customer/operations

- support inbox/chat/phone reports;
- admin Action Required queue;
- verification/fulfillment queue movement;
- abandoned checkout anomalies;
- receipt generation failures.

At T+60, the incident commander records either “first hour passed” or keeps the
incident window open.

## First day

Observe at T+2h, +4h, +8h, +12h, and +24h.

- repeat application/database/Stripe/authorization checks;
- reconcile every deployment-window Stripe event;
- sample successful and failed checkout journeys;
- review payment failure rate against the previous comparable day;
- review webhook retry/duplicate/out-of-order handling;
- review verification, Action Required, and fulfillment aging;
- review receipt/order lookup authorization;
- confirm no manual Dashboard DDL or grant change;
- confirm feature flags and Commerce v2 row count;
- review Security Advisor changes;
- review customer reports by category;
- record all exceptions and owner/resolution.

## First-day success

- no open critical alert;
- no unexplained Stripe/database mismatch;
- no privacy/authorization failure;
- no Commerce v2 writes;
- no schema/grant drift;
- all customer/admin workflows stable against baseline;
- founder/incident commander signs the T+24 result.
