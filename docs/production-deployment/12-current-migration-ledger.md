# Current production migration ledger

Verified against the Honest Lenses production Supabase project on
2026-08-11 UTC.

This document supplements the frozen July security-release package. It is the
current filename-to-production-ledger mapping for future migration work.

## Reconciled history

| Production version | Migration name | Historical application evidence |
| --- | --- | --- |
| `20260721143337` | `resend_email_delivery_tracking` | CLI-style history; the repository previously renamed its original local file to this production version. |
| `20260729144510` | `create_commerce_v2_phase1` | CLI-style history with statements split by the migration executor. |
| `20260729160750` | `security_remediation_least_privilege` | CLI-style history with statements split by the migration executor. |
| `20260730173243` | `add_orders_admin_notes` | Applied through the Supabase migration API as one statement. The stored trimmed SQL SHA-256 is `64f1fb361b90b35ada23ad2f892fea2b911bb0dacd9d8cdcfdb7848587db264d`. |
| `20260730183014` | `allow_orders_information_needed` | Applied through the Supabase migration API as one statement. The stored trimmed SQL SHA-256 is `0f92095a02c6316e93eb2df00af20cdd1b8c705ec84d0f7d6ee3b39fc866ec65`. |
| `20260731230830` | `handle_unmatched_resend_webhooks` | Applied through the Supabase migration API as one statement. The stored trimmed SQL SHA-256 is `93dac6e69bdfa05292bc562346d9aeafc08f3f52a2d6164e720853043180da05`. |
| `20260808191129` | `founder_alert_audit` | Applied through the Supabase migration API as one statement. The stored trimmed SQL SHA-256 is `cd273cbedd49a26a5dad41c7101da82f929157a423c9f361d778f08fd0af965d`. |
| `20260811023838` | `prescription_mobile_handoffs` | Applied through the Supabase migration API as one additive transaction. The stored trimmed SQL SHA-256 is `d7f740b4efb4db598161271597381bab26923c5ce13b877de6182bc21af65fad`. |

The four pre-handoff operational migrations originally had local creation
timestamps that differed from their production execution timestamps. Their
names and trimmed SQL hashes match the production history exactly. The local
files were therefore renamed to the genuine production versions. No
production migration-history row was inserted, deleted, or repaired.

## Required future workflow

1. Treat the production version in this table as the canonical local filename.
2. Before a production push, compare `supabase/migrations` with
   `supabase_migrations.schema_migrations` and require an exact version/name
   match for all historical rows.
3. Use a dry run and require exactly the reviewed new migration to be pending.
4. Apply schema SQL and its migration-history row atomically through the
   configured Supabase migration workflow.
5. If the migration API assigns the execution timestamp, rename the new local
   file to that returned production version immediately and verify the stored
   SQL hash.
6. Never use migration repair only to make timestamps look alike. Repair is
   permitted only when the schema effect has been independently proven and the
   history row is demonstrably incorrect.
