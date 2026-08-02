# Honest Lenses Payment Reconciliation

## Background

This investigation began after Stripe reported repeated HTTP 503 responses from
`/api/webhooks/stripe`. Commerce V2 was intentionally disabled in production,
but the webhook route returned 503 whenever its feature flag was unset. During
the investigation, one order was found with a succeeded Stripe PaymentIntent
while its database payment status remained `authorized`.

## Findings

The payment mismatch was **not caused by the webhook outage**. The proven
sequence was:

1. An external or manual Stripe capture occurred.
2. The database remained `authorized` because that capture did not use the
   application path that synchronously updates the order.
3. Webhook delivery failed because Commerce V2 feature gating returned HTTP 503
   before signature verification or event processing.
4. No legacy reconciliation path existed behind that gate.
5. The mismatch therefore persisted until the Stripe event was replayed through
   the new legacy reconciliation path.

The capture and webhook failures were correlated, but the webhook outage did
not initiate the capture or create the initial divergence. It prevented an
asynchronous event from being used to reconcile that divergence. Removing the
503 response alone would not have fixed the order because the prior webhook
handler updated only Commerce V2 state.

## Legacy reconciliation

Legacy reconciliation remains active while Commerce V2 is disabled so that the
current production order table can converge with Stripe after an out-of-band
capture or a failed synchronous database update.

A Stripe `payment_intent.succeeded` event changes an order only when all of the
following are true:

- The Stripe signature is valid.
- The event contains a valid order ID matching an existing order.
- The order's stored PaymentIntent matches the event's PaymentIntent.
- Stripe's captured amount matches the authoritative capture amount for the
  order.
- The payment currency is USD.
- The current database payment state is `authorized`.

Only then may reconciliation apply this transition:

`authorized` → `captured`

Reconciliation does **not**:

- Verify a prescription.
- Change fulfillment state.
- Modify shipping.
- Alter the capture amount.
- Write to or overwrite Stripe.

## Idempotency

- Duplicate succeeded events are acknowledged without repeating the database
  mutation when the order is already `captured` or `completed`.
- Replaying a valid event is safe and returns a successful acknowledgement once
  processing succeeds.
- Events that cannot be matched to the referenced order and PaymentIntent are
  acknowledged without mutating an order.
- Valid event types not used by the legacy production flow are acknowledged and
  ignored.
- Invalid signatures are rejected and are never acknowledged as valid Stripe
  events.
- A database failure during required reconciliation returns an error so Stripe
  can retry instead of silently losing the transition.

## Commerce V2

Commerce V2 remains disabled. Legacy reconciliation exists only to keep the
current production payment state synchronized until Commerce V2 becomes the
authoritative commerce system.

## Operational guidance

If Stripe reports failed webhooks:

1. Verify that webhook signature validation is operating correctly.
2. Verify delivery or replay of the affected Stripe event.
3. Compare Stripe's authoritative PaymentIntent state with the database order
   state and amount.
4. Determine whether the divergence resulted from a manual capture, webhook
   failure, or application capture.
5. Never infer causation from matching timestamps or symptoms without request,
   event, and database evidence.

## Incident summary

- **Root cause:** An external or manual capture bypassed the application's
  synchronous database update. The Commerce V2 feature gate returned HTTP 503,
  and no legacy reconciliation path existed, so the divergence persisted.
- **Deployed commit:** `2e85d9881e16b6c6af07c86029161b3acf70202f`
- **Deployment ID:** `dpl_DhHsnADSr4pz7yXE1rKmcCbbBasM`
- **Replay outcome:** All 11 unique failed Stripe events returned HTTP 200 after
  replay, and all reported zero pending webhooks. A duplicate replay was
  idempotent.
- **Final production state:** The affected order and Stripe both report the
  payment captured for the same amount. No failed Stripe events remain, and
  Commerce V2 is still disabled.
