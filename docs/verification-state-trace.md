# Verification State Trace

Date: 2026-06-02

Scope:

- `src/lib/orders/getNextAction.ts`
- `src/app/admin/orders/page.tsx`
- `src/app/api/orders/[id]/rx/route.ts`
- `src/app/api/orders/[id]/rx-ocr/route.ts`
- `src/app/api/orders/[id]/verify/route.ts`
- `src/app/api/orders/[id]/capture/route.ts`
- `src/app/api/checkout/authorized/route.ts`
- `src/app/api/verification/process/route.ts`
- `src/app/api/verification/complete/route.ts`
- `src/app/api/admin/orders/[id]/route.ts`

## Authority

The admin dashboard now treats `verification_status` as the single authoritative displayed verification state.

Primary display helper:

- `getVerificationState(order)` in `src/lib/orders/getNextAction.ts`

Dashboard consumers:

- Expanded card badge: `Verification: {verification.label}`
- Copied order text: `Verify: {verification.label}`
- NEXT ACTION: `getNextAction(order)` reads the same `getVerificationState(order)` result

Quarantined fields:

- `needs_review`
- `verified`
- `passive_verified`
- `doctor_confirmed`
- `blocked`

Those fields are still persisted and functional through Advanced Overrides, but they no longer drive the main verification badge or NEXT ACTION.

## Display Mapping

| Raw `verification_status` | Displayed state | Complete? | Blocks order? | Notes |
|---|---|---:|---:|---|
| `null`, empty, `pending` | Pending | No | No | Await verification or doctor path |
| `requires_review`, `flagged` | Needs Review | No | No | Operator review required |
| `verified`, `auto_verified`, `manual_verified`, `ocr_verified`, `upload_verified`, `altered` | Verified | Yes | No | Method-specific values collapse to lifecycle truth |
| `passive_verified` | Passive Verified | Yes | No | Supported as recommended lifecycle value, though current backend writes mostly use `verified` |
| `doctor_confirmed` | Doctor Confirmed | Yes | No | Supported as recommended lifecycle value |
| `rejected` | Rejected | No | Yes | Verification issue |
| `blocked` | Blocked | No | Yes | Verification issue |
| `not_required` | Not Required | Yes | No | Supported future/non-Rx state |
| any other value | Unknown Legacy | No | No | Safer than pretending the state is verified or blocked |

## Where It Is Written

- Manual Rx update: `/api/orders/[id]/rx` can write incoming `verification_status`, `verified`, or `pending`.
- OCR upload: `/api/orders/[id]/rx-ocr` writes `auto_verified` when OCR looks usable, otherwise `pending`.
- Checkout authorization: `/api/checkout/authorized` writes `auto_verified` only when `rx_upload_path` exists, otherwise `pending`.
- Passive verification cron: `/api/verification/process` writes `verified` and captures eligible authorized orders after the passive deadline.
- Doctor verification completion: `/api/verification/complete` writes `verified` or `rejected`.
- Manual verification endpoint: `/api/orders/[id]/verify` writes `verified` or `altered`.
- Admin override route: `/api/admin/orders/[id]` writes only the five checkbox flags, not `verification_status`.

## Where It Is Read

- Dashboard badge and NEXT ACTION now read `getVerificationState(order)`.
- Capture route `/api/orders/[id]/capture` currently allows capture only when `verification_status` is `verified` or `altered`.
- Passive verification cron reads `verification_status=pending`.
- Checkout/customer pages and ops flags still have their own reads outside this dashboard pass.

## Conflicts Found

- The dashboard previously let `verified=true`, `passive_verified=true`, or `doctor_confirmed=true` display as verified even when `verification_status` remained `pending`. Backend capture would still reject that order.
- The dashboard previously let `blocked=true` display as blocked even though backend verification/capture jobs did not know about that block.
- Shipped/completed orders previously displayed verification as `CLOSED`, which could hide an actual `verification_status` conflict. The dashboard now displays the real verification state.
- Backend capture still recognizes only `verified` and `altered`, while the recommended future state machine includes `passive_verified` and `doctor_confirmed`. If those values exist on authorized orders, they need a state migration or capture-gate update before they can be fully authoritative.

## UI Lies Removed

- Main verification badge no longer claims `Verified`, `Passive Verified`, `Doctor Confirmed`, or `Blocked` from checkbox booleans alone.
- Main verification badge no longer says `CLOSED` just because fulfillment is shipped/completed.
- Unknown legacy verification values no longer get rendered as a confident terminal status.
