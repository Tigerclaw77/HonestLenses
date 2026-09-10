# Admin receipt actions

The order details modal contains **Customer receipts**, immediately after customer/shipping information. A captured order with a customer email exposes **Send Receipt** and **Send Itemized Receipt**. Each asks for confirmation of the destination; itemized confirmation notes that stored lens details are included. Both buttons disable while sending. The server independently verifies payment ownership, successful capture, refunds/disputes, and financial reconciliation. The recipient always comes from the order, never request input.

Each type displays its most recent successful admin send timestamp from `order_events`. “Sent” means Resend accepted the message; it does not promise inbox delivery. Reopen order details to reload another operator's send history. The existing delivery ledger/webhook continues to track delivery outcomes.

## Infrastructure reused

- `buildCustomerOrderEmail`: existing order-confirmation template now has a paid-receipt variant, with the current customer, order date/number, captured total, payment status, and existing order link. Checkout confirmation behavior remains unchanged.
- `buildReceiptSnapshot`, authoritative adjusted OD/OS quantities, SKU pack-size/catalog pricing, and `getCaptureAmountCents`: the canonical paid receipt calculations.
- `order_receipt_snapshots`: immutable capture facts are compared with the current order when present. Prescription details are not added to these minimized snapshots or their public receipt links.
- `sendEmail`: existing Resend client, Honest Lenses support sender and reply-to identity, provider idempotency keys, and transactional delivery ledger. A ledger-only option avoids updating the order summary during the admin send.
- `requireAdminUser`: existing server-validated administrator and mutation-origin protection, registered in the route authorization inventory.
- `order_events`: append-only request/outcome audits, actor, type, request ID, provider ID, amount, currency, and send time. Rx values and message bodies are not logged.

The automatic confirmation service and historical snapshot reconstruction can write order fields. Admin resends deliberately do not invoke those writers. Their only Stripe operation is retrieval with the latest charge expanded. Implementation/tests do not perform live Stripe calls or send customer email.

## Itemization and reconciliation

The current canonical order is a single purchased SKU with OD/OS quantities, including approved quantity adjustments. The itemized email lists one row per purchased eye with product name, pack size, box count, price per box, and line amount. It includes stored sphere, cylinder, axis, add, base curve, and diameter, preserving zero values and omitting unavailable optional values. Conflicting eye product identities are rejected.

All arithmetic uses integer cents:

`merchandise = canonical price per box × final total boxes`

`stored order total = merchandise + shipping + tax`

`approved final amount = capture_amount_cents, or canonical checkout amount including feedback credit`

`discount / approved adjustment = Stripe amount_received − merchandise − shipping − tax`

The captured amount must equal the approved final amount. Every persisted snapshot line, monetary component, currency, and order number must also match. Customer identity and stored lens details are read from the current order. Unsupported historical pricing, missing order numbers, mismatched quantities/totals, refunded/disputed charges, and unavailable provider facts fail closed. No values are fabricated and no historical records are repaired by sending a receipt.

## Duplicate and failure handling

Production migration `20260910141625_admin_receipt_actions.sql` was applied on September 10, 2026 using the connected Supabase migration API. Its local filename matches the recorded remote version. The migration executor owns the transaction; lock and statement timeouts are bounded. It adds a service-role-only, security-invoker function and a scoped audit index; no new receipt/delivery table is introduced. The function takes a transaction advisory lock per order, records the request atomically, rejects request replays, prevents concurrent sends of the same type, and enforces a 60-second interval. Different receipt types may be sent independently.

Explicit provider rejection (selected 4xx responses) produces a failure audit and permits a new confirmed request after the interval. Network errors, 5xx responses, unknown acceptance, process interruption, or missing completion audits keep the request blocked indefinitely. Resend idempotency is an additional safeguard, not an expiring replacement for the database claim.

For a blocked uncertain request, review the existing request audit and Resend delivery evidence. Do not blindly retry or delete the request. After establishing the outcome, an operator must record the matching `admin_receipt_sent` or `admin_receipt_failed` event with the original `request_id` and `receipt_type`; a successful event also needs `sent_at` and `email_id`. Such production audit correction is a separate scoped operation. No automatic retry can create a second message after provider idempotency expires.

## Validation

- `npm test` includes `test:admin-receipts`, which forbids real network access, uses synthetic order/payment records, and mocks Resend/ledger calls.
- `npm run test:admin-receipts:database` uses a disposable local embedded PostgreSQL cluster with synthetic records to exercise actual concurrent SQL claims, RLS/grants, request replay, cooldown, pending-outcome protection, and order/Rx immutability. On Windows it may need execution outside the sandbox because `initdb` creates a restricted process token.
- Run `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
- This workspace has an existing nested build under `output/order-rx-receipt-fix/.next` that unqualified lint includes. `npm run lint -- --ignore-pattern 'output/**'` checks the source without linting those generated artifacts.

The founder subsequently authorized the production migration and deployment. Migration verification found identical before/after checksums for 582 orders, two receipt snapshots, two access tokens, 36 delivery records, and 115 audit events; dormant Commerce v2 order/payment tables and legacy order items remained empty. A production READ ONLY transaction exercised both claim types through their expected audit insertion and rejected every write. `node --env-file=.env.local --import tsx scripts/receipt-production-readiness.ts` reconciled both existing snapshots with read-only Stripe retrievals and rendered four emails in memory. It enforces GET-only network access and never imports the email sender.

No customer email or Stripe/payment mutation is authorized for release validation. The existing Security Advisor leaked-password-protection warning is unrelated to the new function/index and was not changed by this release. See the [Supabase Auth password-protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
