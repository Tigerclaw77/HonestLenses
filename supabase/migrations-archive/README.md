# Archived migration artifacts

These files are retained for audit history but are intentionally excluded from
the active `supabase/migrations` sequence.

- `20260901161929_add_secure_receipt_system.sql` is semantically identical to
  the migration recorded in production as
  `20260905233153_add_secure_receipt_system.sql`. The production-recorded
  version is restored in the active directory.
- `20260901194500_add_atomic_founder_verification_override.sql` has no matching
  production migration-history row, and its function is not present in the
  production catalog. It must not be marked applied or executed merely to
  reconcile migration metadata.

Archived files must not be moved back into the active migration sequence
without a new schema review and an explicit deployment decision.
