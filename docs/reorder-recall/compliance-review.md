# Easy Reorder recall: release and compliance review

Status on 2026-10-20: **live automated sending remains disabled**. The new
`reorder_recall_compliance_approved_at` field is null by default, and the sender
requires that field, a live activation timestamp, and the existing disabled
`reorder_reminders_enabled` switch. This release does not establish approval.

## Message categories

- Captured-order confirmation and itemized receipt: transactional, sent through
  the existing receipt path. It may carry a permanent Easy Reorder entry URL;
  that URL identifies an order but requires a fresh email authentication step
  before showing patient, address, or prescription data. Historical receipts
  are not resent by this change.
- Replenishment reminder: treat as a **commercial email**. It includes a clear
  Honest Lenses sender, accurate subject, postal address, and a durable stop
  link. The estimate is never described as a certain run-out date.
- Prescription-expiration reminder: also treat as a **commercial recall email**
  pending counsel review. Its subject accurately describes the content. It
  does not include prescription values, patient name, or date of birth; the
  entry link still requires authentication. An expired prescription is never
  presented as valid for a new purchase.

The [FTC CAN-SPAM guidance](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
explains the commercial/transactional distinction and requires truthful
headers and subjects, a physical mailing address, and a working opt-out for
commercial messages. The opt-out mechanism must work for at least 30 days, and
requests must be honored within 10 business days. This implementation honors
the stop action immediately at the recipient hash level.

The [HHS refill-reminder guidance](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/refill-reminders/index.html)
specifically addresses drugs and biologics; it does not itself establish a
contact-lens exception. The broader [HHS marketing guidance](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/marketing/index.html)
also describes exceptions for a covered entity's own health-related products
and treatment communications. Whether either applies here depends on Honest
Lenses' covered-entity/business-associate status, actual relationship to the
patient, purpose and wording of each message, and any PHI disclosure to the
email provider. The [FTC health-data guidance](https://www.ftc.gov/business-guidance/resources/collecting-using-or-sharing-consumer-health-information-look-hipaa-ftc-act-health-breach)
explains that HIPAA status is not assumed for every seller of health products.
The [Texas Data Privacy and Security Act](https://statutes.capitol.texas.gov/Docs/BC/htm/BC.541.htm)
requires a business-specific applicability and sensitive-data review.

## Current data and remaining approvals

Existing orders record recipient email and a commercial suppression hash. We
did not find a specific marketing-consent or jurisdiction eligibility record.
Federal CAN-SPAM does not require opt-in for ordinary commercial email, but it
does require the accurate sender and subject, valid physical postal address,
clear ad identification where applicable, and functioning opt-out. Determine
whether HIPAA applies and whether these exact replenishment and expiration
messages fit a treatment/own-product exception or need authorization. Review
applicable state privacy rules and the notice for use of order/prescription
history. The production postal address field is currently empty. These are
specific activation decisions; no blanket prohibition on reminders was found.
Do not add a mandatory opt-in checkbox without a legal determination.

The system can see storefront orders and Stripe-linked source payments. A paid,
captured, unrefunded manual Stripe invoice now suppresses recall when its Stripe
Customer ID matches the source PaymentIntent's Customer ID and the invoice email
matches the source order email, or its metadata
explicitly names the source order ID. An email/name match alone never merges
customers or proves a purchase. Invoices such as Victoria West's that lack a
stable link still require manual review and suppression using the existing admin
control before activation. Stripe invoice search can lag, so a final operational
review is needed for very recent payments.

Resend accepted one internal test email to support@honestlenses.com on
2026-10-20; inbox arrival remains to be confirmed. Verify valid stop and
postpone links with an authorized internal preference before live sending.
Review the admin dry run, suppression reasons, and estimated volume. Explicit
founder approval is required before setting compliance approval or resuming the
live sender. An activation timestamp prevents overdue historical reminders from
becoming a catch-up campaign.

## Technical safeguards

The scheduler uses one recipient-hash claim for both reminder types. A rolling
30-day database guard prevents simultaneous sends for distinct patients who
share an address. A valid, documented, unsuperseded prescription is required for
expiration copy. Canceled/returned orders, active pending reorders, newer
purchases, synthetic test identities, bounced recipients, opt-outs, and source
payments that cannot be confirmed as captured and unrefunded are suppressed.
Unknown provider outcomes remain claimed and require operator review instead
of an automatic second send. All recall tables remain service-role only under
RLS. The admin preview is read-only and excludes patient and prescription data.
