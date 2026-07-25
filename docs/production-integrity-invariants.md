# Production Integrity Invariants

## Verification completion authorization

`POST /api/verification/complete` and `POST /api/verification/process` require
the existing `CRON_SECRET` as a strict bearer token before request parsing,
database access, Stripe capture, or Stripe cancellation. Missing or empty server
configuration fails closed.

## Quantity and money authority

- Fulfillment quantity is projected by
  `src/lib/orders/orderQuantity.ts`. Complete adjusted quantity fields take
  precedence over the originally submitted quantity fields.
- SKU price plus shipping is calculated only by
  `src/lib/orders/orderPricing.ts`.
- Checkout authorization is `total_amount_cents` less the existing bounded
  feedback credit, enforced by `src/lib/payments/checkoutAmount.ts`.
- Capture, customer receipts, the customer order page, and Armory use the shared
  commerce projection and capture amount helpers.

An admin quantity adjustment writes the adjusted quantity, recalculated
shipping and total, and planned capture amount together. If an existing Stripe
PaymentIntent has a different amount, it is cancelled and detached. The order
returns to draft payment state so the updated amount must be authorized again.
Captured orders reject quantity mutation.

## Checkout amount guarantee

`POST /api/checkout/pay` resolves the cart, reconciles the PaymentIntent to the
persisted checkout amount, and returns that PaymentIntent's amount with its
client secret. The checkout page renders this returned amount.

Immediately before `stripe.confirmPayment`, the checkout page calls the payment
endpoint again. If the amount or PaymentIntent changed, checkout refreshes the
display and requires another submit. Finally,
`POST /api/checkout/authorized` refuses to finalize an authorization unless the
Stripe PaymentIntent amount equals the persisted checkout amount.
