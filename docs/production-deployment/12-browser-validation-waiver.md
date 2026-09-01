# Hosted browser validation waiver

> Governance: [Founder authority policy](00-founder-authority.md). This RC-specific waiver is historical. An explicit scoped founder instruction may waive browser ceremony without a separate signature; failed authentication or authorization enforcement remains a genuine blocker when the requested change depends on it.

## Scope

Waiver ID: `HL-BROWSER-WAIVER-2026-07-29`
Release: annotated tag `hl-security-rc1-2026-07-29`
Decision owner: founder/incident commander
Status: **prepared; approval required before GO**

The waived scenario is limited to a clean-profile interactive browser replay of
the hosted customer/admin cookie lifecycle:

- customer and admin sign-in in separate clean profiles;
- expired sessions and stale cookies;
- direct URLs and client-side navigation;
- cross-account receipt, prescription, and order attempts;
- admin dashboard access and sign-out behavior.

## Environmental limitation

The repository browser wrapper could not start the local browser launcher
reliably in this Windows execution environment. One final repository-wrapper
attempt and prior launcher attempts were exhausted; further launcher redesign
was explicitly out of scope. No production browser session was opened and no
production state was changed.

## Equivalent evidence completed

The hosted Supabase and HTTP/API authorization gates passed:

- anonymous protected table/RPC access denied;
- authenticated owner access allowed and cross-account UUID access denied;
- expired/invalid bearer authorization denied;
- customer receipt, prescription, order, and recovery access enforced by
  server-side ownership checks;
- admin routes required the admin authorization path;
- hosted RLS/grants/functions matched the least-privilege model;
- Stripe test-mode and duplicate/out-of-order webhook behavior passed;
- local HTTP authorization regression coverage passed.

These tests exercise the server-side enforcement boundary. Browser cookies and
client navigation do not grant authority independently of those checks.

## Residual risk accepted by this waiver

This waiver does **not** claim an interactive browser pass. Residual risk is
limited to browser/session UX and integration behavior: stale-cookie cleanup,
redirect loops, client navigation, same-browser role switching, and a browser
display failure that HTTP-level tests would not expose. It does not waive a
failed server authorization, RLS, receipt, prescription, order, or admin test.

## Compensating execution-time checks

Before broad traffic reopens:

1. Run the HTTP smoke matrix against the promoted production release while the
   write drain is active.
2. Execute signed customer and admin canaries.
3. Confirm invalid/expired authorization and cross-account requests fail.
4. If an ordinary browser is available during the window, run the clean-profile
   matrix; any failure overrides this waiver and is `NO-GO`.
5. Monitor authentication failures, redirect errors, 401/403/5xx, receipt
   access, and admin access for the first hour.

## Approval

Approval means the founder accepts only the residual browser UX/integration
risk above because the hosted server-side authorization boundary passed.

Decision: ☐ APPROVE WAIVER  ☐ REJECT WAIVER
Founder/incident commander: ____________________
UTC timestamp: ____________________
Reason/conditions: __________________________________________________________

For the historical release, an unsigned waiver was `NOT VERIFIED`. For future
work, an explicit scoped founder instruction is the approval and no additional
waiver signature is required.
