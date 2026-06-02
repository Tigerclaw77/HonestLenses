# Dashboard Cleanup Plan

Date: 2026-06-02

Goal: make the HonestLenses admin order dashboard answer one operator question: "What do I need to do next?"

No dashboard redesign is implemented in this pass. This plan defines the simplification target.

## Minimum Authoritative States

### PAYMENT

Recommended source of truth:

- Short term: Stripe PaymentIntent plus local `orders.status` as a fallback.
- Long term: add `orders.payment_status` and stop using generic `status` for payment.

Recommended values:

- `draft`: checkout/payment not completed.
- `authorized`: Stripe PaymentIntent is authorized and capturable.
- `captured`: funds captured.
- `refunded`: funds refunded.
- `failed`: payment authorization/capture failed or was canceled.

Notes:

- Do not render Stripe internals (`requires_capture`, `succeeded`, source `stripe/order_fallback`) in the primary card.
- Keep Stripe status and source in an expanded debug/audit panel.

### RX

Recommended source of truth:

- `rx_upload_path` for uploaded-file evidence.
- `rx` for structured prescription data.
- Add or backfill `rx_source`/`rx_input_method` because the current `rx_source` is not written reliably.

Recommended values:

- `none`
- `manual_entry`
- `uploaded_file`
- `ocr_upload`
- `doctor_only`

Notes:

- `rx_status` should not mean "has Rx." It should only mean OCR/validity detail such as `ocr_complete`, `ocr_failed`, `valid`, or `expired`.
- Manual structured Rx must display as entered/manual, not uploaded.
- Doctor-only orders must display as doctor verification, not missing Rx once prescriber information exists.

### VERIFICATION

Recommended source of truth:

- `verification_status`.

Recommended values:

- `not_required`
- `pending`
- `requires_review`
- `verified`
- `passive_verified`
- `doctor_confirmed`
- `rejected`
- `blocked`

Recommended metadata:

- `verification_method`: `upload`, `ocr`, `manual`, `email`, `doctor`, `passive`, `admin`.
- `verification_sent_at`, `passive_deadline_at`, `verification_completed_at` as audit/process fields.

Notes:

- Retire the admin verification booleans after mapping them into `verification_status`.
- `auto_verified`, `manual_verified`, and `ocr_verified` are better as method/source metadata than top-level lifecycle states.
- `altered` currently means verified with a price/quantity change. Consider replacing it with `verification_status=verified` plus an adjustment/reauthorization field.

### ORDERING

Recommended source of truth:

- Short term: `fulfillment_status`.
- Long term: consider a separate `vendor_order_status` only if vendor ordering gains more states than the current fulfillment workflow supports.

Recommended values:

- `not_ready`
- `ready_to_order`
- `ordered`

Notes:

- The operator's primary active action is usually "Place vendor order."
- Do not expose both `READY`, `READY TO ORDER`, and `Fulfillment: READY_TO_ORDER` at the same time.

### FULFILLMENT

Recommended source of truth:

- `fulfillment_status`.

Recommended values:

- `review`
- `ready_to_order`
- `ordered`
- `shipped`
- `completed`
- `hold`
- `cancelled`

Notes:

- `status=shipped` and `status=completed` should be retired as fulfillment fallbacks after data migration.
- Use `fulfillment_status=hold` for operational holds that are not prescription verification problems.

## Next Action Engine

Added helper:

- `src/lib/orders/getNextAction.ts`

Input:

```ts
Order
```

Output:

```ts
{
  label: string;
  severity: "info" | "warning" | "success";
}
```

Current deterministic priority:

1. Archived/complete/cancelled terminal states.
2. Payment failure/refund review.
3. Fulfillment hold.
4. Verification blocked/rejected.
5. Expired or failed OCR prescription.
6. Missing Rx/verification path.
7. Manual prescription review.
8. Pending doctor or prescription verification.
9. Capture payment.
10. Place vendor order.
11. Await shipment.
12. Confirm delivery.

Example outputs:

- `Verify prescription`
- `Review prescription`
- `Await doctor verification`
- `Capture payment`
- `Place vendor order`
- `Await shipment`
- `Order complete`

## Dashboard Cleanup Recommendation

Primary collapsed card should show:

- Customer name.
- Patient name if different.
- Phone.
- Email.
- Shipping address.
- NEXT ACTION with label and severity.
- Compact lifecycle summary: Payment, Rx, Verification, Ordering/Fulfillment.

Expanded card can retain:

- Rx details.
- Uploaded Rx image link when `rx_upload_path` exists.
- Payment and Stripe debug details.
- Prescriber details.
- Internal audit fields.
- Fulfillment controls.
- Admin notes.

Remove from primary card:

- Large badge clusters.
- `Backend: {status}`.
- `Source: stripe/order_fallback/missing_intent`.
- Raw `rx_source`.
- Raw `rx_status` except OCR failed/expired cases that affect next action.
- Simultaneous `stage`, `awaiting`, readiness, actionability, payment badge, Rx badge, path badge, verification badge, fulfillment badge, and flags.

## Customer Card Improvements

Collapsed card target:

- Customer Name.
- Patient Name if different.
- Phone.
- Email.
- Address.

Copy feedback target:

- Show `Copied` for about 1 second after a copy action.
- Apply to email, phone, order id, and payment intent id.
- Current `CopyableValue` copies silently and is only used for parts of the address/email. Extend it or add a shared `CopyButton` with transient state.

## Rx Status Fix Plan

1. Add a shared derivation helper for Rx source:
   - Upload if `rx_upload_path` exists.
   - Manual entry if structured `rx` exists and no upload path exists.
   - Doctor only if prescriber information exists and no upload/structured Rx exists.
   - Missing otherwise.
2. Update checkout uploaded-mode detection so `verification_status=auto_verified` alone does not imply upload.
3. Update admin `orderHasRx` to recognize structured `rx`.
4. Display "Rx uploaded" only when an upload path exists.
5. Display "Rx entered" for manual structured Rx.
6. Display "Doctor verification" for doctor-only orders.
7. Stop relying on current `rx_source` until it is written consistently.

## Checkbox Removal Plan

Phase in this order:

1. Add admin controls that write `verification_status` directly.
2. Backfill existing booleans:
   - `blocked=true` -> `verification_status=blocked`, unless already terminal.
   - `needs_review=true` -> `verification_status=requires_review`, unless already blocked/rejected/verified.
   - `verified=true` -> `verification_status=verified`.
   - `passive_verified=true` -> `verification_status=passive_verified`.
   - `doctor_confirmed=true` -> `verification_status=doctor_confirmed`.
3. Update capture/verification automation to read only `verification_status`.
4. Remove checkbox fields from the dashboard.
5. Drop columns only after a production backfill and a period of read-only compatibility.

## Proposed Operator Workflow

The operator should see one dominant action:

- Missing Rx or doctor path: `Request prescription details`.
- Uploaded/OCR failed or flagged: `Review prescription`.
- Doctor verification pending: `Await doctor verification`.
- Verified but authorized payment: `Capture payment`.
- Captured and verified but not ordered: `Place vendor order`.
- Ordered: `Await shipment`.
- Shipped: `Confirm delivery`.
- Completed: `Order complete`.
- Hold/blocked/rejected/payment issue: show the resolution action.

## Implementation Sequence

1. Wire the new `getNextAction` helper into the admin dashboard primary card.
2. Replace primary badge clusters with NEXT ACTION and the compact lifecycle summary.
3. Normalize Rx source display and fix manual/OCR/doctor labels.
4. Add copy feedback for email, phone, order id, and payment intent id.
5. Replace verification checkboxes with a single verification status control.
6. Add a migration/backfill for checkbox fields and legacy `status`/`rx_source` values.
7. Remove legacy fields from UI first, then from the database only after compatibility reads are no longer needed.

