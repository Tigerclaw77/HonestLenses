# Quantity Truth Audit

Date: 2026-06-02

Scope:

- `src/app/admin/orders/page.tsx`
- `src/app/cart/page.tsx`
- `src/app/api/cart/resolve/route.ts`
- `src/app/api/orders/[id]/resolve/route.ts`
- `src/app/api/orders/[id]/price/route.ts`
- `src/app/api/admin/orders/adjust-capture-amount/route.ts`
- `src/lib/shipping.ts`
- `src/lib/payments/captureAmount.ts`

## Fields

| Field | Meaning today |
|---|---|
| `right_box_count` | Current right-eye box count written by cart/resolve flows |
| `left_box_count` | Current left-eye box count written by cart/resolve flows |
| `total_box_count` | Current total boxes written alongside side counts |
| `box_count` | Legacy/general total box count and pricing input |
| `od_box_count`, `os_box_count` | Dashboard-only legacy names; no current writes found in audited routes |
| `capture_amount_cents` | Capture amount adjustment, not quantity |

## Current Truth Model

The best current fulfilled-quantity display is:

1. `total_box_count` or `box_count` as stored total.
2. `right_box_count` and `left_box_count` as side-count detail.
3. Sum of side counts only when stored total is missing.

There is no separate persisted field for original ordered quantity versus intended fulfilled quantity.

## 4 Boxes To 1 Box Question

If an order is changed from 4 boxes to 1 box by changing only `capture_amount_cents`, the dashboard cannot truthfully display 1 box. The amount adjustment proves a lower capture amount, not a new fulfillment quantity.

The dashboard should show:

- Stored quantity: still 4 boxes, if the quantity fields still say 4.
- Capture adjustment: lower capture amount and reason, such as `Quantity correction`.

To display 1 box safely, either:

- Update the existing quantity fields as part of the order modification, while retaining an audit trail, or
- Add explicit fulfillment-intent fields, such as `fulfillment_right_box_count`, `fulfillment_left_box_count`, `fulfillment_total_box_count`, plus original quantity audit fields.

## Changes Made

- Added `formatFulfillmentQuantity(order)` in `src/app/admin/orders/page.tsx`.
- Dashboard now reads `right_box_count` and `left_box_count` before legacy `od_box_count` and `os_box_count`.
- Dashboard now displays total boxes plus side counts, for example `4 boxes (OD 2 / OS 2)`.
- Dashboard now marks count mismatches as `count conflict` when side-count total and stored total disagree.

## UI Lies Removed

- The collapsed card no longer displays a matching per-eye count as total quantity. Example: OD 2 and OS 2 no longer renders as `2 bx`; it renders as `4 boxes (OD 2 / OS 2)`.
- The archive details no longer use only `total_box_count ?? box_count`; they use the same dashboard quantity formatter.
- Capture amount adjustments are no longer implicitly treated as quantity truth.

## Recommendation

Keep current display fix in place, but do not infer fulfillment quantity from price or capture amount. For future order modifications, persist original quantity and intended fulfillment quantity separately.
