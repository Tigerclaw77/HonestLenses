# `public.orders` column audit — 2026-10-20

Read-only inventory of the live Supabase project. No schema or data changes were made for this audit.

## Size and population

- **113 columns** across **273 order rows** at the time of the query: 208 drafts, 52 captured, 11 cancelled, and 2 authorized.
- **20 columns had no nonempty values** in those rows: `admin_notes`, `brand_confidence`, `feedback_notes`, `od_review_status`, `passive_deadline`, `patient_full_name`, `patient_id`, `patient_phone`, `prescriber_fax`, `prescriber_timezone`, `revised_total_amount_cents`, `rx_dob`, `rx_doctor_name`, `rx_doctor_phone`, `rx_expiration_date`, `rx_patient_name`, `shipping_address_id`, `verification_deadline_at`, `verification_notes`, `verification_requested_at`.
- **37 other columns were populated on fewer than 10% of rows.** Examples: `adjusted_right_box_count`, `adjusted_left_box_count`, `adjusted_total_box_count`, `capture_adjusted_at` and `order_quantity_adjusted_at` each on 3 rows; `capture_amount_cents` on 4; `prescriber_email` on 4; `customer_order_number` on 19. Sparse fields can still be operationally important.

## Overlap and future candidates

- `patient_name`, `patient_full_name`, `rx_patient_name`, and `patient_first_name`/`patient_last_name` overlap conceptually. The first three are currently empty; the split patient fields occur on 13 rows. Check all readers and imports before consolidating.
- `rx_dob`, `rx_expiration_date`, `rx_doctor_name`, and `rx_doctor_phone` overlap with `patient_dob`, the `rx` JSON, and `prescriber_*` fields. Their empty population makes them review candidates, not safe removal candidates.
- `box_count`, `total_box_count`, `right_box_count`/`left_box_count`, and `adjusted_*_box_count` capture different stages. There were no differing non-null `box_count`/`total_box_count` pairs, but quantity adjustments appear on 3 orders. Preserve the adjustment history. The existing `order_items` table is empty, so moving line items into it would require a separate, carefully verified backfill.
- Verification timestamps and event details may eventually be represented in `order_events` (264 rows) or a dedicated verification record. `order_email_deliveries` already holds 87 rows and `order_receipt_snapshots` holds 16, suggesting operational histories can live outside the wide order row.
- `shipping_address_id` and `patient_id` are unused; the current inline shipping and patient fields remain the source of truth. A normalization proposal would need migration, access-control, and historical-lookup planning.

## Pricing caution

`subtotal_cents + shipping_cents + tax_cents` differed from `total_amount_cents` on 69 rows, including 36 captured orders. This aggregate may reflect adjustments or older pricing paths; it is **not evidence that any one field is obsolete**. Reconcile those cases before any data-model proposal that moves or removes price columns.

No columns were dropped, renamed, or changed.
