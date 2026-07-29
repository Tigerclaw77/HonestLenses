<style>
@media print {
  @page { size: letter landscape; margin: 0.35in; }
  body { font-size: 8pt; }
  h1 { font-size: 14pt; margin: 0 0 4pt; }
  p { margin: 2pt 0; }
  table { font-size: 7.5pt; }
  th, td { padding: 2px 4px; }
}
</style>

# Founder Go/No-Go — Honest Lenses production migration

Release/commit: __________  Window (UTC): __________  Founder: __________
Rule: every required item must be `PASS`; `NOT VERIFIED` is a `NO-GO`.

| # | Gate | Decision: check one | Current preparation evidence |
| ---: | --- | --- | --- |
| 1 | Production schema/catalog baseline captured twice and checksummed | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | NOT VERIFIED |
| 2 | Repository matches approved production baseline; no unexplained drift | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | NOT VERIFIED |
| 3 | Migration history exact; Resend matched, two pending only | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | Partial: SQL/version reviewed; fresh output required |
| 4 | Backup completed and recovery point recorded | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | NOT VERIFIED |
| 5 | PITR availability/retention or approved backup RPO verified | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | NOT VERIFIED |
| 6 | Restore-to-new-project rehearsal passed; RTO accepted | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | NOT VERIFIED |
| 7 | Storage object recovery limitation accepted/covered | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | NOT VERIFIED |
| 8 | Migration SQL, hashes, order, locks, role, and transactions reviewed | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | PASS |
| 9 | Rollback/forward-recovery plan reviewed; operators named | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | Plan PASS; names NOT VERIFIED |
| 10 | Stripe test-mode validation passed | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | PASS |
| 11 | Hosted Supabase RLS/API authorization passed | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | PASS |
| 12 | Clean-profile hosted browser authorization passed **or** waiver `HL-BROWSER-WAIVER-2026-07-29` approved | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | HTTP equivalents PASS; waiver prepared, founder approval required |
| 13 | Security database regression gate passed | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | PASS |
| 14 | Repository tests pass at release commit | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | Frozen release tree PASS; exact commit rerun required |
| 15 | Production build passes at release commit | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | Frozen release tree PASS; exact commit rerun required |
| 16 | Commerce v2 disabled in code and every production runtime/worker | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | Code PASS; production NOT VERIFIED |
| 17 | All production feature flags and release artifact verified | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | NOT VERIFIED |
| 18 | Production Supabase/Stripe/hosting identities and credentials verified | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | NOT VERIFIED |
| 19 | Write-drain control, canary, zero-write proof, and reopen order verified | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | Implementation/unit gate PASS; production activation is an execution-time check |
| 20 | Ordered smoke tests prepared; live canary explicitly approved or waived | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | Plan PASS; canary decision NOT VERIFIED |
| 21 | First-hour/day monitoring owners and dashboards prepared | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | Checklist PASS; owners NOT VERIFIED |
| 22 | Abort criteria, thresholds, RPO, and RTO approved | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | Criteria PASS; approval NOT VERIFIED |
| 23 | Dry run lists exactly `20260729144510`, `20260729160750` | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | NOT VERIFIED |
| 24 | Founder explicitly authorizes production execution | ☐ PASS ☐ FAIL ☐ NOT VERIFIED | NOT VERIFIED |

Decision: ☐ GO  ☐ NO-GO
Conditions/notes: ____________________________________________________________
Founder signature/time: ____________________  Database operator: ____________________

Current package recommendation: **PACKAGE READY FOR EXECUTION-TIME CHECKS;
DEPLOYMENT NOT AUTHORIZED**.
