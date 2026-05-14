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
