# PostHog Setup

Honest Lenses uses PostHog for product analytics, checkout funnel telemetry,
session replay, dead-click/rage-click detection, and production exception
visibility.

Required Vercel environment variables:

- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`

Optional environment variables:

- `NEXT_PUBLIC_POSTHOG_SESSION_REPLAY=false` disables replay without code changes.
- `NEXT_PUBLIC_POSTHOG_CAPTURE_EXCEPTIONS=false` disables client exception capture.
- `POSTHOG_PROJECT_API_KEY` can be set server-side; otherwise server events use the public project key.

Privacy notes:

- Inputs are masked in session replay.
- Sensitive analytics keys such as email, phone, address, DOB, patient,
  prescriber, doctor, and Rx fields are redacted before capture.
- User stitching identifies by Supabase user ID and email domain only.
- Product/catalog metadata such as lens name, coreId, manufacturer, replacement
  schedule, and modality flags is intentionally allowed because it is not PHI
  and is needed for operational funnel reporting.

Operational dashboard foundations:

- Browse interest: `viewed_product`, `product_modal_opened`,
  `searched_lens`, `viewed_brand`.
- Cart funnel: `added_to_cart`, `cart_quantity_changed`,
  `removed_from_cart`, `checkout_started`.
- Checkout funnel: `checkout_step_timed`, `payment_started`,
  `payment_authorized`, `payment_succeeded`, `payment_failed`,
  `order_success_viewed`.
- Verification funnel: `rx_method_selected`, `rx_upload_started`,
  `rx_upload_completed`, `doctor_info_entered`, `OCR_failed`.
- Recovery operations: `abandoned_checkout`, `abandoned_checkout_detected`,
  `abandoned_checkout_archived`, `recovery_email_drafted`.
