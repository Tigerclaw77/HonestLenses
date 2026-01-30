# Commerce Spine

## Order States
- draft
- authorized
- captured
- cancelled

## Endpoints
POST /api/orders
POST /api/orders/:id/pay
POST /api/orders/:id/capture
POST /api/orders/:id/cancel
POST /api/orders/:id/price
POST /api/orders/:id/rx

## Capture Rules
- Payments are authorized first
- Capture happens only after authorization
- Authorized payments are either captured or cancelled

## Rx (Stub)
- Orders may store prescription data (rx_data)
- Orders may be flagged verification_required
- Verification does not currently block capture

