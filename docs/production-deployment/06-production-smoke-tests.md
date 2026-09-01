# Ordered production smoke tests

> Governance: [Founder authority policy](00-founder-authority.md). Select tests that exercise the requested change and its real dependencies. Historical Stripe, write-drain, Commerce v2, and fixed-ledger checks are not universal gates. Never improvise a production mutation outside the authorized scope.

Use unique test identifiers and record every request/order/PaymentIntent/event
ID in the deployment log. Stop on the first critical failure.

Status values: `PASS`, `FAIL`, `NOT VERIFIED`.

Interactive browser rows remain required unless the founder signs
[`HL-BROWSER-WAIVER-2026-07-29`](12-browser-validation-waiver.md). Under that
waiver, record browser rows as `WAIVED`, not `PASS`, execute the specified
HTTP/API equivalents and compensating checks, and make checklist row 12 pass
only by recording the signed waiver.

## 0. Safety gates

| # | Test | Expected |
| ---: | --- | --- |
| 0.1 | Production host/project/account identity | Exact approved identifiers |
| 0.2 | `COMMERCE_V2_ENABLED` | `false` everywhere |
| 0.3 | Commerce v2 database rows | zero |
| 0.4 | Write drain | still active |
| 0.5 | Stripe canary authorization | separately approved or marked `NOT VERIFIED`; never improvised |

## 1. Read-only public/customer surface

| # | Test | Expected |
| ---: | --- | --- |
| 1.1 | Homepage | 200; primary navigation/product CTAs render |
| 1.2 | Representative daily, toric, multifocal product pages | 200; product data/price render |
| 1.3 | Search valid product | expected result; no server error |
| 1.4 | Search nonexistent product | empty/not-found behavior; no data leak |
| 1.5 | Anonymous direct order/receipt URL | denied/not found; no protected data |
| 1.6 | Customer login with clean session | succeeds; correct user identity |
| 1.7 | Owner order lookup | 200; correct order only |
| 1.8 | Cross-account/forged UUID lookup | 403/404 or zero rows; no data |
| 1.9 | Owner receipt | 200; totals/customer/order identity correct |
| 1.10 | Cross-account receipt | 404/denied |

## 2. Cart and checkout

Use a dedicated internal customer and SKU.

| # | Test | Expected |
| ---: | --- | --- |
| 2.1 | Add product to empty cart | item/eye/quantity/price correct |
| 2.2 | Update quantity/shipping | totals recalculate correctly |
| 2.3 | Reload/resume cart | state remains authorized to same customer |
| 2.4 | Start checkout | legacy order created; Commerce v2 remains empty |
| 2.5 | Shipping/tax/total | values equal checkout summary |
| 2.6 | Prescription path | authorized upload/details work; cross-account denied |

## 3. Payment

### Preferred preparation check

Before writes reopen, verify Stripe configuration and webhook health read-only.
Use previously completed Stripe test-mode evidence for mutation/idempotency
coverage.

### Optional live canary

Run only with explicit founder and Stripe-operator authorization. Use a
dedicated internal customer, a documented minimal legitimate amount, and a
preapproved disposition.

| # | Test | Expected |
| ---: | --- | --- |
| 3.1 | Payment authorization | one live PaymentIntent; correct amount/currency/order metadata |
| 3.2 | Authorization retry | no duplicate PaymentIntent/charge |
| 3.3 | Capture | exact approved amount captured once |
| 3.4 | Capture retry/idempotency | no duplicate capture |
| 3.5 | Webhook convergence | event accepted once; order state reconciles |
| 3.6 | Receipt after capture | payment/order totals agree |
| 3.7 | Canary disposition | fulfill, cancel, or refund exactly as preapproved |

If a live canary was not separately authorized, mark 3.1–3.7
`NOT VERIFIED`. Do not call that a pass.

## 4. Admin

Use a clean admin session and a separate non-admin control user.

| # | Test | Expected |
| ---: | --- | --- |
| 4.1 | Admin login | succeeds; app metadata role recognized |
| 4.2 | Customer opens admin URL/API | 403/redirect; no admin data |
| 4.3 | Dashboard | loads current order queues/counts |
| 4.4 | Action Required | expected flagged orders; reason/action available |
| 4.5 | Verification workflow | reviewed transition succeeds; audit event exists |
| 4.6 | Fulfillment workflow | reviewed transition succeeds; audit event exists |
| 4.7 | Admin override | reviewed transition succeeds; before/after/reason/actor audit exists |
| 4.8 | System health | loads; integrity checks healthy; Commerce v2 explicitly disabled |
| 4.9 | Unsigned internal operational request | 401 |
| 4.10 | Correctly signed internal request | 200; expected scoped result |

Use existing/canary records. Do not mutate a real customer's order.

## 5. Database

| # | Test | Expected |
| ---: | --- | --- |
| 5.1 | Post-migration assertions | 12/12 `PASS` |
| 5.2 | Migration history | historical rows match dynamically; exactly the scoped new migration(s) were added |
| 5.3 | RLS flags | every reviewed public/Commerce table enabled |
| 5.4 | Grants | anon/auth denied protected DML/RPC; service role works |
| 5.5 | Owners/default ACL | exact reviewed `postgres` state |
| 5.6 | Security Advisor | no `WARN`/`ERROR`; INFO classified |
| 5.7 | Integrity dashboard | no open critical finding |
| 5.8 | Commerce v2 | disabled and empty |

## 6. Stripe and event processing

| # | Test | Expected |
| ---: | --- | --- |
| 6.1 | Endpoint status/configuration | expected live endpoint and signing secret mapping |
| 6.2 | Last event age | within normal traffic baseline; no unexplained gap |
| 6.3 | Failed webhook deliveries | zero unresolved deployment-window failure |
| 6.4 | Duplicate delivery | handled idempotently |
| 6.5 | Event backlog | zero, or drains within five minutes |
| 6.6 | Reconciliation | zero unexplained mismatch |
| 6.7 | Payment/order state | exact for every canary/deployment-window payment |

## Completion

Record every result without manufacturing evidence. Failures relevant to the requested change require evaluation and may expose a genuine hard blocker; unrelated or explicitly waived checks are warnings under a scoped founder override. A live canary outside the authorized scope remains prohibited and does not authorize a financial mutation.
