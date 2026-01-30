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

## Capture Rules
- Payments are authorized first
- Capture happens only after authorization
- Authorized payments are either captured or cancelled
