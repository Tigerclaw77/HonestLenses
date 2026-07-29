# Honest Lenses pre-cutover architecture, security, and maintainability audit

> **Historical evidence only.** Do not execute commands from this report.
> The authoritative release procedure is
> [`docs/production-deployment/README.md`](production-deployment/README.md).

Date: 2026-07-29
Scope: Commerce v2 proposal, current application, and connected Supabase project
Method: local code/configuration review plus read-only Supabase catalog and aggregate queries
Explicit exclusions: no deployment, no production mutation, no storage mutation, and no Stripe API call

## Executive summary

**Final recommendation: REDESIGN PORTIONS FIRST.**

The v2 direction is substantially better than the legacy design: payments,
prescription verification, fulfillment, and order lifecycle are separated;
Stripe events are retained; operations are intended to be idempotent; and the
operational projection gives every order a queue and an explanation.

The current implementation is nevertheless not safe to validate as the
cutover candidate yet. It contains:

- a directly exploitable production database exposure that lets the `anon`
  role read all 274 non-archived orders through two admin views and, because
  the views are automatically updatable and have DML grants, potentially
  mutate exposed order fields;
- two independent prescription-verification bypasses, including a checkout
  path that equates any uploaded file with a verified prescription;
- an authenticated customer endpoint that accepts an arbitrary order status;
- unauthenticated order and receipt pages that use the order UUID as the only
  bearer credential, while those UUIDs are exposed by the admin views and sent
  to third-party telemetry;
- an unsanitized `router.replace(next)` that the Next.js documentation
  explicitly identifies as an XSS pattern;
- payment-command idempotency keys that collide across distinct business
  actions and prevent valid retries/new payment attempts;
- a webhook crash window that can acknowledge an event as a duplicate before
  any worker has completed it, permanently stranding the event;
- reconciliation that repeatedly scans the same oldest rows, leaves repaired
  findings open, and can starve newer payments;
- incorrect payment facts for authorization time and partial disputes;
- extensive sensitive-data duplication in raw Stripe snapshots, events,
  operation snapshots, reconciliation findings, and audit snapshots;
- no executable database baseline: the repository has two migrations, while
  the remote ledger has only one differently versioned migration, and current
  local order-recovery code references a table that does not exist remotely.

These are redesignable portions, not a reason to abandon the whole v2
boundary. Preserve the domain separation, service-role-only posture,
immutable commercial snapshots, Stripe event ledger, explicit payment
commands, and one operational projection. Simplify the event tables, correct
payment semantics, centralize authorization, and prove the revised migration
in a disposable Supabase project before any controlled validation.

### Decision summary

| Question | Answer |
| --- | --- |
| Execute the current Phase 1 SQL in production? | **No.** |
| Execute Phase 1 SQL in a disposable non-production Supabase project? | **Yes, after the redesign items in this report are incorporated.** Running the current file may be useful diagnostically, but it should not become the validated candidate. |
| Is Commerce v2 ready for controlled validation now? | **No.** |
| Is a complete replacement of the v2 direction required? | **No.** |
| Should portions be redesigned before moving forward? | **Yes: authorization, guest/order access, verification trust, payment commands, webhook queueing, payment projection, reconciliation, and audit-data minimization.** |

## Grades

| Area | Grade | Why |
| --- | --- | --- |
| Architecture | **C** | Sound domain boundaries, but duplicated event/audit concepts and unresolved dual-write failure modes remain. |
| Security | **F** | Direct anonymous PII exposure and an updatable admin-view surface exist in the connected database; multiple application bypasses are exploitable. |
| Authentication | **C-** | Supabase `getUser()` validation is sound where used, but bearer/cookie handling is inconsistent, a development identity bypass is embedded, and guest orders share one Auth principal. |
| Authorization | **F** | Admin view exposure, arbitrary status mutation, UUID-only order access, frontend-trusted verification, hardcoded admin identities, and duplicated authorization models are present. |
| Database design | **C-** | Legacy is a 100-plus-column god table with contradictory constraints. V2 is materially better but needs payment and reconciliation redesign. |
| Maintainability | **C-** | Useful domain modules exist, but schema drift, direct service-role access in almost every route, 5,000-line UI files, duplicate source files, magic strings, and route-level lifecycle logic remain. |
| Operational readiness | **D+** | Two observed legacy states have fulfillment completed while payment is only authorized; 244 drafts are older than 24 hours; health checks have starvation/staleness blind spots. |
| Commerce v2 readiness | **D+** | The foundation is promising, but the SQL has never run in PostgreSQL and known webhook, idempotency, dispute, reconciliation, and privacy defects precede validation. |

## Audit evidence and important limitations

The connected project contained 274 orders: 251 `draft`, 10 `authorized`, and
13 `captured`. There were 62 distinct PaymentIntent references, 244 drafts
older than 24 hours, 69 rows with prescription upload paths, and 246
`auto_verified` rows. No customer data values were retrieved for this report;
only schema metadata, security metadata, and aggregate counts were used.

The production catalog proves:

- both `public.admin_orders` and `public.admin_orders_view` are owned by a
  privileged role, use default security-definer behavior, and grant `SELECT`
  plus DML privileges to `anon` and `authenticated`;
- `SET LOCAL ROLE anon; SELECT count(*)` returned 274 rows from each view;
- `information_schema.views` reports both views as `is_updatable = YES` and
  `is_insertable_into = YES`;
- the views expose order IDs, customer/patient names, customer email, totals,
  status/verification data, and (in one view) PaymentIntent IDs;
- Supabase Security Advisor reports both views as errors;
- `profiles` has exactly four columns (`id`, `marketing_opt_in`, `created_at`,
  and `updated_at`), zero rows, and no `role`;
- the `prescriptions` bucket is private but has no MIME or file-size
  restriction and no storage object policies;
- leaked-password protection is disabled;
- the remote migration ledger contains only
  `20260721143337_resend_email_delivery_tracking`; the local corresponding
  file uses version `20260721000000`, and no reproducible legacy baseline is
  present.

The audit did not call Stripe. Therefore the 62 legacy PaymentIntents were not
reconciled, and no conclusion about their current Stripe status is claimed.

Relevant current platform guidance:

- Supabase documents that views use creator permissions by default and that
  `security_invoker = true` is required for underlying RLS to apply:
  [Supabase view security](https://supabase.com/docs/guides/database/tables?database-method=sql&queryGroups=database-method).
- Supabase separately warns that views bypass RLS by default:
  [Supabase RLS and views](https://supabase.com/docs/guides/database/postgres/row-level-security).
- Supabase's 2026 Data API change makes explicit grants a separate, required
  security layer:
  [Supabase explicit-grants change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
- Next.js recommends a centralized data-access layer and says Route Handlers
  must be treated as public APIs:
  [Next.js authentication and authorization](https://nextjs.org/docs/app/guides/authentication).
- Next.js explicitly warns that unsanitized `router.push` or
  `router.replace` values, including `javascript:` URLs, execute as XSS:
  [Next.js `useRouter`](https://nextjs.org/docs/app/api-reference/functions/use-router).
- Stripe requires raw-body webhook verification, duplicate handling, and
  recommends asynchronous processing:
  [Stripe webhook guidance](https://docs.stripe.com/webhooks?lang=node).
- Stripe suggests a unique random idempotency key and may prune keys after at
  least 24 hours:
  [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests).
- OWASP recommends explicit upload-size limits, request throttling, and
  third-party cost controls:
  [OWASP unrestricted resource consumption](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/).

## Complete security findings

Severity reflects impact and exploitability in this application, not merely a
generic scanner category.

| ID | Severity | Exploitability | Finding and exact root cause | Required fix |
| --- | --- | --- | --- | --- |
| SEC-01 | **CRITICAL** | **Direct, anonymous, no account required.** | `public.admin_orders` and `public.admin_orders_view` are default security-definer views with grants to `anon` and `authenticated`. An `anon` transaction returned all 274 rows. Both views are automatically updatable and have DML grants, so the exposure is not limited to reads. | Immediately revoke every privilege from `anon`/`authenticated`, then drop the duplicate views or move a single read-only projection to an unexposed private schema. Access it only through an authenticated admin server endpoint. Adopt explicit default-grant revocation. |
| SEC-02 | **CRITICAL** | **Direct for any guest/customer controlling an order.** | `/api/orders/[id]/rx` accepts `verification_status: auto_verified` from the request and comments “TRUST FRONTEND.” A caller can self-assert verification. | The server alone determines verification state. Customer endpoints may submit evidence but must never write a verified-like status. Use one verification transition service with evidence and actor checks. |
| SEC-03 | **CRITICAL** | **Direct for any guest/customer order.** | `/api/checkout/authorized` treats `Boolean(rx_upload_path)` as verified, labels it `auto_verified`, captures the PaymentIntent, and advances the order. `/rx-ocr` sets the upload path before determining whether the document is usable, and accepts any file. | File presence means “evidence received,” never “verified.” Separate upload, OCR proposal, review, verification, authorization, and capture transitions. Block capture/fulfillment until a server-issued verification outcome exists. |
| SEC-04 | **CRITICAL** | **Direct for any authenticated owner; impact expands if downstream systems trust status.** | `/api/orders/[id]/status` accepts any non-empty `status` and writes it to the caller's order without an allowlist or transition rules. It can assert `captured`, `fulfilled`, or another enum state without Stripe or verification evidence. | Remove the route. Replace it with explicit commands whose preconditions are checked against Stripe/payment, verification, and fulfillment truth. Admin exceptions must use the audited override path. |
| SEC-05 | **CRITICAL** | **Direct when combined with SEC-01; otherwise UUID disclosure is required.** | `/order/[id]` and `/order/[id]/receipt` use a service-role client and a UUID format check only. The code explicitly calls the UUID a bearer credential. SEC-01 enumerates every UUID, and order IDs are also sent to analytics and email systems. | Require account/guest ownership or a separate expiring, scoped, revocable signed receipt token. Never treat a database primary key as a secret. Return the minimum DTO. |
| SEC-06 | **HIGH** | **Direct; requires an active browser session and a crafted link.** | `LoginClient.tsx` sends `searchParams.get("next")` directly to `router.replace`. Next.js documents that `javascript:` values execute. A different callback component has a partial sanitizer, proving duplicated redirect logic. | Use one tested `safeInternalPath()` helper for every redirect/navigation. Reject schemes, backslashes, control characters, protocol-relative URLs, and cross-origin URLs. |
| SEC-07 | **HIGH** | **Direct with an authenticated owner or guest cookie.** | `/rx-ocr` has no byte-size, MIME allowlist, magic-byte check, page/pixel limit, malware workflow, quota, or rate limit. The bucket itself has no limits. The whole file is buffered, base64 encoded, stored, and sent to OpenAI. | Enforce small allowed types and byte/page/pixel limits before buffering; validate magic bytes; configure bucket limits; quarantine/scan; add per-order/user/IP quotas; reject duplicate work; define retention and deletion. |
| SEC-08 | **HIGH** | **Direct and low-cost.** | No application API route returns 429 or invokes a rate limiter. Public or low-friction routes can create orders, send recovery/verification email, call AI resolution/OCR, store files, and write lead tables without meaningful quotas. | Add centralized platform and application throttling, tighter per-operation quotas, CAPTCHA/turnstile where appropriate, provider spending alerts, and idempotent email/upload jobs. |
| SEC-09 | **HIGH** | **Direct if sensitive vendor controls are not contractually configured.** | Prescription images and extracted health data are sent to OpenAI. By default, API abuse-monitoring logs can retain customer content for up to 30 days. The application also logs OCR output and prescription data. | Do not process prescription images until vendor/legal review confirms the applicable BAA/DPA and eligible retention configuration. OpenAI states that healthcare API eligibility requires the appropriate agreement and retention provisioning: [OpenAI HIPAA-eligible functionality](https://help-lb.openai.com/en/articles/20001069-hipaa-eligible-products-and-functionality). Remove raw PHI logs. |
| SEC-10 | **HIGH** | **Direct when session replay is enabled; no attacker is required for disclosure.** | PostHog replay defaults to enabled unless the environment explicitly says `"false"`. Inputs are masked, but rendered text is not globally masked; only a few admin image elements use block selectors. Customer, order, prescription, and admin pages can render sensitive data. | Default replay to disabled. Enable only after a page-by-page privacy review, use deny-by-default text masking/blocking on all health/order/admin surfaces, and confirm contractual treatment/retention. |
| SEC-11 | **HIGH** | **Direct under retry, timeout, or concurrent checkout conditions.** | Legacy Stripe mutations have no durable command IDs. Multiple routes create/capture/cancel independently. If Stripe succeeds and the DB update fails, a retry can fail or duplicate work; the legacy webhook does not repair legacy orders. Some code clears/detaches PaymentIntent references after retrieval/cancel failures. | Put every Stripe mutation behind one command service and durable operation row. Never clear an ID on transient failure. Reconcile by Stripe metadata/event. Remove duplicate mutation routes at cutover. |
| SEC-12 | **HIGH** | **Direct under a webhook crash/timeout.** | V2 marks a new event `processing`, then processes inline. A retry received within five minutes is returned as `duplicate` with 2xx. If the first process died, Stripe can stop retrying while no worker owns the event. Health counts failed events but not stale `processing` events. | Transactionally enqueue and return 2xx only after durable enqueue; process with a retrying worker. Alternatively, return a retryable non-2xx for an unfinished duplicate. Add lease owner/expiry, backoff, dead-letter state, and stale-processing health. |
| SEC-13 | **HIGH** | **Direct for legitimate repeated operations; exploitable as denial of correct financial action.** | V2 idempotency keys are deterministic from order, operation, and amount. A second legitimate refund for the same amount collides forever. A failed/cancelled payment recreated for the same total reuses the original create operation and old PaymentIntent snapshot. Amount changes that later return to an old value have the same issue. | Generate a unique command UUID for each business action and persist it before Stripe. Retry only that command with its key. Add payment-attempt generation/supersession. Capture/cancel can enforce a natural single command; refunds require unique refund requests. |
| SEC-14 | **HIGH** | **Conditional but serious.** | `profiles.role` does not exist, so profile-role authorization is broken and fail-closed. The fallback is a hardcoded/default email allowlist. More dangerously, `profiles` currently grants authenticated users update access to their own row; naively adding `role` would let users self-promote. | Keep marketing profile data separate from authorization. Store admin membership in protected `auth.app_metadata` or a private server-only membership table. Require explicit configuration; remove hardcoded default identities and all one-off admin checks. |
| SEC-15 | **HIGH** | **Conditional on compromise of the shared guest account/mailbox.** | Every guest order is assigned to one fixed Supabase Auth user. RLS therefore considers every guest order owned by the same principal. If that account can authenticate, it can read/write all guest orders through the Data API. | Guest orders should have no shared Auth owner. Use an opaque, random guest session/access record tied to one order and later claim it into a real user transactionally. |
| SEC-16 | **HIGH** | **Token theft grants bulk sensitive access.** | The Armory bridge uses one long-lived static bearer token and can return up to 1,000 orders with customer, address, prescription, prescriber, payment, and operational fields. It has no expiry, audience, per-client identity, or request quota. | Use a scoped machine identity (short-lived signed token/OAuth/mTLS), a minimal DTO, audit logs, rotation, and pagination. Split operational and sensitive detail permissions. |
| SEC-17 | **HIGH** | **Conditional on configuration/host trust.** | Checkout constructs an internal base URL from `NEXT_PUBLIC_SITE_URL` or `new URL(req.url).origin`, then forwards Authorization and Cookie headers. A hostile or misconfigured origin can receive credentials. Other internal routes use a different base-URL policy. | Do not self-fetch. Call the underlying service directly. If HTTP is unavoidable, use one server-only allowlisted canonical origin and never forward more credentials than required. |
| SEC-18 | **MEDIUM** | **Direct log exposure to operators/log sinks.** | `get-user-from-request.ts` logs the first 20 characters of bearer headers/tokens and user IDs. OCR logs parsed prescriptions and raw model output. Several routes log whole orders or provider errors. | Structured logging with an explicit allowlist; redact tokens, health/order IDs where they are access capabilities, health data, addresses, emails, Stripe payloads, and provider responses. |
| SEC-19 | **MEDIUM** | **Replay requires cookie theft.** | Guest cookies have good `HttpOnly`, `SameSite=Lax`, and production `Secure` flags, but the signed payload has no issued/expiry time or server-side revocation. Browser Max-Age does not invalidate a copied value. Secret fallbacks include the service-role key, public Supabase URL, and a local constant. | Use a dedicated required secret or opaque server-side session, include expiry/audience/version, support revocation/rotation, and never fall back to public configuration or another high-value secret. |
| SEC-20 | **MEDIUM** | **Cross-site exploitation is constrained by SameSite and JSON, but same-site/XSS paths remain.** | Browser mutations and admin cookie auth have no central Origin/CSRF validation. Admin auth considers both a supplied bearer user and cookie user, creating a confused-principal model. | Choose exactly one principal source per request. Validate Origin for cookie-authenticated mutations and use CSRF tokens where needed. Keep bearer-only machine APIs separate. |
| SEC-21 | **MEDIUM** | **Direct.** | Recovery email returns `found: true/false`, disclosing whether an email has a recoverable order, and has no rate limit. Verification email uses a read-then-send-then-update sequence that permits concurrent duplicate sends. | Return a uniform response, throttle by IP/email/order, use a transactional/idempotent email job, and monitor abuse. |
| SEC-22 | **MEDIUM** | **Direct for an order owner; execution occurs in email clients, not the app origin.** | Verification/admin email HTML interpolates patient, prescriber, Rx, and other user-controlled values without HTML escaping (`textBody.replace` and template strings). | Use escaped React Email/templates or an HTML escaping helper. Do not construct HTML by replacing newlines in user data. |
| SEC-23 | **MEDIUM** | **Low-cost database CPU abuse is possible.** | Calendar/trigger functions grant `EXECUTE` to `anon`/`authenticated`. Mutation helpers fail as invokers because table INSERT is denied, but `calculate_passive_deadline` can be called with attacker-controlled timezone/business-hours and loops hourly. | Revoke execute from roles that do not call the function directly; put internal helpers in a private schema; validate bounded arguments in the server. |
| SEC-24 | **MEDIUM** | **Conditional on deployment error.** | `getUserFromRequest` returns a fixed user for any localhost-host request when `NODE_ENV=development`. A publicly reachable dev/preview configuration becomes an auth bypass. | Remove the bypass or require a separate explicit local-only flag plus loopback socket verification. Never embed a production-shaped user ID. |
| SEC-25 | **MEDIUM** | **Defense-in-depth gap that raises impact of XSS/clickjacking.** | Global CSP, HSTS, `X-Content-Type-Options`, frame restrictions, and Permissions Policy are absent. Only `/order/*` receives privacy headers. | Add reviewed global headers and a nonce/hash-based CSP. Keep strict no-store/no-referrer on sensitive pages and APIs. |
| SEC-26 | **MEDIUM** | **Direct privacy exposure after XSS or shared-device access.** | Prescription form drafts are persisted in `localStorage`; they survive browser restarts and are readable by any same-origin script. | Store the minimum, prefer short-lived server drafts or `sessionStorage`, expire explicitly, and clear on completion/logout. |
| SEC-27 | **MEDIUM** | **Single token compromise has broad blast radius.** | One `CRON_SECRET` authorizes reconciliation plus verification completion/processing. These are distinct high-impact capabilities. | Use scoped scheduler identities/secrets with audience and rotation, or one signed internal-token format with explicit scopes. |
| SEC-28 | **LOW/MEDIUM** | **Direct against password accounts.** | Supabase leaked-password protection is disabled. The main flow is magic-link based, but any password account lacks this control. | Enable leaked-password protection and review MFA for admins. |
| SEC-29 | **LOW/MEDIUM** | **Information disclosure.** | Several APIs return raw Supabase/Stripe error messages to clients, leaking provider and schema details. | Map internal errors to stable public codes; retain redacted detail only in structured server logs. |
| SEC-30 | **LOW** | **Token may appear in browser history/logs before one-time consumption.** | Resume tokens are placed in the query string. They are hashed at rest and single-use, which limits impact. | Prefer URL fragments exchanged by client POST or aggressive no-referrer/no-store and immediate token stripping. Preserve one-time, short expiry. |

### Injection review

- **SQL injection:** no direct string-concatenated SQL was found in application
  request paths. Supabase query methods parameterize values. The only v2
  `.or()` construction first validates the value as a UUID. No SQL injection
  finding is raised.
- **Command injection:** no route shells out or constructs an OS command from
  request data. No command-injection finding is raised.
- **SSRF:** no arbitrary URL fetch was found. SEC-17 is a conditional
  credential-forwarding/host-trust issue in internal self-fetches, not a
  general arbitrary URL fetch.
- **XSS:** React rendering is generally escaped and receipt HTML explicitly
  escapes values. SEC-06 and SEC-22 are the confirmed navigation/email
  injection paths.

## Endpoint-by-endpoint authorization audit

`Order access` currently means either a validated bearer user owning
`orders.user_id` or a signed guest cookie whose single order ID matches.
Because most data access uses the service-role client, each application check
is the only barrier; RLS does not provide a second line of defense in those
routes.

| Endpoint | Intended caller and current enforcement | Verdict |
| --- | --- | --- |
| `POST /admin/orders/image-url` | Canonical admin helper, then service-role signed URL | Keep; add rate/audit and one admin model |
| `GET /api/abandonment-feedback/eligibility` | Order access and ownership | Acceptable; rate limit |
| `POST /api/abandonment-feedback/shown` | Order access and ownership | Acceptable; idempotent DB transition preferred |
| `POST /api/abandonment-feedback/submit` | Order access and ownership | Ownership is checked; Stripe/credit workflow needs command idempotency and rate limiting |
| `POST /api/admin/abandoned-checkouts/[id]` | Canonical admin helper | Admin-only; destructive classification/deletion needs stronger audit/retention policy |
| `GET /api/admin/orders` | Canonical admin helper | Auth is duplicated internally; unpaginated, reads `*`, and performs parallel live Stripe lookups |
| `PATCH /api/admin/orders/[id]` | Canonical admin helper | Keep only explicit audited commands |
| `POST /api/admin/orders/adjust-capture-amount` | Canonical admin helper | Admin-only; payment mutation must delegate to canonical payment command |
| `POST /api/admin/orders/adjust-order-quantity` | Canonical admin helper | Admin-only; retain reason/audit, reduce duplicate projections |
| `GET /api/admin/system-health` | Canonical admin helper | Correct boundary; health semantics need changes below |
| `GET /api/armory/orders` | Static `ARMORY_READ_TOKEN` | Authenticated machine read, but overbroad and long-lived (SEC-16) |
| `GET /api/cart` | Order access; queries owner/guest draft | Ownership is enforced; logs whole order data |
| `GET /api/cart/has-items` | Order access | Acceptable; consolidate with cart DTO |
| `POST /api/cart/resolve` | Order access plus ownership | Ownership is enforced; trusts compromised verification state from SEC-02/03 |
| `POST /api/checkout/authorized` | Order access, ownership, retrieves Stripe PI | Amount/order checks are good; prescription bypass and non-idempotent capture are critical |
| `POST /api/checkout/capture` | Authenticated bearer user plus ownership | Duplicate capture surface; remove/delegate |
| `POST /api/checkout/pay` | Order access plus ownership via internal resolution | Guest support is valid; self-fetch credential forwarding and no durable idempotency |
| `POST /api/checkout/price` | Authenticated bearer user plus ownership | Duplicate price surface; guest inconsistency; merge into one quote service |
| `POST /api/internal/commerce/reconcile` | Shared internal bearer plus v2 flag | Scope is protected; split secret and fix reconciliation semantics |
| `GET /api/order-recovery/current` | Guest cookie for one order | Acceptable DTO; use expiring/revocable guest session |
| `POST /api/order-recovery/email` | Public email input | Intentionally public, but enumerates `found` and has no throttle; remote table is missing |
| `POST /api/orders` | Public guest or authenticated user; creates/reuses own draft | Guest creation is intended; shared Auth principal and no quota are unsafe |
| `GET /api/orders/list` | Bearer user, filtered by user ID | Ownership correct; consolidate auth/cookie behavior and DTO |
| `POST /api/orders/update-verification-details` | Bearer user plus ownership | Ownership correct; overlaps `/verification/details` and should be removed/merged |
| `GET /api/orders/[id]` | Order access plus ownership | Correct service-role guard; retain through canonical DAL |
| `POST /api/orders/[id]/archive` | Bearer owner or hardcoded admin email | Customer “archive” and admin archive are conflated; one-off admin identity must be removed |
| `POST /api/orders/[id]/cancel` | Bearer owner plus ownership/state check | Auth correct; Stripe/DB dual-write and duplicate command surface remain |
| `POST /api/orders/[id]/capture` | Bearer owner plus ownership/verification check | A customer should not directly command capture; remove/delegate to workflow |
| `POST /api/orders/[id]/pay` | Bearer owner plus ownership | Duplicates checkout pay and excludes guests; remove/delegate |
| `POST /api/orders/[id]/price` | Order access plus ownership | Correct guard; one of several overlapping quote/resolve paths |
| `POST /api/orders/[id]/reauthorize` | Bearer owner plus ownership | New PI is not idempotent and overwrites the previous reference; redesign |
| `POST /api/orders/[id]/resolve` | Order access plus ownership | Guard correct; overlaps cart resolution |
| `POST /api/orders/[id]/rx` | Order access plus ownership | Ownership correct; authorization of verification transition is critically wrong |
| `POST /api/orders/[id]/rx-confirm` | Order access plus ownership | Guard correct; server validation of health fields is too weak |
| `POST /api/orders/[id]/rx-ocr` | Order access plus ownership | Guard correct; file/AI/trust controls are unsafe |
| `POST /api/orders/[id]/shipping` | Order access plus ownership and draft state | Guard correct; add strict field formats/lengths |
| `POST /api/orders/[id]/status` | Bearer owner or hardcoded admin | Critical mass assignment of lifecycle state; remove |
| `POST /api/orders/[id]/verify` | Bearer user then nonexistent `profiles.role` | Fail-closed but broken; use canonical admin helper and verification service |
| `POST /api/resolve-lens` | Public | Expected public helper, but can invoke AI and write audits without quota |
| `GET /api/test-resolver` | Public | Development/test endpoint; remove from production routes |
| `POST /api/verification/complete` | Shared internal bearer | Protected but high impact; scoped identity and payment command required |
| `POST /api/verification/details` | Order access plus ownership | Guard correct; overlaps another details endpoint and self-fetches with credentials |
| `POST /api/verification/process` | Shared internal bearer | Protected; sequential direct Stripe capture without durable commands |
| `POST /api/verification/request` | Bearer owner via `user_id` filter | Guard correct; audit insert is not transactionally tied to update |
| `POST /api/verification/send` | Order access plus ownership | Guard correct; email race, user-controlled recipient/content, no quota |
| `POST /api/webhooks/resend` | Svix signature, raw body, event-id idempotency | Good pattern; keep service-only tables and add missing FK index |
| `POST /api/webhooks/stripe` | Stripe signature and v2 flag | Raw-body verification is correct; queue/ack semantics are unsafe |
| `GET /contacts/compare/[slug]` | Public SEO redirect/content route | Public by design; no sensitive access |
| `GET /order/[id]/receipt` | UUID only | Critical IDOR/capability flaw when UUID leaks |
| `GET /resume-order/accept` | Public one-time token, transactional consume attempt | Appropriate capability concept; remote table missing and URL token caveat |

The server-rendered `GET /order/[id]` page is not a Route Handler but is also
part of the authorization surface. It has the same UUID-only flaw as the
receipt route.

### Canonical authorization model

Use one server-only authorization/data-access layer:

1. Resolve exactly one request principal:
   `UserPrincipal`, `GuestPrincipal`, `AdminPrincipal`,
   `InternalServicePrincipal`, or `WebhookPrincipal`.
2. Validate Supabase browser sessions with `auth.getUser()` using the SSR
   cookie client. Support bearer tokens only on explicitly bearer-only APIs;
   never union a bearer user and cookie user.
3. Represent a guest with a random, expiring, revocable server-side guest
   session scoped to one order. Do not create a shared Auth user.
4. Represent admin membership in protected `app_metadata` or a private
   membership table. Do not put roles in a user-writable profile.
5. Expose four reusable guards: `requireUser`, `requireOrderAccess`,
   `requireAdmin`, and `requireInternalScope`.
6. Put ownership checks in the same DAL method that performs the query and
   return narrow DTOs. Mark service-role modules `server-only`.
7. Add origin/CSRF enforcement for cookie-authenticated mutations.
8. Test every route against an authorization matrix: anonymous, other user,
   owner, guest for another order, correct guest, admin, internal service.

## Database audit: legacy objects

### Tables and views

| Object | Decision | Justification |
| --- | --- | --- |
| `public.orders` | **SPLIT, then ARCHIVE** | It combines cart, commercial order, payment, verification, fulfillment, address/patient snapshots, OCR, feedback, email, archive, and queue state. It contains more than 100 columns and multiple representations of the same fact. |
| `public.order_items` | **ARCHIVE / REPLACE** | Sound concept but unused (0 rows), uses cascading deletion, and duplicates quantities already on orders. V2 immutable line items should replace it. |
| `public.order_events` | **ARCHIVE / REPLACE** | Sound concept but unused (0 rows), mutable, cascades on order delete, and event writes are not transactional with most mutations. |
| `public.patients` | **KEEP WITH MODIFICATIONS** | Patient identity is not commerce truth. Keep outside commerce with strict ownership, retention, and non-cascading order snapshots. |
| `public.addresses` | **KEEP WITH MODIFICATIONS** | Reusable customer address-book data may remain, but an order must retain its immutable shipping snapshot. |
| `public.user_patients` | **REMOVE unless multi-patient accounts are an approved product requirement** | Zero rows and no demonstrated active workflow. Recreate later if the product needs relationships. |
| `public.profiles` | **KEEP WITH MODIFICATIONS** | Keep marketing preferences only. Do not add admin role to a row users can update. |
| `public.product_interest` | **MERGE** | Merge with `site_reminders` into a simple marketing-contact/interest table if both remain; both contain email/context/last-seen semantics and one row each. |
| `public.site_reminders` | **MERGE** | Same reasoning as `product_interest`; keep outside commerce with consent/retention fields and rate limits. |
| `public.resolver_audits` | **KEEP WITH MODIFICATIONS** | Useful product-quality audit, but bound input length, add retention, and do not allow health/customer data in free-form strings. |
| `public.federal_holidays` | **KEEP WITH MODIFICATIONS** | Valid shared reference table. Restrict maintenance/compute functions and document how observed holidays are generated. |
| `public.order_email_deliveries` | **KEEP WITH MODIFICATIONS** | Useful current delivery projection. Change order FK away from cascade when moving to immutable commerce history. |
| `public.resend_webhook_events` | **KEEP WITH MODIFICATIONS** | Good signed-event idempotency ledger. Add an `order_id` index and retention policy. |
| `public.admin_orders` | **REMOVE** | Duplicate, security-definer, anonymously readable/updatable. |
| `public.admin_orders_view` | **REMOVE** | Duplicate, security-definer, anonymously readable/updatable. |

### Columns, enum, constraints, triggers, functions, indexes, and policies

- **REMOVE** the legacy `order_status` enum after archive. It mixes payment
  (`authorized`, `captured`), verification (`verified`, `rejected`),
  fulfillment (`fulfilled`, `returned`), and order state.
- **MERGE/REMOVE** duplicated patient names (`patient_name`,
  `patient_full_name`, component name columns, `rx_patient_name`), prescription
  dates/details, passive deadlines, quantity projections, total/revised/
  capture/feedback amounts, archive flags/timestamps, and email projections.
  Historical values remain in the archive; do not choose one and rewrite
  history.
- **FIX** `orders.user_id NOT NULL` plus `ON DELETE SET NULL`. Those rules are
  contradictory: deleting the auth user can fail. V2 correctly avoids an auth
  FK for historical commerce identity.
- **REMOVE** cascade deletion from accounting/audit/email history. Use
  `RESTRICT` or retained external IDs.
- **ADD/MODIFY** constraints in the target model for amount components,
  non-negative quantities, terminal timestamps, one active payment attempt,
  and valid transition commands. Do not use a single cross-domain enum.
- **KEEP** `orders_updated_at` only while legacy is writable; archive it with
  the table.
- **RESTRICT** `calculate_passive_deadline`,
  `generate_federal_holidays`, `insert_holiday`, and `update_updated_at`.
  Direct execute grants are unnecessary. `insert_holiday` and generation are
  currently invokers and cannot insert as `anon`, but they should not be public
  API surface.
- **KEEP** Resend functions service-only.
- **MODIFY** RLS policies to use explicit roles and `(select auth.uid())` where
  appropriate. The current `no access` plus permissive own-access pattern is
  confusing because permissive policies combine with OR.
- **REMOVE** broad default grants. RLS and grants are separate layers.
- **ADD** `resend_webhook_events(order_id)`; retain only indexes supported by
  real query plans after migration. At current volume, advisor-reported unused
  indexes are not a performance incident.
- **CREATE A REAL BASELINE.** The repository cannot reproduce the connected
  schema. Dump reviewed schema-only DDL, reconcile migration ledger versions,
  and establish a clean baseline before v2 migrations.
- **ADD** the missing `order_resume_tokens` migration or remove the feature.
  Current code references the table, but it does not exist in the connected
  project.

## Commerce v2 table-by-table review

| V2 object | Decision | Start-from-scratch assessment |
| --- | --- | --- |
| `orders` | **KEEP WITH MODIFICATIONS** | The small order status and immutable commercial/customer/shipping snapshots are correct. Define placement precisely and avoid copying full sensitive snapshots into audit rows. |
| `order_items` | **KEEP WITH MODIFICATIONS** | Correct immutable line-item boundary. Choose searchable scalar facts plus a deliberately minimized source snapshot; do not duplicate the same product fact without a retention reason. |
| `payments` | **KEEP WITH MODIFICATIONS** | Rename to `payment_attempts` or add explicit attempt/supersession. Store Stripe's raw `status` and intended amount accurately; derive app lifecycle. `authorized_amount_cents = intent.amount` is false before authorization, and `authorized_at = intent.created` is not authorization time. Add `last_reconciled_at`. |
| `payment_events` | **MERGE WITH INBOX** | One Stripe event row can hold immutable payload/metadata plus mutable processing lease/status columns. The one-to-one inbox table adds joins and split lifecycle without an independent cardinality. Protect immutable columns with a trigger. |
| `payment_event_inbox` | **MERGE** | See above. If a real queue product is used, keep the event ledger and remove the home-grown inbox entirely. |
| `payment_operations` | **RENAME and KEEP WITH MODIFICATIONS** | `payment_commands` better describes durable business commands. Primary identity must be a unique command UUID, not a reusable logical amount key. Add lease/owner and recovery metadata. Store the minimal Stripe result, not a full PaymentIntent copy. |
| `prescription_verifications` | **KEEP WITH MODIFICATIONS** | Attempt rows are justified. Clarify whether upload/OCR are evidence sources rather than verification methods, and enforce server-only verified outcomes. |
| `prescription_verification_events` | **MERGE INTO `order_events`** | A universal append-only domain event ledger with `entity_type/entity_id` is simpler at this scale and avoids three event-table implementations. |
| `fulfillments` | **KEEP WITH MODIFICATIONS** | Separate fulfillment is correct. Snapshot ordered quantity and explicit supplier/tracking facts. |
| `fulfillment_events` | **MERGE INTO `order_events`** | Same simplification as verification events. |
| `order_adjustments` | **MERGE/MODIFY** | Status changes do not need a duplicate adjustment plus event containing duplicate full-row snapshots. Keep first-class financial/quantity adjustment records only if accounting queries require them; reference them from one event. |
| `order_events` | **KEEP WITH MODIFICATIONS** | Make this the single domain audit ledger. Add `entity_type/entity_id`, a stable command/event key for idempotency, and minimized before/after diffs rather than full sensitive row copies. |
| `reconciliation_runs` | **KEEP WITH MODIFICATIONS** | Useful operational record. Track cursor/range, last successful completion, and duration. A run with per-item errors should be `completed_with_errors`, not simply succeeded. |
| `reconciliation_findings` | **RENAME/KEEP WITH MODIFICATIONS** | Treat these as deduplicated current issues with first/last seen and resolution, while immutable run/event detail records history. Auto-repaired mismatches must close. |
| `legacy_imports` | **MOVE, then ARCHIVE/REMOVE** | Migration control is not permanent commerce domain data. Put it in a migration/control schema and freeze/archive it after cutover. |
| `order_operational_projection` | **KEEP WITH MODIFICATIONS** | The one-row/one-queue/default-reason design is good. Use an explicit active payment attempt instead of “latest by created_at.” |
| `system_health_summary` | **KEEP WITH MODIFICATIONS** | Good interface, but current metrics count historical failures forever and miss stale work. |
| `legacy_archive` schema in Phase 1 | **REMOVE FROM PHASE 1; ADD when archive tables are created** | An empty placeholder schema/function is premature. Create it in the migration that performs and verifies the archive. |

### Simplified target

A simpler durable model is:

1. `orders`
2. `order_items`
3. `payment_attempts`
4. `stripe_events` (ledger plus processing lease/status)
5. `payment_commands`
6. `refunds`
7. `disputes`
8. `prescription_verifications`
9. `fulfillments`
10. `order_events` (all domain audit events)
11. `reconciliation_runs`
12. `reconciliation_issues`

`refunds` and `disputes` are not speculative: the requested operational model
already claims to support them. First-class IDs, amounts, status, and outcomes
are required because the current latest-charge projection is insufficient.
Migration mappings live outside the permanent domain.

## Stripe and eventual-consistency review

### What is good

- The v2 route reads the raw body and verifies the Stripe signature.
- Stripe event IDs are unique in an immutable ledger.
- The processor fetches current Stripe state, which generally avoids rewinding
  state solely because events arrive out of order.
- A Stripe response is intended to be checkpointed before the database
  projection, which is the correct direction for repairing
  Stripe-success/DB-failure cases.
- Reconciliation has no prescription-verification repository operation, so it
  cannot directly alter verification.

### Remaining edge cases

1. **Lost webhook after premature duplicate 2xx:** SEC-12.
2. **Idempotency collision:** SEC-13.
3. **Unrecoverable mutation gap:** if Stripe succeeds but
   `markOperationStripeSucceeded` fails, the DB has no response. Stripe may
   prune the key after 24 hours. A later retry can create another object.
   Include command ID in Stripe metadata, ingest `payment_intent.created`, and
   reconcile/search by metadata so orphan objects are discoverable.
4. **Create-after-failure bug:** `createOrReusePayment` excludes a failed,
   cancelled, or refunded payment, but computes the same create key from the
   order total. The existing completed operation returns the old PI snapshot,
   so a new attempt is not created.
5. **Repeated-refund bug:** two legitimate partial refunds of the same amount
   use the same key and command row.
6. **Duplicate audit work:** retrying a completed operation re-applies the
   projection and appends another `payment_projection_applied` event. Event
   writes need a unique command/event key.
7. **Concurrent projection race:** `projectionObservedAt` is assigned after the
   Stripe retrieve. A slower request that fetched older state can finish later,
   receive the later timestamp, and overwrite a fresher observation. Capture
   observation start before network I/O or serialize/CAS per payment.
8. **Incorrect authorization facts:** `authorized_amount_cents` is set to
   `intent.amount` for every status, and `authorized_at` uses PI creation time
   when status is `requires_capture`.
9. **Incorrect partial-dispute amount:** `charge.disputed` is boolean. The
   projection treats the entire non-refunded charge as disputed, even when a
   dispute covers only part of it. Persist/reconcile actual Dispute objects.
10. **Incomplete refund aggregation:** only `latest_charge.amount_refunded` is
    used. Preserve Refund IDs and aggregate all applicable successful refunds.
11. **No active-attempt rule:** multiple payment rows per order are allowed,
    and “latest created” is treated as operationally active without explicit
    supersession.
12. **Event linkage is permanently nullable:** the event is inserted before a
    payment may exist and its order/payment links remain null by design.
    Resolve order metadata in the claim or maintain an immutable association
    record so an order's ledger is complete.
13. **Order-integrity mismatch is not rejected:** applying an existing PI to a
    different order returns the existing payment ID without asserting that its
    `order_id` equals the supplied order.
14. **Synchronous webhook load:** each supported event retrieves Stripe and
    performs multiple DB calls before response. Use a durable worker, as
    Stripe's webhook guidance recommends.
15. **Test/live configuration safety:** store and validate expected livemode
    and pin the Stripe API version used by clients and webhook configuration.

## Reconciliation and operational review

### Queue guarantees

The v2 projection returns one row per order and its `CASE` has a default, so
every order belongs to exactly one queue. Every `action_required` branch has a
specific or generic reason; the separate missing-reason health metric is a
good invariant.

Payment reconciliation uses only payment methods and cannot alter
prescription verification. The admin override function does not hard-block an
authorized admin and does not rewrite payment facts. These requirements are
met conceptually.

### Defects

- Reconciliation orders by `payments.updated_at ASC`, but matched rows are not
  updated. Every bounded run can select the same oldest matched payments and
  starve newer rows forever. Add `last_reconciled_at`/cursor and update it on
  every attempt.
- A mismatch finding is inserted and the payment is repaired, but the finding
  remains `open`; health therefore reports a mismatch that no longer exists.
- Retrieval failures create a new open finding every run with no deduplication
  or backoff.
- The caught Stripe error is discarded and replaced with a generic reason,
  reducing diagnosis quality.
- A run containing per-payment errors is marked `succeeded`, which obscures
  degraded runs.
- `reconciliation_failures` counts every failed run in history forever instead
  of current failure state or age since last success.
- `webhook_failures` ignores stale `processing` events.
- Up to 500 sequential Stripe requests can exceed a serverless route timeout;
  queue/batch with a time budget and resumable cursor.
- The legacy admin order API is unpaginated and PostgREST can silently cap it.
  It also performs parallel live Stripe retrievals on page load. At scale,
  “every order is visible” is not guaranteed and admin availability depends on
  Stripe. V2 should read the local projection and expose cursor pagination plus
  total counts.

### Health metrics to keep or add

Keep:

- orphaned orders;
- impossible state count;
- open Stripe/DB mismatches;
- action-required rows without reasons;
- failed webhook work.

Modify/add only the operationally actionable metrics:

- stale `processing` Stripe events and oldest age;
- incomplete/failed payment commands and oldest age;
- time since last successful reconciliation and unreconciled payment count;
- deduplicated open reconciliation issues by severity;
- orders with multiple unsuperseded payment attempts;
- aged authorized payments approaching authorization expiry;
- order/payment currency or amount disagreement;
- fulfillment advanced without verified prescription/captured payment;
- archive/import count or checksum mismatch during cutover;
- failed/aged prescription verification email jobs.

Each metric needs an owner, threshold, and alert path. A dashboard without
alert ownership is observability, not operational control.

## Maintainability and simplicity audit

### Unnecessary complexity

- Three domain event tables plus `order_events` and `order_adjustments`
  implement overlapping audit concepts.
- `payment_events` and its one-to-one inbox split one event lifecycle across
  two tables.
- Full Stripe objects are copied into the event ledger, payment row,
  operation row, and reconciliation finding. This multiplies sensitive data
  and schema drift without adding independent truth.
- Admin status override stores the full order before/after in an adjustment and
  again in an event.
- Numerous legacy routes independently implement pay, capture, cancel, price,
  resolve, verify, and status transitions.
- Internal HTTP self-fetches call another route in the same process and forward
  credentials instead of calling a service.
- A placeholder archive schema and permanent-domain import table arrive before
  the actual archive/import migration.

### Technical debt

- The admin orders page is about 5,000 lines; `RxForm.tsx` is about 1,900
  lines; checkout verification is about 800 lines. Split by stable domain/use
  case, not arbitrary visual fragments.
- `RxForm copy.tsx` is a 1,500-line duplicate and `src/data/lenses.ts` appears
  to be an unused duplicate of the LensCore dataset. Delete only after import
  verification.
- Environment variables are read ad hoc with non-null assertions. The example
  file omits active variables such as `ADMIN_EMAILS`,
  `GUEST_ORDER_COOKIE_SECRET`, `DEV_EMAIL`, and `RESEND_WEBHOOK_SECRET`.
  Validate all server/client environment variables once at startup and fail
  with safe messages.
- Admin identity appears in a default allowlist and individual hardcoded route
  checks.
- Authorization, ownership, status transitions, and error mapping are
  duplicated across handlers.
- Most routes use the service-role client directly, so a missed check is a
  breach rather than an RLS denial.
- Magic lifecycle strings differ across legacy routes and v2.
- Production schema cannot be rebuilt from migrations.
- Order recovery code has no matching remote table.
- The admin list reads every column and performs N live Stripe requests.
- Legacy audit tables exist but have zero rows, creating the appearance rather
  than reality of auditability.

### Abstractions to retain

The Stripe gateway is justified because external financial calls need a
testable boundary. A commerce command service is also justified. The repository
interface is useful if it represents transactional domain operations rather
than every table call. Prefer a smaller command-oriented repository over
generic CRUD or route-level Supabase access.

### Feature flag

Replace the ambiguous boolean with one typed, validated mode such as
`legacy`, `shadow_read`, or `v2`. A single mode is simpler and safer than many
independent booleans. Webhook endpoint registration/secret activation remains
a separate deployment configuration. Never permanently dual-write.

## Testing audit

The local suite is useful but provides more confidence in pure TypeScript than
in the deployed security and database architecture.

Strengths:

- pricing/quantity/shipping invariants have focused tests;
- operational queue matrices cover many state combinations;
- v2 tests cover basic create/capture/cancel/refund, duplicate/out-of-order
  events, signature rejection, and reconciliation isolation;
- production-integrity checks assert several legacy workflow invariants.

False-confidence risks:

- tests are serial `main()` scripts with assertions, not an isolated test
  runner with fixtures, timeouts, reporting, or coverage;
- the 574-line in-memory v2 repository tests the fake's behavior, not
  Supabase/PostgREST grants, RLS, SQL functions, triggers, transactions, or
  concurrent claims;
- the schema contract test searches SQL text; it does not parse or execute the
  migration;
- no test would detect the anonymous admin views, updatable view grants,
  missing remote `profiles.role`, or missing `order_resume_tokens`;
- no route-level authorization matrix exists;
- no browser test covers the `next=javascript:` XSS;
- no test proves that customers cannot write verified/captured/fulfilled
  states;
- no upload test covers oversized files, spoofed MIME, malformed images,
  prompt injection, duplicate processing, or quota;
- payment tests do not cover two same-amount refunds, create-after-failure,
  update-away-and-back, the Stripe-success/checkpoint-failure gap, or duplicate
  audit events;
- webhook tests do not simulate process death after claim, stale leases, or a
  concurrent unfinished duplicate;
- reconciliation tests do not cover fairness, cursor advancement,
  deduplication, automatic finding resolution, partial disputes, multiple
  charges/refunds, or timeout-resume;
- no PostgreSQL integration, disposable Supabase, or end-to-end checkout test
  exists.

Meaningful additions before cutover:

1. Apply the revised migration to a disposable Supabase project from zero.
2. Run SQL assertions for grants, RLS, view security, append-only enforcement,
   FK deletion behavior, uniqueness, and transactional RPC behavior.
3. Run the full authorization matrix against every handler.
4. Add Stripe test-mode contract tests for unique commands, crash recovery,
   duplicate/out-of-order events, refunds, partial disputes, and orphan
   discovery.
5. Add a real worker crash/lease/retry test.
6. Add reconciliation fairness/resume/dedup/resolution tests.
7. Add Playwright flows for guest/user/admin access, redirect safety,
   upload rejection, checkout, capture gating, receipt access, and logout.
8. Add an advisor gate that fails on security-definer exposed views or
   unintended grants.

Do not pursue broad percentage coverage. Cover authority boundaries,
financial failure windows, health-data handling, and operational invariants.

## Complete architectural improvements

1. Adopt the simplified target tables and one universal domain event ledger.
2. Rename `payments` to payment attempts or add explicit attempt number,
   active/superseded state, and one-active-attempt constraint.
3. Persist raw Stripe status/intended amount accurately; derive application
   lifecycle in a projection.
4. Add first-class refund and dispute records with Stripe IDs/status/amounts.
5. Replace logical-amount idempotency with persisted unique command IDs.
6. Merge Stripe event ledger and inbox processing state or use a real durable
   queue.
7. Process webhooks asynchronously with leases, retries, backoff, dead-letter
   visibility, and idempotent event/audit writes.
8. Make Stripe-created objects discoverable by command/order metadata after
   DB checkpoint failure.
9. Add explicit active payment attempt/supersession and validate PI/order
   association in the projection function.
10. Add reconciliation cursor/`last_reconciled_at`, issue deduplication,
    automatic resolution, and partial-success status.
11. Minimize raw snapshots and establish retention by data category.
12. Keep immutable order/item/customer/shipping facts but store sensitive audit
    diffs rather than duplicate full rows.
13. Centralize all authorization and all order/payment/verification transitions.
14. Replace shared guest Auth identity with scoped guest sessions.
15. Replace UUID-only order links with authenticated access or separate
    expiring capabilities.
16. Remove duplicate legacy payment/price/resolve/verification/status routes at
    each bounded cutover.
17. Replace live Stripe admin N+1 reads with the reconciled local projection
    and cursor pagination.
18. Establish a reproducible database baseline and migration policy.
19. Use one typed cutover mode and prohibit permanent dual write.
20. Define retention, vendor agreements, access logging, and deletion for
    prescriptions, Stripe payloads, analytics, emails, and archives.

## Founder decisions still required

1. **Prescription authority:** Which outcomes require a human, which may be
   automated, and what evidence is legally/operationally sufficient? File or
   model presence must not be an outcome.
2. **Sensitive-data vendors:** Are OpenAI, PostHog, Supabase, Resend, support
   tooling, and any future Armory integration contractually approved for the
   exact health/PII data sent to them, with required retention controls?
3. **Customer order access:** Must customers sign in, or should email links use
   short-lived/revocable capabilities? UUID-only access is rejected.
4. **Guest checkout:** Approve server-side guest sessions and the order-claim
   flow; reject a shared Supabase Auth user.
5. **Admin identity:** Choose protected Supabase app metadata or a private
   membership table; define MFA and emergency access.
6. **Payment attempts:** When may a failed/cancelled authorization create a new
   PaymentIntent, and how is the prior attempt shown to support/accounting?
7. **Refund/dispute operations:** Who may initiate, approve, and resolve partial
   refunds/disputes, and how do they affect the order (which must remain a
   separate explicit decision)?
8. **Archive and retention:** Define legal/business retention and deletion
   periods for commerce, prescriptions, raw provider payloads, logs,
   analytics, and email events.
9. **Operational ownership:** Name owners and alert destinations for webhooks,
   payment commands, reconciliation, verification, and fulfillment queues.
10. **Database access path:** Decide whether `commerce_v2` is intentionally
    exposed to the Supabase Data API for `service_role` calls or accessed by a
    direct server connection. `.schema("commerce_v2")` requires explicit
    PostgREST exposed-schema configuration plus reviewed grants.

## Prioritized action list

### CRITICAL

1. Have an authorized operator revoke/drop the two exposed admin views and
   audit Data API access logs. This audit intentionally made no production
   change.
2. Disable the “upload path means verified” and “trust frontend verification”
   paths before accepting more real orders; prevent capture/fulfillment without
   a server-issued verification result.
3. Remove `/api/orders/[id]/status` or reduce it to explicit, validated,
   audited commands.
4. Require real ownership or a separate expiring capability for order and
   receipt pages.
5. Redesign the v2 webhook claim/ack/worker flow and command idempotency before
   treating Phase 1 as the candidate migration.

### HIGH

1. Fix the login redirect XSS with one shared internal-path validator.
2. Add upload validation, bucket limits, quotas, malware/quarantine handling,
   and retention; stop raw health-data logging.
3. Confirm vendor agreements/retention before sending prescription data to
   OpenAI or enabling PostHog replay; default replay off.
4. Centralize authorization and protected admin membership; remove every
   hardcoded/default admin identity and the fixed development identity bypass.
5. Replace the shared guest Auth user and long-lived guest-cookie fallback
   design.
6. Route every legacy Stripe mutation through a durable command service; never
   clear PaymentIntent IDs on transient errors.
7. Redesign payment projection for real authorization time, partial disputes,
   refunds, attempts, and supersession.
8. Fix reconciliation fairness, deduplication, resolution, and health
   semantics.
9. Replace Armory's broad static token/export with scoped machine identity and
   a minimal DTO.
10. Establish a reproducible schema baseline and resolve local/remote migration
    drift.

### MEDIUM

1. Add rate limiting, email idempotency, uniform recovery responses, and
   provider cost controls.
2. Remove internal self-fetches and credential forwarding.
3. Add CSRF/origin enforcement and one principal source per request.
4. Add global security headers/CSP.
5. Redact logs and provider error responses.
6. Require dedicated expiring/revocable guest and resume token secrets.
7. Revoke public function execution and apply explicit grants.
8. Escape all HTML email values.
9. Disable leaked-password risk and require MFA for admins.
10. Split giant UI modules, delete verified dead duplicates, and centralize
    environment validation.

### LOW

1. Remove the public test resolver route and production-visible
   `/debug/orders`, `/debug/rx`, and `/test-lens` pages.
2. Review unused indexes after realistic non-production load.
3. Normalize naming (`cancelled` versus Stripe `canceled`) at boundaries and
   document the mapping.
4. Move query-string resume tokens to a less leak-prone exchange when the
   higher-priority authority issues are resolved.

## Local validation performed

The following passed against the audited working tree on 2026-07-29:

- `npm test`;
- `npm run lint`;
- `npx tsc --noEmit`;
- `npm run build`, including lens coverage and validation-invariant checks;
- conflict/whitespace checks for tracked changes.

The production build exposes 50 Route Handlers plus the dynamic UUID-only
order and receipt surfaces discussed above. These successful checks establish
that the current code compiles and that existing pure-code assertions pass.
They do not validate the SQL in PostgreSQL, remote schema compatibility, route
authorization, or the financial/security failure cases identified in this
report.

## Final cutover recommendation

Do not proceed unchanged and do not treat passing TypeScript tests as evidence
that the database/payment system is ready.

Fix the active critical security issues immediately through an authorized
production remediation process. In the local v2 design, preserve the overall
domain boundaries but redesign payment attempts/commands, webhook queueing,
refund/dispute truth, reconciliation, authorization, guest access, and
sensitive audit storage. Then execute the revised SQL from zero in a
disposable Supabase project, run security advisors and database integration
tests, and perform Stripe test-mode failure injection.

Once those gates pass, Commerce v2 should advance to controlled validation.
Until then, **Commerce v2 is not a cutover candidate**.
