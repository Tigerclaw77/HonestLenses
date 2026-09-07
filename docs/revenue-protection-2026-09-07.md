# Revenue protection release — September 7, 2026

Based on canonical main/production `ead31723f41ea0603781bb378e62b52211dd8c01`; the older open WIP branch was not used.

Recovery already had signed same-order guest access, 60-minute single-use email recovery tokens, reusable seven-day saved-cart tokens, rate limits, admin abandonment classification, and a generic draft email. Checkout/payment idempotency and incident SKU/receipt repairs were retained.

Recovery now checks archive, confirmation, fulfillment, product evidence, and live Stripe ownership/status/received/capturable amounts. Capabilities recheck eligibility on every use. Admin draft requests produce one auditable proposal per order/touch, with hashed seven-day email-bound tokens. Concurrent repeats return 409. Proposals use the most recent activity: 1 hour, then 24 hours; delayed runs skip the early touch, and drafts older than seven days are excluded. Known bounce/complaint/suppression/failure states are excluded from proactive proposals. No discounts are introduced.

**Delivery is unavailable:** the workflow has no send transport or cron; the database only permits `pending_founder_approval`. Existing customer-requested transactional save/resume behavior remains, with stronger eligibility. No customer email, production token, recovery proposal, payment, or order mutation was initiated during this release. Founder approval is required before connecting a scheduled sender; that activation must include recipient-level consent/opt-out/suppression and delivery audit/retry handling. This release does not represent drafts as delivered touches.

`npm run recovery:preview` is read-only and returns counts, not email addresses or capabilities. Production inventory after migration: 0 first-touch candidates, 2 24-hour candidates, 39 exclusions, 0 drafts created. The existing admin “draft recovery email” action prepares an eligible proposal for review.

Validation: `npm run test:revenue`, full `npm test`, TypeScript, targeted ESLint, production build, and temporary PostgreSQL gate passed. Fourteen pinned SKU/pack/price fixtures cover OASYS ordinary/MAX/daily/biweekly, DT1/TOTAL30, Biotrue sphere/toric, MyDay/Biofinity, quantity, shipping boundaries, authorized/captured amount, selection preservation, and receipt arithmetic. Real capture/reconciliation/confirmation functions run against fixtures with provider delivery mocked; replay cannot recapture or resend. The small cart SKU-selection helper exposes existing behavior to deterministic tests.

Production builds now run zero-row schema/grant probes before Next builds. The live gate failed clearly on the missing recovery table before migration, then passed after it. Existing receipt schema was present and reused. The additive migration `20260907152347_recovery_touch_drafts.sql` was applied and verified: RLS enabled, no client grants, service role select/insert only, zero production rows. Local PostgreSQL tests verify duplicate-key and prohibited-state rejection.

## Fulfillment audit only

Evidence: pricing files, `src/app/api/armory/orders/route.ts`, `operator-alert/route.ts`, admin transitions and operational queue; read-only production manufacturer/fulfillment aggregates; saved Armory repository. No vendor orders were submitted.

- J&J/Vistakon explicitly uses a direct price list. Alcon and Bausch use manufacturer price lists; direct fulfillment is the site's stated model, but price lists do not prove actual supplier submission routes. CooperVision explicitly uses Nassau/OOGP acquisition pricing because HL lacks direct CooperVision account pricing.
- Proven automation: payment/Rx eligibility gates, normalized read-only paginated Armory order feed, queue classification and exception flags, plus an operator-alert receiver. Lifecycle ownership is labeled Armory after ordering. **No executable manufacturer/OOGP ordering or tracking adapter was found in either inspected repository.** External browser/operator automation cannot be certified from this evidence.
- Manual/external responsibilities: select supplier/account, submit the exact SKU/Rx/quantities/address, confirm vendor acceptance/order number, resolve stock/backorders or rejected prescriptions, and update shipment/completion. Stored `ordered` status alone does not prove supplier acceptance.
- Stuck risks: stale flags are calculated when read, not by an HL cron (`vercel.json` has none); bridge consumers must paginate beyond 100 records; supplier-site failures require external reporting; alert dedupe/rate limits are process-memory only; defaults leave the operator-alert bridge disabled/dry-run. No production alert configuration was changed.

| Rank | Next improvement | Estimated effort | Operational benefit |
|---|---|---|---|
| 1 | Durable aging monitor for captured/unordered and ordered/unshipped orders, with persisted alert dedupe and acknowledgement | 0.5–1 day | Makes silent/stuck paid orders actionable without relying on someone opening a dashboard |
| 2 | Persist supplier route, acceptance/order number and idempotent submission outcome; automate one proven high-volume vendor first | 2–4 days/vendor, access dependent | Prevents duplicate supplier orders and exposes failed submissions; removes repeated entry |
| 3 | Import supplier tracking/backorder updates with timed exceptions | 1–2 days/vendor | Reduces manual checking and delayed-customer support work |

Google Ads parked; no current suspension claim made. Historical data repair and customer receipt resends remain outside scope. Supabase's existing leaked-password-protection warning was not changed ([provider guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)); no new error-level advisory was found. Server-only tables intentionally have no client RLS policies.
