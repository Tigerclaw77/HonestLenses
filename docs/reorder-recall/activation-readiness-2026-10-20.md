# Recall activation readiness — 2026-10-20

## Production dry run

Read-only production inspection at 2026-10-20 17:38 UTC. The horizon is the
next 30 days. The live sender remains disabled.

| Measure | Count |
| --- | ---: |
| Eligible recipients | 0 |
| Scheduled reminders | 0 |
| Suppressed recipients | 0 |
| Expected customer emails in next 30 days | 0 |
| Sent reminders | 0 |
| Delivery failures | 0 |
| Reminder conversions | 0 |

There are no `reorder_reminder_preferences`, recipient claims, or commercial
suppression records in production. Thus there are no suppression reasons to
itemize. Zero volume reflects absent scheduled preferences, not proof that
historical customers are ineligible. Do not backfill historical reminders as
part of activation.

`order_operations_control` has `reorder_reminders_enabled=false`, null live
activation and compliance approval timestamps, and an empty postal address.

## Safeguard and delivery checks

- One email addressed only to `support@honestlenses.com`, with marker
  `INTERNAL_RECALL_DELIVERABILITY_20261020`, was accepted by Resend as
  `01a15a62-76dc-7848-bbc8-dc7fda5f83f4`. Inbox arrival is pending
  confirmation. It contained no customer, order, or prescription data.
- The stop and postpone routes passed isolated tests with mocked records:
  valid token updates the preference, stop inserts an address-level suppression,
  postpone after stop is rejected, and invalid tokens are rejected. A live
  end-to-end control test needs an authorized internal preference; none exists.
- Admin recall UI is present under `/admin/orders` and its API requires existing
  admin authentication. The production browser redirected to login, so a visual
  authenticated-session review is pending.
- Manual Stripe invoices suppress recall only when captured and unrefunded and
  linked by both source PaymentIntent Customer ID and recipient email, or explicit source order
  metadata. Email or name alone is insufficient. Invoices without a stable
  link need manual review and the existing admin suppress action.

## Activation steps

1. Confirm the internal email arrived, including spam-folder check if needed.
2. Review the authenticated admin recall panel and dry-run response with an
   existing admin session. Verify the pause/resume/suppress controls without
   clicking Resume.
3. Perform a live stop/postpone test only after an authorized internal
   preference exists. Do not create a captured synthetic production order.
4. Determine whether Honest Lenses is a HIPAA covered entity/business associate,
   whether these exact messages qualify for treatment/own-product exceptions or
   need authorization, and whether Texas/other applicable privacy rules require
   notice or consent. Confirm a valid postal address and the final message copy.
5. Review unmatched manual invoices, including any relevant to would-be
   recipients, and manually suppress recipients lacking a stable Stripe link.
6. Re-run the 30-day admin dry run after any new real captured orders schedule
   preferences; check counts and reasons. Set the compliance approval field and
   activation timestamp only after the founder approves customer sending.

No production orders, payments, prescriptions, or customer data were changed.
