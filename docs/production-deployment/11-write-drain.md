# Production write drain

The release contains an executable request-level write drain in
`src/proxy.ts`. It covers every non-safe method under `/api/:path*` plus
`POST /admin/orders/image-url`. `GET`, `HEAD`, and `OPTIONS` remain available.
An invalid non-empty mode fails closed.

## Controls and ownership

| Control | Value |
| --- | --- |
| Runtime setting | `PRODUCTION_WRITE_DRAIN_MODE` |
| Valid modes | `off`, `all`, `webhooks`, `operations` |
| Canary secret | `WRITE_DRAIN_CANARY_SECRET`, random and at least 32 characters |
| Change mechanism | Update the production environment, build the exact release tag, then atomically promote that deployment |
| Operator | Application operator |
| Verifier | Database operator/recorder |
| Approver | Incident commander |

Environment changes do not alter an already-running deployment. Every mode
change therefore requires a new deployment of the exact same release commit
and promotion of that artifact. Do not rebuild from a dirty checkout, change
code, or combine a mode change with another release.

## Route groups

| Group | Routes | Reopen phase |
| --- | --- | --- |
| `webhooks` | every non-safe method under `/api/webhooks/` | first |
| `operations` | every non-safe method under `/api/admin/` and `/api/internal/`, `POST /admin/orders/image-url`, order `archive`/`verify`, verification `complete`/`process` | second |
| `checkout` | every remaining non-safe `/api/` request, including checkout, cart, customer order, prescription, recovery, and remaining verification writes | last (`off`) |

The default-to-checkout classification is deliberately conservative: a new API
write cannot reopen early merely because it was omitted from a route list.

## Activation

1. Confirm `COMMERCE_V2_ENABLED=false`.
2. Generate and store a random 48-byte canary secret in the production secret
   manager. Never log or commit it.
3. Set `PRODUCTION_WRITE_DRAIN_MODE=all`.
4. Build the annotated release tag, confirm its commit, and promote it.
5. From an unauthenticated client, prove a normal write returns `503`,
   `WRITE_DRAIN_ACTIVE`, `Cache-Control: private, no-store`, and
   `Retry-After: 60`.
6. Prove a representative read remains available.
7. Wait for requests admitted by the previous deployment to finish.
8. Capture `write-drain-observation-1.json` with
   `sql/write-drain-observation.sql`.
9. Wait 30 seconds without changing any deployment or job.
10. Capture `write-drain-observation-2.json`.
11. Proceed only when both captures have no active writer transaction, no
    prepared transaction, and identical per-table insert/update/delete
    counters for `public`, `security_private`, `commerce_v2`, and
    `legacy_archive`.

If unrelated platform activity changes a counter, identify it explicitly and
repeat both observations. Do not waive an unexplained change.

## Signed canary

The canary is HMAC-SHA-256 scoped to method, exact path, route group, timestamp,
and random nonce. It expires after 60 seconds. Webhooks cannot use it. Canary
headers are stripped before route code runs.

Generate headers:

```powershell
$env:SITE_URL='https://www.honestlenses.com'
$env:WRITE_DRAIN_CANARY_SECRET='<secret from approved secret manager>'
npm.cmd run write-drain:sign -- POST https://www.honestlenses.com/api/checkout/pay
if ($LASTEXITCODE -ne 0) { throw 'Canary signature generation failed' }
```

Use the emitted headers once, immediately, against the exact method and URL.
Execute only the pre-approved non-destructive canary payload. A forged,
expired, wrong-path, or wrong-scope signature must return `503`.

## Phased reopen

Each transition uses a fresh deployment of the same release commit:

1. `all`: all normal writes blocked. Run signed customer and admin canaries.
2. `webhooks`: webhooks open; operations and checkout remain blocked. Observe
   Stripe delivery/reconciliation for five minutes or ten events, whichever is
   longer.
3. `operations`: webhooks and admin/internal operations open; checkout remains
   blocked. Run verification and fulfillment canaries, then observe for five
   minutes.
4. `off`: checkout opens last. Run checkout, order lookup, and receipt smoke
   tests, then begin first-hour monitoring.

At every phase, directly test that the next group remains blocked before
promoting the following phase.

## Abort and recovery

Immediately return to `all` with a same-commit deployment if any of these
occurs:

- a supposedly blocked normal write succeeds;
- a cross-account or anonymous authorization test succeeds unexpectedly;
- a canary signature is accepted for the wrong method, path, scope, or time;
- Stripe reconciliation, order integrity, or Security Advisor has a critical
  failure;
- database 5xx, lock, latency, or authorization abort thresholds fire.

If deployment promotion itself is unreliable, keep the currently proven
drained deployment active and abort the migration. Do not reopen by editing
code or bypassing the proxy.
