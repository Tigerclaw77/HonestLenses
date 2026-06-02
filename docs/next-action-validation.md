# Next Action Validation

Date: 2026-06-02

Helper:

- `src/lib/orders/getNextAction.ts`

Validation method:

- Ran the helper with representative order shapes from the audited route writes.
- The fixtures avoid real customer data but use real persisted fields and values discovered in the codebase.
- Command used Node's TypeScript strip mode to import the helper directly.
- Phase 3 also ran read-only Supabase/Stripe validation against recent live orders with shortened IDs and lifecycle fields only.

## Results

| Scenario | Key fields | Payment | Verification | Rx source | NEXT ACTION | Result |
|---|---|---|---|---|---|---|
| Manual Rx | structured `rx`, no upload, `verification_status=auto_verified` | Authorized | Verified | Manual Rx Entry | Capture payment | Pass |
| OCR Upload | `rx_upload_path`, `rx_status=ocr_complete`, structured `rx`, `verification_status=auto_verified` | Authorized | Verified | OCR Upload | Capture payment | Pass |
| Passive Verification | prescriber info, `verification_status=passive_verified` | Authorized | Passive Verified | Doctor Verification Flow | Capture payment | Pass |
| Doctor Confirmation | prescriber info, `verification_status=doctor_confirmed` | Authorized | Doctor Confirmed | Doctor Verification Flow | Capture payment | Pass |
| Vendor Ordered | `payment_status=captured`, `fulfillment_status=ordered`, verified Rx | Captured | Verified | Manual Rx Entry | Await shipment | Pass |
| Ready To Capture | authorized payment, `verification_status=verified`, structured Rx | Authorized | Verified | Manual Rx Entry | Capture payment | Pass |
| Completed Order | captured payment, `fulfillment_status=completed` | Captured | Verified | Manual Rx Entry | Order complete | Pass |
| Doctor Pending | prescriber info, `verification_status=pending` | Authorized | Pending | Doctor Verification Flow | Await doctor verification | Pass |
| Draft No Payment | `status=draft`, no PaymentIntent | Draft | Pending | Missing Rx Path | Await checkout | Pass |
| Cancelled Stripe | Stripe `canceled`, API projection `failed` fallback | Cancelled | Verified | Manual Rx Entry | Review payment | Pass |
| Victoria West real order | `verification_status=pending`, Stripe captured, `fulfillment_status=ordered`, structured Rx, no upload path | Captured | Verified | Manual Rx Entry | Await shipment | Pass |

## Phase 3 Real-Order Scan

The live scan found these lifecycle examples:

| Scenario found | Raw state | Projected state | NEXT ACTION |
|---|---|---|---|
| Draft | `status=draft`, `verification_status=auto_verified`, `fulfillment_status=review` | Draft payment, Verified Rx, OCR Upload | Await checkout |
| Locally authorized but Stripe captured | `status=authorized`, `verification_status=pending`, `fulfillment_status=ordered`, Stripe `succeeded` | Captured payment, Verified, Manual Rx Entry | Await shipment |
| Captured and completed | `status=captured`, `verification_status=auto_verified`, `fulfillment_status=completed`, Stripe `succeeded` | Captured payment, Verified, OCR Upload | Order complete |

No distinct live examples were found in the scanned set for `passive_verified` or cancelled orders.

## Mismatches Found And Fixed

- Checkbox flags could previously make NEXT ACTION skip verification even when `verification_status` was still pending. NEXT ACTION now uses `getVerificationState(order)`.
- Manual structured Rx without an upload could previously be treated like missing Rx in dashboard actionability. Rx evidence now includes structured Rx.
- Draft/no-intent orders could previously display as failed payment. They now display as Draft and next action is Await checkout.
- Stripe/local cancelled payment could previously display as Failed. It now displays as Cancelled and next action is Review payment.
- Victoria West could previously show Verify prescription after payment capture and vendor ordering because local `verification_status` was stale. Downstream captured/vendor-order evidence now prevents that false next action.

## Remaining State Conflicts

- The current capture route allows capture only for `verification_status=verified` or `altered`. Recommended states such as `passive_verified` and `doctor_confirmed` should be migrated or added to the capture gate before they become fully authoritative in backend automation.
- `rx_source` is still not reliably written. The helper derives Rx source from upload path, structured Rx, OCR detail, and prescriber info until a real source field is backfilled.
- There is no stored original quantity versus intended fulfillment quantity split. NEXT ACTION avoids quantity inference.
- Local `orders.status` can remain stale after Stripe capture. The admin API's Stripe projection is still required for payment truth.
