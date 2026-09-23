# Honest Lenses Deployment and Search Watchdog

The watchdog is a local operational check. It reports unfinished local work as information and detects canonical remote/production drift, failed or stale Vercel GitHub deployment status, production SEO regressions, and—after authorization—Search Console sitemap and URL Inspection regressions. It cannot commit, push, deploy, publish, request indexing, or access/alter customer data.

Configuration is in `scripts/watchdog/watchdog.config.json`. Extend `priorityUrls` or `expectedSchema` without changing watchdog logic. Runtime state, locks, reports, and logs are written to ignored `.watchdog/`; `.watchdog/LATEST.md` and `.watchdog/LATEST.json` are the current evidence.

## Commands

From the repository root:

```powershell
# Dry run: performs checks but does not persist baseline state, submit a sitemap, or alert.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\watchdog\run-watchdog.ps1 -DryRun

# Manual real run: bypasses the scheduled once-per-day guard.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\watchdog\run-watchdog.ps1

# Reinstall or update the daily 7:00 AM local/Central scheduled task.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\watchdog\install-scheduled-task.ps1
```

The task uses Windows `StartWhenAvailable`, ignores concurrent starts, has a 12-minute execution limit, and invokes a second local lock plus Central-calendar daily guard. Manual runs remain allowed. Success/failure is recorded in `.watchdog/last-run.log` and the scheduled-task result.

## Search Console one-time authorization

No Google credential or secret belongs in Git. The supported credential discovery order is `WATCHDOG_GSC_CREDENTIALS_PATH`, `GOOGLE_APPLICATION_CREDENTIALS`, then standard Google Application Default Credentials locations. Both OAuth `authorized_user` JSON and service-account JSON are supported.

Smallest noninteractive setup when no existing credential is present:

1. In the existing Honest Lenses Google Cloud project, enable the official **Google Search Console API** and create a narrowly used service account plus JSON key.
2. In Search Console, open the `sc-domain:honestlenses.com` property, choose **Settings → Users and permissions → Add user**, paste the service-account email, and grant **Full** permission.
3. Save the JSON outside this repository in a founder-only local folder. Add a user environment variable named `WATCHDOG_GSC_CREDENTIALS_PATH` whose value is the absolute JSON path, then reinstall the scheduled task so later runs inherit it.
4. Run the manual real-run command. Real API errors remain errors; the watchdog never substitutes mock success.

The first authorized run records the current material sitemap hash without resubmitting it. A later real run submits through the official Sitemap API only when the sorted live URL set changes. URL Inspection remains read-only; Google does not expose automated live tests or “Request Indexing” through this API, and the restricted Indexing API is not used.

## Alert behavior

Founder delivery reuses `RESEND_API_KEY` plus `FOUNDER_ALERT_EMAIL` (or the established Armory operator fallback) from the ignored Vercel production env file. Messages include operational URLs/counts/SHAs only—never customer, order, prescription, PHI, or secret data. Alerts send for a changed high-priority failure fingerprint or an unresolved high-priority fingerprint after 72 hours; daily all-clear messages are suppressed.

### Canonical target and incomplete checks

The production target is `origin/main` (`intendedBranch`), independent of the checkout. Upstream is optional report metadata; local branches without one and detached HEAD are supported. Checkout commits ahead of main and source files older than 24 hours are informational and never cause email. Ahead of main does not necessarily mean unpushed.

Real runs explicitly refresh the canonical remote tracking ref. Failed fetches and missing refs make Git/deployment evidence unavailable; stale refs are not silently accepted. Dry runs use the cached ref. Missing local history yields an unknown count, never fabricated drift. Production baselines are reused only for the same canonical ref; the obsolete hardcoded production SHA is no longer used.

Git errors, GitHub API authentication/rate limits/outages, DNS/TLS/connection failures, timeouts, missing Google authorization, notification configuration/provider failures, and generic runner exceptions do not generate ACTION REQUIRED email. Independent checks continue when possible. Unknown checks are recorded locally as diagnostics or informational regressions, with CHECKS INCOMPLETE where applicable. They must not be interpreted as confirmed healthy production. Concurrent runs and the daily guard skip without email. Unexpected runner exceptions still exit nonzero and write LATEST.FAILURE.json, without a fallback failure email. Notification failure is recorded without recursively sending another alert.

Transport-only outages cannot distinguish a local network problem from a production outage. They remain visible in local reports but do not email; an actual HTTP failure response is actionable. This is a deliberate limitation of a single-machine monitor.

### Exact ACTION REQUIRED email conditions

Only these high-priority findings can trigger an email:

- Canonical deployment status is failure/error/cancelled/canceled, or pending/queued/in_progress for more than 6 hours.
- The canonical commit is more than 6 hours old and has no matching deployment status, or differs from the last known production commit for that same canonical branch (including commits ahead of production). A currently progressing deployment gets its own 6-hour grace period.
- robots.txt returns a non-200 HTTP status, or a successful response omits the production sitemap declaration.
- The sitemap returns a non-200 HTTP status, is invalid/empty XML, or its valid URL count changes by both at least 25 URLs and 25% versus the previous report.
- A sitemap URL returns a non-200 HTTP status (including redirects), or a sampled/priority page returns a non-200 desktop/mobile response.
- A checked page has noindex in HTML or the desktop X-Robots-Tag, is blocked by robots.txt, has a missing/wrong canonical, malformed JSON-LD, missing configured schema types, or disjoint visible/Offer prices when both are present. HTML/schema checks require a successful desktop response.
- With authorized Search Console evidence: sitemap download absent or older than 48 hours; reported sitemap errors or warnings; processed count differs from a valid live sitemap count; a priority URL is discovered but never crawled or explicitly not indexed; or Google's canonical differs from the declared canonical.

Missing representative internal links and a pending Search Console sitemap alone are non-alerting. No high-priority finding means no email. Otherwise email sends only when the high-priority fingerprint changes or remains unresolved for 72 hours since the last successful alert. Dry runs never email. The explicit test-notification command sends a separately labeled TEST message.

### Regression verification

`npm run test:watchdog` runs the complete non-dry-run runner in disposable real Git repositories from main with origin/main, a feature branch with its own upstream, and a feature branch without upstream. Each must exit successfully, select the canonical main SHA, and make zero email calls. Tests also cover detached HEAD, failed fetch, missing history, network/API unavailability, deployment grace, preserved genuine deployment/HTTP/XML alerts, and notification failure. HTTP/email are intercepted and host Google credentials are never discovered; no production or customer data changes.
