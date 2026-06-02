# Order State Audit

Date: 2026-06-02

Scope: the HonestLenses order lifecycle fields used by the customer checkout, verification routes, admin order dashboard, abandoned checkout tooling, and related docs.

Primary files audited:

- `src/app/admin/orders/page.tsx`
- `src/app/api/admin/orders/route.ts`
- `src/app/api/admin/orders/[id]/route.ts`
- `src/app/api/admin/abandoned-checkouts/[id]/route.ts`
- `src/app/api/checkout/pay/route.ts`
- `src/app/api/checkout/authorized/route.ts`
- `src/app/api/checkout/capture/route.ts`
- `src/app/api/orders/route.ts`
- `src/app/api/orders/[id]/*`
- `src/app/api/verification/*`
- `src/components/RxForm.tsx`
- `src/lib/ops/abandonedCheckout.ts`
- `src/lib/ops/orderFlags.ts`
- `docs/admin-orders-workflow.sql`
- `docs/commerce.md`

## Executive Findings

The current dashboard is noisy because it renders multiple overlapping state systems at once:

- `status` is the closest thing to a payment spine, but it also carries historical order lifecycle values like `pending`, `paid`, `shipped`, and `completed`.
- `payment_status` is not a persisted order field in current code. It is derived in the admin API from Stripe or from `status`.
- `fulfillment_status` is the authoritative admin fulfillment workflow, but it can conflict with `status` because there is no synchronization between them.
- `verification_status` is the authoritative prescription verification state for backend enforcement, but admin checkboxes can override the dashboard's interpretation without updating `verification_status`.
- `rx_status`, `rx_source`, `rx_upload_path`, and structured `rx` are conflated. Upload evidence, OCR processing, Rx validity, manual entry, and doctor-only verification should be separate concepts.
- `archived` and `archived_at` overlap. `archived_at` is the better authoritative field.
- The admin booleans `needs_review`, `verified`, `passive_verified`, `doctor_confirmed`, and `blocked` are persisted and functional in the dashboard, but they are not authoritative for backend capture or verification jobs.

## Field Audit

| Field name | Possible values observed or implied | Where it is written | Where it is read | Business meaning | Displayed in UI? | Safe to remove? | Overlaps with |
|---|---|---|---|---|---|---|---|
| `status` | `draft`, `authorized`, `captured`, `cancelled`, legacy `pending`, legacy `paid`; UI/fallback reads also expect `shipped`, `completed`, `refunded`, `failed`; `/api/orders/[id]/status` can write arbitrary values | Created as `draft` in `src/app/api/orders/route.ts`; set to `authorized` or `captured` in `src/app/api/checkout/authorized/route.ts`; set to `captured` in capture and verification routes; set to `cancelled` in cancel/rejected verification routes; legacy `paid` in `src/app/api/checkout/capture/route.ts`; arbitrary in `src/app/api/orders/[id]/status/route.ts` | Checkout, order detail page, admin grouping, admin payment fallback, abandoned checkout classifier, verification jobs, cart and pricing guards | Currently acts as payment/order spine, but is overloaded | Yes, as "Backend" and through derived stage/payment/fulfillment | No. Keep short term, but rename or narrow to payment state long term | `payment_status`, `fulfillment_status`, `archived`, Stripe status |
| `payment_intent_id` | `null` or Stripe PaymentIntent id | Checkout pay routes; reauthorize route; reset to `null` when existing intent is invalid | Admin payment derivation, checkout authorization, capture/cancel routes, abandoned checkout, recovery/delete guards | Link to Stripe authorization/capture authority | Yes, in expanded Payment/Stripe panel | No | `status`, `payment_status`, Stripe PaymentIntent |
| `payment_status` | `authorized`, `captured`, `refunded`, `failed` | Not persisted in current code. Added to admin response by `src/app/api/admin/orders/route.ts` | Admin dashboard normalization and badges | Display-only projection of Stripe PaymentIntent or fallback from `status` | Yes | Safe to remove as a stored field if one exists. Keep as response projection until a real payment state exists | `status`, Stripe PaymentIntent |
| `stripe_payment_intent_status` | Stripe statuses such as `requires_capture`, `succeeded`, `requires_payment_method`, `canceled` | Not persisted. Added to admin response by Stripe retrieve call | Admin Payment/Stripe panel | Debug/audit detail from Stripe | Yes, expanded only | Safe from primary dashboard. Keep in debug/audit detail | `payment_status`, `status` |
| `payment_status_source` | `stripe`, `order_fallback`, `missing_intent` | Not persisted. Added to admin response | Admin Payment/Stripe panel | Explains whether payment display came from Stripe or fallback | Yes, expanded only | Safe from operator UI; useful debug-only | `payment_status` |
| `capture_amount_cents` | `null` or positive amount <= `total_amount_cents` | Admin adjust capture amount route; SQL in `docs/capture-amount-adjustment.sql` | Capture routes, admin payment adjustment panel | Operational capture adjustment, not lifecycle | Yes, in payment panel and amount summary | No, but do not treat as status | `total_amount_cents`, Stripe capture amount |
| `capture_adjustment_reason`, `capture_adjusted_by`, `capture_adjusted_at` | Freeform reason from fixed UI list, admin identifier, timestamp | Admin adjust capture amount route | Admin payment adjustment panel | Audit metadata for amount adjustment | Yes, expanded panel | No, but keep audit-only | Payment/capture display |
| `fulfillment_status` | `review`, `ready_to_order`, `ordered`, `shipped`, `completed`, `hold`, `cancelled` | Admin PATCH route; default/check constraint in `docs/admin-orders-workflow.sql` | Admin dashboard stage, timeline, queue bucketing, fulfillment controls | Current authoritative admin fulfillment workflow | Yes | No. Keep and formalize | `status` values `shipped`, `completed`, `cancelled` |
| `verification_status` | Written: `pending`, `auto_verified`, `flagged`, `requires_review`, `verified`, `altered`, `rejected`; read-only/legacy expected: `ocr_verified`, `upload_verified`, `manual_verified`, `passive_verified`, `doctor_confirmed`, `blocked` | Rx form route, OCR route, checkout authorized route, verification send/process/complete routes, admin verify route | Checkout gates, cart resolve, capture route, verification cron, admin verification summary, customer order page, operational flags | Closest current source of truth for prescription verification | Yes | No. Keep, but collapse values and retire checkbox overrides | `verified`, `passive_verified`, `doctor_confirmed`, `blocked`, `needs_review`, `verification_passed` |
| `verification_passed` | Boolean | Set to `true` by verification process cron | Legacy checkout capture route | Legacy capture gate | No | Yes after confirming no active `pending` checkout flow remains | `verification_status=verified` |
| `verification_requested_at` | Timestamp | `/api/verification/request` | Not meaningfully displayed in dashboard | Audit event for verification request | No | Keep only if audit/compliance needs it | `verification_sent_at`, order events |
| `verification_sent_at` | Timestamp | `/api/verification/send` | Verification send route uses it to prevent duplicates | Doctor/passive verification email sent timestamp | No primary display | Keep as audit/process field | `verification_method`, `passive_deadline_at` |
| `passive_deadline_at` | Timestamp | `/api/verification/send` via `calculate_passive_deadline` RPC | Verification cron, operational flags, checkout success messaging | Deadline for passive verification | Not in admin primary card | Keep and surface only when next action depends on it | `verification_status=pending`, `passive_verified` |
| `verification_completed_at` | Timestamp | Verification complete/process routes | Not meaningfully displayed | Completion audit timestamp | No | Keep audit-only | `verification_status` |
| `verification_method` | `active`, `email` currently written; passive implied by process route | Verification complete/send routes | Not primary admin UI | How verification was requested/completed | No | Keep audit-only or replace with `verification_source` | `verification_status`, checkbox flags |
| `rx` | Structured JSON with right/left eye parameters, expiration, optional OCR raw text fields | Manual/OCR confirmation route and OCR upload route | Cart resolve, admin Rx details, order/customer detail | Authoritative structured prescription data | Yes, Rx panels and collapsed lines | No | `rx_status`, `rx_source`, `rx_upload_path` |
| `rx_upload_path` | Storage path like `rx/{orderId}/rx_{timestamp}.{ext}` | OCR upload route | Admin image preview, checkout uploaded detection, abandoned delete cleanup, Rx mode classifier | Authoritative evidence that a file was uploaded | Yes | No | `rx_source`, `rx_status=uploaded`, checkout uploaded mode |
| `rx_status` | Written: `ocr_complete`, `ocr_failed`, `valid`, `expired`; display-derived: `uploaded`, `none` | OCR route writes OCR result; Rx confirm route writes validity | Admin normalized Rx status and badge; Rx details indirectly | Mixed field: OCR processing result plus prescription validity | Yes | Do not use as lifecycle state. Split before removal | `rx_upload_path`, `rx`, `verification_status` |
| `rx_source` | Read as `upload`, `ocr`; likely legacy values include manual/structured but no current writes found | No current writes found in audited code | Checkout uploaded-mode helper, abandoned checkout classifier, `/api/orders/[id]/rx` preservation logic, admin Internal/Audit panel | Intended Rx input method, but currently stale/legacy | Yes, expanded Internal/Audit | Yes after replacement with an authoritative Rx source/method field | `rx_upload_path`, structured `rx`, `verification_status` |
| `rx_lens_brand`, `rx_expiration_date`, `rx_patient_name`, `rx_*` confirm fields | Strings/timestamps/booleans; `rx_is_expired` boolean | `/api/orders/[id]/rx-confirm` | Admin lens display fallback and internal details | User-confirmed Rx metadata, not lifecycle by itself | Some fields displayed indirectly | Keep as data; do not render as lifecycle badges | `rx`, `rx_status` |
| `prescriber_name`, `prescriber_email`, `prescriber_phone` | Text or null | Manual Rx route for OCR metadata, verification details routes | Admin path detection, verification email, abandoned checkout classifier, checkout email | Evidence of doctor verification path | Yes | No | `rx_source=doctor`, `verification_status=pending` |
| `archived` | Boolean | Archive routes and abandoned checkout archive action | Admin fetch/actionability, abandoned classifier | Operator/archive hiding flag | Not as a badge, but affects queues | Migrate away after backfill to `archived_at` | `archived_at`, abandoned checkout |
| `archived_at` | Timestamp or null | Archive routes and abandoned checkout archive action | Admin fetch/actionability, abandoned classifier | Better archive authority because it records when | Not as primary badge | No. Prefer this over `archived` | `archived` |
| `needs_review` | Boolean | Admin checkbox PATCH only | Admin summary/actionability/timeline | Manual admin attention flag | Yes, checkbox and badges | Yes after mapping to `verification_status=requires_review` or a general `hold_reason` | `verification_status=requires_review`, `blocked` |
| `verified` | Boolean | Admin checkbox PATCH only | Admin verification summary and completion logic | Manual admin override that marks verification complete in UI only | Yes, checkbox and badges | Yes after mapping to `verification_status=verified` | `verification_status`, capture route verification gate |
| `passive_verified` | Boolean | Admin checkbox PATCH only | Admin verification summary and completion logic | UI-only passive verification override | Yes | Yes after mapping to `verification_status=passive_verified` | `verification_status`, `passive_deadline_at` |
| `doctor_confirmed` | Boolean | Admin checkbox PATCH only | Admin verification summary and completion logic | UI-only doctor confirmation override | Yes | Yes after mapping to `verification_status=doctor_confirmed` | `verification_status`, `verification_method` |
| `blocked` | Boolean | Admin checkbox PATCH only | Admin verification blocked/actionability logic | UI-only block flag | Yes | Replace with `verification_status=blocked` or `fulfillment_status=hold` plus reason | `verification_status=rejected/blocked`, `needs_review`, `fulfillment_status=hold` |
| `admin_notes` | Text | Admin notes modal PATCH | Admin details | Operator notes | Yes | No, but not lifecycle | `needs_review`, `blocked` if notes explain why |
| `abandoned_checkout` | Derived object with `isAbandoned`, reasons, `rxMode` | Derived in admin API from `src/lib/ops/abandonedCheckout.ts` | Admin abandoned section | Queue classification for draft/stale orders | Yes, abandoned section | Not persisted; keep derived | `archived`, `status=draft`, `payment_intent_id`, `rx_source`, `rx_upload_path` |

## Authoritative Versus Redundant

Authoritative today:

- Payment: Stripe PaymentIntent plus local `status` fallback.
- Rx file evidence: `rx_upload_path`.
- Structured Rx details: `rx`.
- Verification backend gate: `verification_status`.
- Fulfillment/admin progression: `fulfillment_status`.
- Archive visibility: `archived_at` and legacy `archived`.

Redundant or display-only today:

- `payment_status`, `stripe_payment_intent_status`, and `payment_status_source` are admin response projections.
- `rx_status=uploaded` is display-derived, not persisted.
- `rx_source` is read but no current writes were found, so it is not authoritative.
- `verification_passed` is a legacy boolean duplicate of `verification_status`.
- The five admin verification checkboxes duplicate or conflict with `verification_status`.

Conflicting today:

- `status=captured` can coexist with `fulfillment_status=review`, which is normal, but `status=shipped/completed` is still read as a fulfillment fallback. That makes `status` and `fulfillment_status` competing lifecycle sources.
- Admin checkbox `verified=true` can make the dashboard consider an order verified while backend capture still rejects it unless `verification_status` is `verified` or `altered`.
- Admin checkbox `blocked=true` can make the dashboard block an order while backend verification/capture jobs do not know it is blocked.
- Manual structured Rx can have `verification_status=auto_verified` before checkout, causing checkout UI to classify it like uploaded verification, while checkout finalization only treats `rx_upload_path` as uploaded.
- Admin `orderHasRx` ignores structured `rx`, so a manual Rx may display as `Rx: none` or `No verification path` even when structured Rx data exists.

## Rx Status Correction

Current behavior by source:

- OCR upload: `/api/orders/[id]/rx-ocr` writes `rx_upload_path`, structured `rx`, `rx_status=ocr_complete` or `ocr_failed`, and `verification_status=auto_verified` or `pending`. It does not write `rx_source`.
- Manual entry: `src/components/RxForm.tsx` posts structured `rx` to `/api/orders/[id]/rx`. That route writes `rx`, `sku`, `verification_status`, patient/prescriber metadata, but does not write `rx_status`, `rx_source`, or `rx_upload_path`.
- Doctor information only: verification details routes write patient and prescriber fields, then send a verification email and leave `verification_status=pending`. There is no upload and usually no structured Rx.

Incorrect or risky mappings:

- `src/app/checkout/page.tsx` treats `verification_status=auto_verified` as uploaded mode. Manual entry can create `auto_verified` without any upload.
- `src/app/admin/orders/page.tsx` derives `Rx uploaded` from `rx_upload_path`/`rx_status`, but does not count structured manual `rx` as Rx evidence.
- `src/lib/ops/abandonedCheckout.ts` has a useful `structured_rx` mode, but the admin dashboard's primary Rx helpers do not use the same distinction.
- `rx_source` is not written in current code, so any UI relying on it is reading legacy/stale data.

Recommended correction:

- Add or backfill a single Rx source field with values like `none`, `manual_entry`, `uploaded_file`, `ocr_upload`, `doctor_only`.
- Until that exists, derive Rx source consistently:
  - `rx_upload_path` present: uploaded file/OCR.
  - structured `rx` with eye `coreId`: manual or OCR-confirmed structured Rx. If `rx_upload_path` is absent, label it manual/entered, not uploaded.
  - prescriber info with no structured Rx and no upload: doctor verification only.
  - no upload, no structured Rx, no prescriber: missing Rx path.
- Recast `rx_status` as processing/validity detail only: `ocr_complete`, `ocr_failed`, `valid`, `expired`.

## Checkbox Audit

| Checkbox | Functional? | Persisted? | Authoritative? | Duplicates `verification_status`? | Recommendation |
|---|---:|---:|---:|---:|---|
| `Needs review` | Yes. PATCH works and dashboard reads it | Yes | UI-only | Yes, overlaps `requires_review` and `flagged` | Replace with `verification_status=requires_review` or a general `hold_reason` |
| `Verified` | Yes | Yes | UI-only; backend capture ignores it | Yes | Replace with `verification_status=verified` |
| `Passive verified` | Yes | Yes | UI-only | Yes | Replace with `verification_status=passive_verified` and keep `passive_deadline_at` audit |
| `Doctor confirmed` | Yes | Yes | UI-only | Yes | Replace with `verification_status=doctor_confirmed` or `verified` plus `verification_method=doctor` |
| `Blocked` | Yes | Yes | UI-only | Yes, overlaps `rejected`/`blocked` and `hold` | Replace with `verification_status=blocked` for Rx issues or `fulfillment_status=hold` for operational holds |

The checkboxes are functional and persisted, but they should not remain separate authoritative fields. They currently create states the operator can see but payment/capture automation cannot enforce.

