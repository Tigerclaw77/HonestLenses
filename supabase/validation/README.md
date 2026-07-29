# Disposable database security validation

These files support the pre-production security gate. They never connect to
Honest Lenses production.

`0000_legacy_security_fixture.sql` is a synthetic compatibility fixture, not a
production migration. It recreates the relevant Supabase roles, Auth helper,
storage bucket metadata, known legacy application objects, RLS ownership
policy, and the vulnerable grants previously proven in production. All rows
are fabricated `.invalid` test data.

`0001_hosted_legacy_security_fixture.sql` reproduces the same known legacy
application baseline inside a brand-new hosted Supabase project. It deliberately
does not recreate or modify Supabase-managed roles, Auth helpers, schemas, or
Storage tables. It is validation scaffolding, not a production migration.

`0002_hosted_application_compatibility_fixture.sql` adds only the known legacy
columns used by the current customer and admin authorization routes. It exists
because the repository lacks the complete historical production baseline. It
supports hosted application testing but is not evidence of exact production
schema parity and must never be deployed.

`scripts/security/run-database-gate.mjs` starts a temporary PostgreSQL 17
cluster, applies the fixture followed by every repository migration in
timestamp order, attacks the resulting role/RLS/grant boundaries, audits
security-definer objects, and runs local equivalents of the relevant Supabase
Security Advisor checks.

The runner requires temporary, uncommitted test dependencies:

```powershell
npm.cmd install --no-save @embedded-postgres/windows-x64@17.6.0-beta.15 pg@8.16.3
npm.cmd run test:security:database
```

The cluster is initialized beneath the operating-system temporary directory,
listens only on `127.0.0.1`, uses a randomly available local port, and is
deleted after the run.

This harness positively validates PostgreSQL behavior but does not replace a
hosted Supabase Security Advisor run, GoTrue/PostgREST/Storage integration
test, or a rehearsal against a complete reproducible legacy schema.
