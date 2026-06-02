# Quantity Truth Next Steps

Date: 2026-06-02

Scope:

- `box_count`
- `left_box_count`
- `right_box_count`
- `total_box_count`
- `capture_amount_cents`

No schema changes are implemented in this pass.

## Current Meaning

The quantity fields currently represent order/cart quantity at the time the order is priced and submitted. They do not reliably represent later fulfillment intent after a support adjustment.

`capture_amount_cents` can reduce the amount captured for a quantity correction, but it does not change box quantity.

## Locations Where Quantity Means Original/Submitted Order Quantity

| Location | Current use |
|---|---|
| `src/app/cart/page.tsx` | Customer-facing quantity selectors write cart side counts before checkout |
| `src/app/api/cart/resolve/route.ts` | Resolves SKU and writes `right_box_count`, `left_box_count`, `box_count`, and `total_box_count` from cart/Rx choices |
| `src/app/api/orders/[id]/resolve/route.ts` | Resolves order quantity from existing order/cart data and writes order count fields |
| `src/app/api/orders/[id]/price/route.ts` | Prices order from stored count fields and writes updated totals |
| `src/app/api/checkout/price/route.ts` | Reads `box_count` as checkout pricing quantity |
| `src/app/api/verification/send/route.ts` | Sends right/left box counts to prescriber as the quantity ordered |
| `src/lib/shipping.ts` | Computes shipping tier from stored order quantity |
| `src/lib/posthog/lensMetadata.ts` | Sends quantity metadata for analytics |
| `src/app/admin/orders/page.tsx` | Displays stored quantity; now labels count conflicts instead of inferring fulfillment changes |

## Locations That Adjust Money, Not Quantity

| Location | Current use |
|---|---|
| `src/app/api/admin/orders/adjust-capture-amount/route.ts` | Writes `capture_amount_cents` and reason such as `Quantity correction` |
| `src/lib/payments/captureAmount.ts` | Chooses the amount to capture from `capture_amount_cents` or total amount |
| `src/app/api/checkout/authorized/route.ts` | Captures adjusted amount for upload flow |
| `src/app/api/verification/process/route.ts` | Captures adjusted amount after passive verification |
| `src/app/api/orders/[id]/capture/route.ts` | Captures adjusted amount for order capture |

These paths do not update `box_count`, `left_box_count`, `right_box_count`, or `total_box_count`.

## Recommended Future Model

Add explicit fulfillment-intent quantity fields instead of overloading original order quantity:

- `original_right_box_count`
- `original_left_box_count`
- `original_total_box_count`
- `fulfillment_right_box_count`
- `fulfillment_left_box_count`
- `fulfillment_total_box_count`
- `fulfillment_quantity_adjusted_at`
- `fulfillment_quantity_adjusted_by`
- `fulfillment_quantity_adjustment_reason`

Recommended display:

- Collapsed card: intended fulfillment quantity.
- Expanded audit panel: original submitted quantity and adjustment history.
- Payment panel: authorized amount, capture amount, and quantity-adjustment reason.

Migration approach:

1. Backfill original quantity fields from current count fields.
2. Backfill fulfillment quantity fields to match original quantity.
3. Change quantity-correction workflow to update fulfillment quantity and capture amount together.
4. Keep existing `box_count`, `left_box_count`, `right_box_count`, and `total_box_count` as compatibility reads until all pricing, shipping, verification, and dashboard paths move to explicit original/fulfillment fields.
