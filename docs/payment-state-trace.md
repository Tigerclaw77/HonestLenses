# Payment State Trace

Date: 2026-06-02

Scope:

- `src/app/api/admin/orders/route.ts`
- `src/lib/orders/getNextAction.ts`
- `src/app/admin/orders/page.tsx`
- `src/lib/payments/captureAmount.ts`

## Authority

Short term authority remains the admin API projection from Stripe PaymentIntent when available, with local `orders.status` as fallback.

Primary display helper:

- `getPaymentState(order)` in `src/lib/orders/getNextAction.ts`

Dashboard consumers:

- Collapsed payment badge
- Expanded `Payment / Stripe` panel
- Copied order text
- NEXT ACTION

## Display Mapping

| Source evidence | Displayed payment state | Notes |
|---|---|---|
| Stripe PaymentIntent `requires_capture` | Authorized | Payment can be captured |
| Stripe PaymentIntent `succeeded` | Captured | Funds captured |
| Stripe latest charge refunded or amount refunded | Refunded | Refund terminal |
| Stripe PaymentIntent `canceled` | Cancelled | No longer shown as generic failed |
| Local `status=draft` with no PaymentIntent | Draft | No longer shown as failed |
| Local `status=cancelled` | Cancelled | Local terminal fallback |
| Local `status=failed` or unknown Stripe failure | Failed | Payment issue |

## Changes Made

- `src/app/api/admin/orders/route.ts` now projects `payment_status=draft` for draft/no-intent orders instead of `failed`.
- `src/app/api/admin/orders/route.ts` now projects `payment_status=cancelled` for local cancelled status or Stripe `canceled`.
- `src/lib/orders/getNextAction.ts` exposes `getPaymentState(order)` and the dashboard uses it for all primary payment labels.
- `payment_status_source` and raw Stripe status remain in the expanded debug panel only.

## Conflicts Found

- `capture_amount_cents` is not a payment lifecycle state. It changes capture amount only.
- Local `status` still mixes payment and legacy order lifecycle values (`paid`, `shipped`, `completed`). The helper preserves the existing fallback but does not expose those raw values as payment states.

## UI Lies Removed

- Draft/no-intent orders no longer display as `Payment failed`.
- Stripe/local cancelled payment no longer displays as generic `Failed`.
- Collapsed and expanded payment labels now use the same helper.
