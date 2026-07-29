# Honest Lenses security remediation and re-audit

> **Historical evidence only.** Do not execute commands from this report.
> The authoritative release procedure is
> [`docs/production-deployment/README.md`](production-deployment/README.md).

Date: 2026-07-29
Scope: current local working tree, all Next.js Route Handlers, legacy commerce paths, the paused Commerce v2 implementation, and the previously collected read-only Supabase evidence
Restrictions observed: no deployment, no production SQL, no live Stripe calls, and Commerce v2 remains disabled

## Executive result

The active application’s confirmed Critical and High code-level authorization
paths have been removed or redesigned locally. Authentication and authorization
now have one canonical implementation, every one of the 38 current Route
Handlers is classified in an executable route-policy inventory, UUIDs no longer
grant order or receipt access, customer input cannot assert verification or
payment state, and legacy payment mutations use a central command boundary.

This is **not yet a production-ready release**. The connected production
database was previously proven to expose both admin views to `anon` and
`authenticated`, including DML grants. Per instruction, no production SQL was
executed. A local least-privilege migration is ready for review, but production
remains exposed until an authorized operator applies and independently verifies
that remediation. The new database-backed rate limiter and guest ownership
change also depend on that unapplied migration.

**Production recommendation: NO-GO. Do not deploy this working tree yet.**

The next legitimate gate is a controlled database maintenance operation,
followed by grant/RLS assertions, Supabase Security Advisor review, configured
secrets, and non-production integration tests. Commerce v2 remains a separate
redesign project and is not a cutover candidate.

## Updated grades

Grades distinguish the currently deployed system from the remediated local
candidate. A passing build cannot raise the production database grade while the
confirmed anonymous exposure remains live.

| Area | Current production | Remediated local candidate | Reason |
| --- | --- | --- | --- |
| Security | **F** | **B+** | Local exploitable application paths are closed; production admin-view exposure and unverified SQL remain blockers. |
| Authentication | **C+** | **B+** | Canonical validated bearer/cookie selection, no dev identity bypass, expiring guest capability, explicit admin configuration. |
| Authorization | **F** | **A-** | Production view grants remain exposed; local route policy and object ownership are consistent and regression-tested. |
| API | **C-** | **B+** | Central guards, rate limits, stable errors, upload validation, signed machine requests, and route deletion materially reduce attack surface. Integration testing remains. |
| Database | **F** | **B- (unvalidated)** | Least-privilege SQL is prepared but has not been executed against a disposable or production database. The repository still lacks a reproducible legacy baseline. |
| Commerce v2 | **D+** | **D+ / paused** | Its webhook worker, payment-command, reconciliation, dispute/refund, and migration-baseline concerns were intentionally not treated as active feature work. |

## Canonical authorization model

The authority boundary is now `src/lib/auth/authorization.ts`.

1. An explicit `Authorization` header is authoritative. A malformed or invalid
   bearer token fails; it never falls back to a browser cookie.
2. With no Authorization header, Supabase server auth validates the cookie user
   using `getUser()`.
3. With neither authenticated principal, an order-scoped guest cookie may
   authorize exactly one order. It is HMAC-signed with a dedicated required
   secret, versioned, audience-bound, and expires after 24 hours.
4. Unsafe cookie/guest mutations require an allowed `Origin`.
5. Customer objects require `orders.user_id === authenticated user.id` or the
   exact guest order capability.
6. Admin authority comes only from protected `auth.app_metadata.role ===
   "admin"` or an explicitly configured `ADMIN_EMAILS` entry. Marketing profile
   rows and hardcoded fallback identities cannot grant authority.
7. Machine routes use a scoped internal secret or timestamped HMAC signature;
   webhook routes verify their provider signatures.

`src/lib/auth/routePolicy.ts` classifies all 38 current Route Handlers as
public, authenticated, customer-owned, admin, internal, webhook, or
single-use capability. The security regression test enumerates the filesystem
and fails when a handler is added or removed without updating this policy.

## Reproduction and validation approach

The Critical and High findings were reproduced by tracing each request from its
entry point through the service-role query or financial mutation and by
constructing unit-level authorization inputs for anonymous, guest,
authenticated, cross-account, forged-UUID, admin, replay, and tampered-signature
cases. The prior audit’s production database proof remains decisive for
SEC-01: under `SET LOCAL ROLE anon`, each admin view returned all 274 rows and
the catalog reported the views as updatable with DML grants.

No exploit was sent to production, no customer values were retrieved during
this remediation, and no Stripe object was read or changed. Database SQL was
not executed because both production SQL and deployment were explicitly out of
scope.

## Complete finding disposition

“Fixed locally” means the code or migration is present in this working tree. It
does not mean production changed.

| ID | Validated classification | Endpoint / path and prerequisites | Root cause and realistic impact | Disposition |
| --- | --- | --- | --- | --- |
| SEC-01 | **Confirmed exploitable — Critical** | Supabase Data API access to `public.admin_orders` and `public.admin_orders_view`; no account required. | Default creator-permission views plus explicit `anon`/`authenticated` SELECT and DML grants exposed order/customer/PII and an updatable mutation surface. | Local migration revokes all grants, drops both views, and revokes permissive future defaults. **Still live in production until authorized SQL is applied and verified.** |
| SEC-02 | **Confirmed exploitable — Critical** | `POST/PATCH /api/orders/[id]/rx`; caller needs ownership/guest capability. | The request could supply `verification_status: auto_verified`; client honesty became verification authority. | Fixed locally. Customer Rx writes always become `pending`; only server/admin transitions can verify. Regression test rejects client-forged verified state. |
| SEC-03 | **Confirmed exploitable — Critical** | `/api/checkout/authorized` after any upload; caller needs order access and an authorized PaymentIntent. | File presence was treated as verified and triggered capture/advancement, even when OCR had not validated usable evidence. | Fixed locally. Upload means evidence received/pending, authorization stays authorized, and this route never captures. |
| SEC-04 | **Confirmed exploitable — Critical** | `/api/orders/[id]/status`; any authenticated owner. | Generic mass assignment accepted arbitrary lifecycle strings, allowing false captured/fulfilled states. | Fixed locally by deleting the route. Explicit customer/admin commands enforce preconditions; admin overrides remain authenticated and audited. |
| SEC-05 | **Confirmed exploitable — Critical** | `/order/[id]` and `/order/[id]/receipt`; only a disclosed UUID was required. SEC-01 provided enumeration. | Service-role reads treated a primary key as a bearer credential. Impact included cross-account order, customer, Rx, and receipt disclosure. | Fixed locally. Both surfaces use canonical ownership and include `user_id` in the query constraint. Forged and cross-account UUID tests pass. |
| SEC-06 | **Confirmed exploitable — High** | Login/callback with crafted `next`; victim needs an active browser session/click. | Unsanitized client navigation accepted schemes/protocol-relative paths, enabling script navigation/open redirect behavior. | Fixed locally with one tested `safeInternalPath` implementation rejecting schemes, foreign origins, backslashes, and raw/encoded controls. |
| SEC-07 | **Confirmed exploitable — High** | `/api/orders/[id]/rx-ocr`; order owner/guest could submit arbitrary large/spoofed files and trigger storage/AI work. | Whole-file buffering and provider submission occurred without size, format, image, or quota validation. | High-risk path fixed locally: JPEG/PNG only, 10 MB pre-buffer limit, magic-byte/dimension parsing, 25 MP cap, randomized storage key, no overwrite, central rate limit, and OCR off by default. Bucket constraints are in the unapplied migration. Malware/quarantine and retention operations remain a launch decision. |
| SEC-08 | **Confirmed exploitable — High** | Public order creation, recovery email, verification email, lens resolution, and OCR. No account or low-friction access. | No shared throttling allowed email, AI, storage, CPU, and database abuse. | Fixed locally with a fail-closed, HMAC-keyed, atomic database limiter and operation-specific quotas. **Not effective in production until the migration and `RATE_LIMIT_KEY_SECRET` are installed.** CAPTCHA/provider budget alerts remain operational follow-up. |
| SEC-09 | **Architectural/vendor compliance concern — originally High** | Rx OCR when enabled; requires an order owner/guest and enabled provider integration. | Prescription images/health data were sent to a third party without a repository-verifiable BAA/retention decision; raw model/Rx logs increased exposure. | Mitigated locally: `PRESCRIPTION_OCR_ENABLED` defaults false and raw PHI/model logs are removed. Founder/legal approval and eligible retention configuration are required before enabling. |
| SEC-10 | **Confirmed privacy exposure — High** | Any sensitive rendered page while PostHog replay was configured; no attacker required. | Replay was opt-out and rendered sensitive text was not globally blocked. | Fixed locally: replay and exception capture are explicit opt-in only and examples default false. Page/vendor review is required before opt-in. |
| SEC-11 | **Confirmed retry/consistency risk — High** | Legacy checkout/capture/cancel under timeouts, retries, or concurrent attempts. | Multiple routes issued Stripe mutations with inconsistent keys and could clear PaymentIntent references after transient failures. | Substantially fixed locally: redundant mutation routes removed; one checkout route, attempt generation, stable per-generation keys, no transient ID clearing, and a central capture/cancel command service with convergence. A durable operation ledger and Stripe test-mode crash-window test remain before production confidence. |
| SEC-12 | **Architectural concern — High if Commerce v2 enabled** | V2 Stripe webhook crash after marking an event `processing`; requires V2 webhook activation. | Inline processing could acknowledge a concurrent retry as duplicate while the first worker died. | Confirmed code/design defect, but not an active production path because Commerce v2 is paused and disabled. Must be redesigned with durable enqueue, leases, retry/backoff, and stale-processing health before V2 activation. |
| SEC-13 | **Architectural concern — High if Commerce v2 enabled** | Repeated same-amount refund or recreate-after-failure; requires V2 payment commands. | Logical amount-derived idempotency keys collide across distinct legitimate business actions. | Confirmed design defect, inactive while V2 is disabled. Requires persisted unique command IDs and explicit attempt supersession before V2 activation. |
| SEC-14 | **Defense in depth / audit over-severity** | Admin checks; exploitation would require a future writable `profiles.role` column. | `profiles.role` did not exist, so current checks failed closed; hardcoded email fallback was nevertheless brittle and adding a writable role later would create escalation. | Fixed locally. No profile role lookup or hardcoded identity; protected app metadata or explicit server configuration only. |
| SEC-15 | **Confirmed conditional exposure — High** | Compromise/login of the shared guest Supabase account. | Every guest order shared one Auth owner, so RLS could grant one principal access to all guest orders. | Fixed in local code and migration: new guest orders use `user_id = NULL` plus one-order capability; the migration clears the fixed owner and permits nullable ownership. **Production remains unchanged until migration/deploy.** |
| SEC-16 | **Architectural credential-blast-radius concern — reclassified Medium** | Armory export with stolen integration secret. | One static bearer token allowed a broad, high-volume sensitive export without freshness or request quota. No token disclosure was found. | Hardened locally with a 5-minute timestamped HMAC, timing-safe comparison, replay/freshness checks, central rate limit, minimal maximum page size of 100, and cursor pagination. Per-client/mTLS identity remains optional hardening. |
| SEC-17 | **Defense in depth / conditional High** | Internal checkout self-fetch with hostile/misconfigured site origin. | Request-derived/public origin and wholesale forwarding of cookie plus bearer credentials could disclose credentials to the configured host. | Fixed locally with required server-only `SITE_URL`, HTTPS outside local development, and one selected credential type. Direct service invocation remains a maintainability improvement. |
| SEC-18 | **Confirmed low-impact exposure — Medium** | Application/operator logs. | Token prefixes, user/order data, OCR content, and provider objects were logged too broadly. | Fixed in audited paths: token/raw Rx/model logging removed and customer responses use stable errors. Continued structured-log governance is required. |
| SEC-19 | **Defense in depth — Medium** | Replay after guest-cookie theft. | Browser Max-Age did not expire a copied signed value; the signing secret had unsafe fallbacks. | Fixed locally with dedicated required secret, version/audience/issued/expiry claims, timing-safe HMAC, and 24-hour expiry. Server-side immediate revocation remains a lower-priority enhancement. |
| SEC-20 | **Defense in depth — Medium** | Cross-site/same-site mutation or conflicting bearer+cookie identities. | No central origin check and handlers could consider two principals. | Fixed locally: explicit Authorization header wins and never falls back; unsafe cookie/guest writes require a configured trusted Origin. |
| SEC-21 | **Confirmed low-impact abuse/privacy issue — Medium** | Public recovery email and concurrent verification sends. | Recovery disclosed account/order existence; read-send-update allowed duplicate emails. | Fixed locally with uniform `{ok:true}`, rate limiting, and database compare-and-set send claim with rollback on provider failure. |
| SEC-22 | **Confirmed low-impact HTML injection — Medium** | Order owner supplies patient/prescriber/Rx fields rendered into email. | User values were interpolated into HTML and subject content without escaping. | Fixed locally with centralized HTML escaping and sanitized subjects across verification/admin emails. |
| SEC-23 | **Confirmed low-cost resource exposure — Medium** | Direct Data API function invocation by `anon`/`authenticated`. | Calendar/trigger helpers inherited public execute; deadline calculation could consume database CPU. | Local migration revokes direct execution and re-grants only `service_role`. **Pending database application/verification.** |
| SEC-24 | **Defense in depth — Medium** | Publicly reachable development/preview build. | A localhost-host development branch returned a fixed user identity. | Fixed locally by deleting the bypass entirely. |
| SEC-25 | **Defense in depth — Medium** | Browser response hardening. | CSP, HSTS, no-sniff, framing, referrer, and permissions headers were missing globally. | Partially fixed locally with global headers. CSP still permits inline script/style behavior required by the current Next.js surface; nonce/hash hardening remains. |
| SEC-26 | **Confirmed low-impact privacy exposure — Medium** | Same-origin script or shared device after Rx drafting. | Health-data drafts persisted in `localStorage` across browser restarts. | Fixed locally by moving the minimal draft to `sessionStorage` and removing a stale duplicate form. |
| SEC-27 | **Defense in depth — Medium** | Theft of one internal scheduler token. | A single `CRON_SECRET` authorized reconciliation and verification operations. | Fixed locally with separate reconciliation, verification-process, and verification-complete secrets/scopes. |
| SEC-28 | **Defense in depth / external configuration — Low/Medium** | Password-based Supabase accounts. | Leaked-password protection was disabled; admin MFA posture was not defined. | Not code-fixable in this repository. Founder/operator must enable the protection and require MFA/emergency-access controls for admins. |
| SEC-29 | **Confirmed low-impact information disclosure — Low/Medium** | Failed public/customer/admin API calls. | Raw Supabase, Stripe, and schema/provider errors were returned to clients. | Fixed in audited handlers with stable public errors while retaining server-side diagnostic context. |
| SEC-30 | **Confirmed low impact — Low** | Resume capability appears in browser URL before one-time exchange. | Query tokens can reach history/logs/referrers, although hashing, expiry, and one-time use constrain impact. | Partially fixed with `no-store` and `no-referrer` on the exchange. A fragment-to-POST design would remove the remaining URL exposure. |

## False positives and reclassifications

- No dynamic request-derived SQL construction or command execution was found;
  the SQL-injection and command-injection classes are false positives for the
  reviewed request paths.
- No general arbitrary-host SSRF was found. SEC-17 was a conditional trusted
  origin/credential-forwarding flaw, not a generic SSRF primitive.
- `profiles.role` was not an active privilege-escalation path because the
  column does not exist and the check failed closed. The design was dangerous
  if someone later added a user-writable role, so the local implementation was
  still removed.
- Commerce v2 findings SEC-12 and SEC-13 are real implementation defects but
  not presently exploitable production vulnerabilities while the feature and
  webhook are disabled.
- UUID order identifiers were not independently guessable authorization
  tokens. SEC-05 became Critical because UUIDs were exposed by SEC-01 and then
  accepted as sole authority.
- A static Armory secret was not proven stolen. SEC-16 is a credential
  blast-radius and data-minimization concern rather than a demonstrated active
  breach.

## Architectural improvements made

- One canonical principal, admin, guest, origin, and ownership library replaced
  route-specific variants.
- An executable policy inventory makes route authority reviewable and causes
  CI to fail on unclassified handlers.
- Generic state mutation was replaced by named commands with explicit
  preconditions.
- Customer evidence submission is separated from verification authority and
  payment capture.
- Legacy Stripe mutation is centralized; redundant pay/price/capture/
  reauthorize/resolve/verification routes were removed.
- Guest ownership no longer uses a shared Auth identity.
- Sensitive integration surfaces are fail-closed: required dedicated secrets,
  OCR/replay opt-in, signed Armory requests, and database-backed throttling.
- Upload validation, input bounds, email escaping, stable public errors, and
  browser security headers are shared utilities rather than route-local
  patches.
- Public debug/test pages and dead duplicate Rx code were removed.

## Security regression coverage

`src/lib/auth/securityRegression.test.ts` now asserts:

- the complete 38-route policy inventory;
- public/authenticated/customer/admin/internal/webhook/capability
  classifications;
- anonymous, owner, cross-account, forged UUID, and admin access source rules;
- bearer-versus-cookie principal selection and cookie-mutation Origin policy;
- guest capability tamper, expiry, audience, and wrong-order rejection;
- app-metadata/configured-email admin authority and profile-role exclusion;
- safe redirect rejection, including encoded control characters;
- Armory missing/stale/tampered/replayed-signature behavior;
- removal of critical routes, dev bypasses, hardcoded guest/admin identities,
  and client-forged verification patterns;
- the presence of required least-privilege migration controls.

`src/lib/security/uploadValidation.test.ts` covers valid JPEG/PNG images,
spoofed MIME, bad magic, malformed/truncated images, oversized bytes,
oversized dimensions/pixels, and unsupported content.

Existing production-integrity, admin-workflow, email-delivery, internal-auth,
Commerce v2 lifecycle, schema-contract, cart, shipping, and order-access
matrices also pass. The Commerce v2 tests prove existing pure-code behavior;
they do not negate SEC-12/13 or validate the SQL in PostgreSQL.

## Files changed for this remediation

The repository was already dirty with in-progress Commerce v2 and operational
work. This inventory describes the security remediation; it does not claim
ownership of unrelated pre-existing edits.

### Added

- `src/lib/auth/authorization.ts`
- `src/lib/auth/routePolicy.ts`
- `src/lib/auth/safeRedirect.ts`
- `src/lib/auth/securityRegression.test.ts`
- `src/lib/security/inputValidation.ts`
- `src/lib/security/rateLimit.ts`
- `src/lib/security/signedRequest.ts`
- `src/lib/security/siteOrigin.ts`
- `src/lib/security/uploadValidation.ts`
- `src/lib/security/uploadValidation.test.ts`
- `src/lib/email/html.ts`
- `src/lib/payments/legacyPaymentCommands.ts`
- `supabase/migrations/20260729160750_security_remediation_least_privilege.sql`
- this report

### Reworked

- `.env.example`, `next.config.ts`, and `package.json`
- `src/lib/admin-auth.ts`, `src/lib/get-user-from-request.ts`,
  `src/lib/internal-auth.ts`, `src/lib/order-access.ts`,
  `src/lib/order-recovery.ts`, `src/lib/email.ts`, and
  `src/lib/posthog/config.ts`
- `src/app/admin/layout.tsx`
- all active admin order APIs
- cart, checkout, order, order-recovery, resolve-lens, verification, Armory,
  receipt, login, callback, and resume handlers/components touched by the
  findings
- legacy customer/admin capture and cancellation call sites

### Removed

- `/api/checkout/capture`, `/api/checkout/price`
- `/api/orders/[id]/capture`, `/pay`, `/price`, `/reauthorize`, `/resolve`,
  `/rx-confirm`, and `/status`
- `/api/orders/update-verification-details`
- `/api/verification/request`
- `/api/test-resolver`
- `/debug/orders`, `/debug/rx`, and `/test-lens`
- `src/components/RxForm copy.tsx`

## Database migration prepared but not executed

`supabase/migrations/20260729160750_security_remediation_least_privilege.sql`
does the following locally:

- revokes and drops both exposed admin views;
- removes shared guest ownership and permits `orders.user_id` to be null;
- adds payment-attempt generation and the missing one-time resume-token table;
- revokes direct public execution of internal calendar/trigger helpers;
- constrains the private prescriptions bucket to JPEG/PNG and 10 MB;
- revokes permissive future table/function defaults;
- creates a private rate-limit table and atomic service-role-only RPC with RLS.

It has **not** been parsed or executed by PostgreSQL because no disposable
legacy database baseline is available and production execution was prohibited.
Before production, apply it first to a representative disposable environment
and assert the exact grants, RLS behavior, function ownership/search path,
storage constraints, rate-limit concurrency, and compatibility with existing
rows.

Supabase documents that views use creator privileges by default and can bypass
RLS; explicit grants are a separate security boundary:
[RLS and views](https://supabase.com/docs/guides/database/postgres/row-level-security)
and [Database Advisors](https://supabase.com/docs/guides/database/database-advisors).

## Remaining risks

1. **Active production blocker:** both admin views remain exposed until an
   authorized production change is applied and verified.
2. The database migration and rate-limit RPC have text-level tests only; no
   PostgreSQL integration or concurrency test has run.
3. Current local changes have not been exercised through browser-level
   guest/customer/admin flows against a realistic Supabase database.
4. Legacy Stripe commands are more consistent but do not yet have a durable
   operation ledger proving recovery from Stripe-success/DB-checkpoint failure.
   Stripe test-mode failure injection is required; no live Stripe calls should
   be used.
5. Prescription OCR must remain off until vendor/legal approval, retention,
   deletion, access logging, and any required BAA are confirmed. OpenAI
   describes API data controls and BAA/eligible-service requirements here:
   [API data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint),
   [BAA process](https://help.openai.com/en/articles/8660679-how-can-i-get-a-business-associate-agreement-baa-with-openai/),
   and [HIPAA-eligible services](https://help.openai.com/en/articles/20001069-hipaa-eligible-products-and-functionality).
6. Session replay/exception capture must remain off until a sensitive-page
   privacy and retention review is approved.
7. Guest cookies expire but cannot yet be immediately revoked server-side.
8. CSP is present but not yet nonce/hash based.
9. Resume capabilities still briefly appear in query strings.
10. Supabase leaked-password protection and admin MFA are external controls
    still requiring operator action.
11. The full database remains non-reproducible from the migration ledger.
12. Commerce v2 remains blocked by its event-worker, idempotency, reconciliation,
    financial projection, privacy, and migration-baseline defects.

## Founder decisions required

1. Authorize and schedule the production admin-view revocation/drop after a
   disposable-database rehearsal, including a rollback plan and access-log
   review.
2. Choose the protected admin membership source long-term
   (`auth.app_metadata` or a private membership table), require MFA, and define
   emergency access.
3. Approve the 24-hour guest access lifetime or fund server-side revocation and
   a transactional guest-to-account claim flow.
4. Define which prescription outcomes require human review and the evidence
   necessary before payment capture/fulfillment.
5. Approve or reject OpenAI, PostHog, Supabase, Resend, Armory, and support/log
   tooling for the exact health/PII categories, contracts, retention, deletion,
   and access logging involved.
6. Decide whether OCR and PostHog replay remain disabled at launch. The safe
   default is disabled.
7. Coordinate the Armory signing protocol/secret rotation and decide whether a
   per-client short-lived identity or mTLS is required.
8. Approve CAPTCHA/provider spending alerts and operational owners for abuse,
   recovery email, verification, and OCR quotas.
9. Define legacy Stripe command recovery, support ownership, and the required
   Stripe test-mode failure-injection gate.
10. Approve nonce/hash CSP work and the fragment-to-POST resume-token exchange,
    or explicitly accept those residual lower-severity risks.
11. Keep Commerce v2 disabled until its separate D+ redesign gates and a
    reproducible database baseline are complete.

## Final local validation

The following completed successfully on 2026-07-29:

- `npm test`, including the new security and upload regression matrices;
- `npm run lint`;
- `npx next typegen`;
- `npx tsc --noEmit`;
- `npm run build`, including lens coverage and validation-invariant checks;
- `git diff --check` (only Windows LF-to-CRLF notices, no whitespace errors);
- exact conflict-marker scan (no conflict markers).

The optimized Next.js build generated 154 pages and reported 38 Route
Handlers. No deployment, production SQL, storage mutation, or Stripe API
operation occurred.

## Production gate

Do not recommend or perform production deployment until all of these are true:

1. The security migration succeeds in a disposable, representative Supabase
   environment and automated SQL assertions prove grants/RLS/function/storage
   behavior.
2. An authorized operator applies the reviewed emergency view revocation/drop
   to production and independently proves `anon` and `authenticated` cannot
   select or mutate the views/tables outside intended policy.
3. Supabase Security Advisor and a manual grant/RLS inventory are clean.
4. Required dedicated secrets and scoped internal credentials are configured;
   OCR and replay remain explicitly disabled unless approved.
5. Browser/API integration tests pass for anonymous, guest, customer,
   cross-account, admin, CSRF, upload, recovery, verification, checkout,
   receipt, cancellation, and replay cases.
6. Stripe **test-mode** contract/failure-injection tests prove authorization,
   capture, cancellation, retry, webhook signature/duplicate handling, and
   Stripe-success/DB-failure recovery. Do not use live Stripe for this gate.
7. All remaining Critical and High results are re-audited against the deployed
   configuration, not inferred from source.

Until those gates pass, the correct production recommendation remains
**NO-GO**, and Commerce v2 remains disabled.
