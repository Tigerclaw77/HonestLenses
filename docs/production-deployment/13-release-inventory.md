# Release-candidate inventory and classification

Review scope: the 91 freeze-review entries (67 tracked changes and 24
untracked paths), plus `src/proxy.ts` and `.gitattributes`, which were added
solely to close the confirmed write-drain blocker and make documented SHA-256
values reproducible after checkout. Nested files under every untracked
directory were reviewed individually before staging.

Classification meanings:

- `INCLUDE`: intentional release content.
- `GENERATED ARTIFACT`: reproducible release document retained intentionally.
- `TEMPORARY/DELETE`: unwanted or obsolete content whose deletion is part of
  the release.
- `EXCLUDE`: must not be staged.
- `REQUIRES REVIEW`: unresolved and therefore blocks staging.

Final result: no `EXCLUDE` or `REQUIRES REVIEW` entry remains. Credential,
production-URL, log, PID, browser-profile, and temporary-output scans found no
artifact to stage.

## Tracked modifications — INCLUDE

Every path below is an intentional security, authorization, operational
compatibility, or release-control change:

```text
.env.example
next.config.ts
package.json
src/app/admin/layout.tsx
src/app/admin/orders/page.tsx
src/app/api/abandonment-feedback/shown/route.ts
src/app/api/abandonment-feedback/submit/route.ts
src/app/api/admin/abandoned-checkouts/[id]/route.ts
src/app/api/admin/orders/[id]/route.ts
src/app/api/admin/orders/adjust-capture-amount/route.ts
src/app/api/admin/orders/adjust-order-quantity/route.ts
src/app/api/admin/orders/route.ts
src/app/api/armory/orders/route.ts
src/app/api/cart/has-items/route.ts
src/app/api/cart/resolve/route.ts
src/app/api/cart/route.ts
src/app/api/checkout/authorized/route.ts
src/app/api/checkout/pay/route.ts
src/app/api/order-recovery/email/route.ts
src/app/api/orders/[id]/archive/route.ts
src/app/api/orders/[id]/cancel/route.ts
src/app/api/orders/[id]/rx-ocr/route.ts
src/app/api/orders/[id]/rx/route.ts
src/app/api/orders/[id]/shipping/route.ts
src/app/api/orders/[id]/verify/route.ts
src/app/api/orders/list/route.ts
src/app/api/orders/route.ts
src/app/api/resolve-lens/route.ts
src/app/api/verification/complete/route.ts
src/app/api/verification/details/route.ts
src/app/api/verification/process/route.ts
src/app/api/verification/send/route.ts
src/app/auth/callback/AuthCallbackClient.tsx
src/app/checkout/page.tsx
src/app/checkout/verification-details/VerificationDetailsClient.tsx
src/app/login/LoginClient.tsx
src/app/order/[id]/page.tsx
src/app/order/[id]/receipt/route.ts
src/app/resume-order/accept/route.ts
src/components/RxForm.tsx
src/lib/admin-auth.ts
src/lib/email.ts
src/lib/get-user-from-request.ts
src/lib/internal-auth.ts
src/lib/order-access.ts
src/lib/order-recovery.ts
src/lib/orders/customerOrder.ts
src/lib/orders/operationalQueue.matrix.ts
src/lib/orders/operationalQueue.ts
src/lib/posthog/config.ts
```

## Tracked deletions — INCLUDE

These obsolete, duplicate, debug, test, or bypass-prone surfaces are
intentionally absent from the release:

```text
src/app/api/checkout/capture/route.ts
src/app/api/checkout/price/route.ts
src/app/api/orders/[id]/capture/route.ts
src/app/api/orders/[id]/pay/route.ts
src/app/api/orders/[id]/price/route.ts
src/app/api/orders/[id]/reauthorize/route.ts
src/app/api/orders/[id]/resolve/route.ts
src/app/api/orders/[id]/rx-confirm/route.ts
src/app/api/orders/[id]/status/route.ts
src/app/api/orders/update-verification-details/route.ts
src/app/api/test-resolver/route.ts
src/app/api/verification/request/route.ts
src/app/debug/orders/page.tsx
src/app/debug/rx/page.tsx
src/app/test-lens/page.tsx
supabase/migrations/20260721000000_resend_email_delivery_tracking.sql
```

The Resend file deletion is paired with the correctly versioned
`20260721143337_resend_email_delivery_tracking.sql`, matching hosted migration
history.

## Tracked deletion — TEMPORARY/DELETE

```text
src/components/RxForm copy.tsx
```

This was an accidental duplicate component. Its removal, not its content, is
part of the release.

## Initial untracked paths — INCLUDE

```text
docs/commerce-v2-architecture-audit-2026-07-29.md
docs/hosted-preproduction-validation-2026-07-29.md
docs/pre-cutover-architecture-security-maintainability-audit-2026-07-29.md
docs/production-deployment/
docs/production-schema-baseline-migration-recovery-runbook-2026-07-29.md
docs/security-gate-validation-2026-07-29.md
docs/security-remediation-and-re-audit-2026-07-29.md
scripts/security/
src/app/admin/system-health/
src/app/api/admin/system-health/
src/app/api/internal/
src/app/api/webhooks/stripe/
src/lib/auth/
src/lib/commerce-v2/
src/lib/email/html.ts
src/lib/orders/adminWorkflow.test.ts
src/lib/orders/adminWorkflow.ts
src/lib/payments/legacyPaymentCommands.ts
src/lib/security/
supabase/migrations/20260721143337_resend_email_delivery_tracking.sql
supabase/migrations/20260729144510_create_commerce_v2_phase1.sql
supabase/migrations/20260729160750_security_remediation_least_privilege.sql
supabase/validation/
```

## Initial untracked path — GENERATED ARTIFACT

```text
output/
```

Its only release file is the reproducible founder checklist PDF generated by
`scripts/security/generate-founder-checklist-pdf.py`. The rendered PDF was
visually inspected.

## Blocker-closure paths — INCLUDE

```text
src/proxy.ts
.gitattributes
```

These are the only additional top-level status entries created after the
initial 91-entry inventory. Other blocker-closure files live under
already-classified `docs/production-deployment/`, `scripts/security/`, and
`src/lib/security/`.

## Cleanup disposition

- Repository PDF-rendering intermediates: deleted.
- Disposable PostgreSQL instances/data directories: stopped and deleted by
  their gates.
- Downloaded PostgreSQL archive: deleted after checksum and extraction.
- Pinned PostgreSQL client installation: retained outside the repository.
- Matching browser-validation process: none found; unrelated user/Codex
  browser and Node processes were not touched.
