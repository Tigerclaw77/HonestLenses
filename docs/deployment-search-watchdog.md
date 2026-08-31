# Honest Lenses Deployment and Search Watchdog

The watchdog is a local, read-only operational check. It detects meaningful source work older than 24 hours, unpushed commits, remote/production drift, failed or stale Vercel GitHub deployment status, production SEO regressions, and—after authorization—Search Console sitemap and URL Inspection regressions. It cannot commit, push, deploy, publish, request indexing, or access/alter customer data.

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
