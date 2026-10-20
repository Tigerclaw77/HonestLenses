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
speaks to currently prescribed drugs and biologics. We infer that it does not
automatically exempt contact-lens recall from the marketing rules. The
[HHS marketing guidance](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/marketing/index.html)
and [FTC health-data guidance](https://www.ftc.gov/business-guidance/resources/collecting-using-or-sharing-consumer-health-information-look-hipaa-ftc-act-health-breach)
should be reviewed against the company's actual covered-entity/business-
associate status and data practices. The [Texas Data Privacy and Security Act](https://statutes.capitol.texas.gov/GetStatute.aspx?Code=BC&Date=5%2F31%2F2025&Value=541.001)
requires a business-specific applicability review for sensitive health data.

## Current data and remaining approvals

Existing orders record recipient email and a commercial suppression hash. We
did not find a specific marketing-consent or jurisdiction eligibility record.
An opt-out basis may be permissible for these messages, but the legal basis,
Texas applicability, privacy notice, and source of mailing address require
review before `reorder_recall_compliance_approved_at` can be set. Do not add a
mandatory opt-in checkbox without a legal determination.

The system can see storefront orders and Stripe-linked source payments. Manual
Stripe invoices without storefront orders, such as Victoria West's invoice,
cannot yet be reliably used to suppress a recent-purchase reminder. This is a
material gap for live sending; reconcile such payments or establish a manual
suppression workflow before activation.

Deliverability has only been tested with mocks. Verify a controlled internal
email and stop link before live sending. Review the admin dry run, suppression
reasons, and estimated volume. Explicit founder approval is required before
setting compliance approval or resuming the live sender. An activation timestamp
prevents overdue historical reminders from becoming a catch-up campaign.

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
