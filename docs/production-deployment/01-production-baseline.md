# Production baseline capture

Purpose: create an authoritative, checksummed, read-only record of production
immediately before migration. This is the only approved baseline-capture path.
It does not use Docker or `supabase db dump`.

Do not run this procedure until the founder authorizes production read-only
access. This procedure does not authorize deployment.

## Approved toolchain

Use a clean checkout of the annotated release tag and a clean PowerShell
session:

| Tool | Required version/path | SHA-256 |
| --- | --- | --- |
| `pg_dump.exe` | PostgreSQL 17.10 at `%LOCALAPPDATA%\HonestLensesTools\PostgreSQL-17.10\pgsql\bin\pg_dump.exe` | `031ec0830df6cae8621c5b71188a597987e0c09bb8c3360c8cc76fcc10850cd6` |
| `pg_dumpall.exe` | PostgreSQL 17.10 at the same `bin` directory | `e79d01191c1e506301eeade0f3940350192a918041e01ba39d7cef9dbfbefb56` |
| `psql.exe` | PostgreSQL 17.10 at the same `bin` directory | `e0113742a0520185e6dcaf90dafbfd15b02633218d311715f3400613c206d1dc` |

The source archive was the EDB PostgreSQL 17.10 Windows x64 binary archive
`postgresql-17.10-1-windows-x64-binaries.zip`, downloaded over TLS from
`get.enterprisedb.com`; its SHA-256 was
`f9aafca58e7026a1ef2caeee711acf761671e57904d430adc85f468374f5a821`.
The archive is not required after extraction.

The repository gate `npm.cmd run test:security:baseline-toolchain` exercised
these exact binaries against disposable PostgreSQL, captured schema, roles,
and catalog output, and cleaned up the instance. Production was not connected.

Supabase CLI `2.109.1` remains the pinned migration tool, but it is not part of
baseline capture. Its wrapper is
`%APPDATA%\npm\supabase.cmd` (SHA-256
`113e06711687301b8111ebdd0b507342d8d0af6150d505f1c0f60bb8faad321a`)
and implementation is
`%APPDATA%\npm\node_modules\supabase\dist\supabase.js` (SHA-256
`253caa8c31ee5976322d04a8bd7752622c0915e7943de3f74e2b73395c54a240`).

## Prerequisites

- A direct/session-mode Postgres URL for an existing read-only role.
- A fine-grained Supabase Management API token with `backups_read` for backup
  metadata; it must not have write scopes.
- `HL_PRODUCTION_PROJECT_REF` set to the production project ref.
- Production DDL frozen for both captures.
- An encrypted output location outside Git.
- A clean checkout of the annotated release tag.

If the existing read-only role cannot see required metadata or capture roles,
mark the baseline `NOT VERIFIED`. Do not create or elevate a production role.

## Environment and native-exit guard

Open a clean PowerShell session. Do not paste secrets into the deployment log.

```powershell
function Assert-NativeSuccess([string]$Operation) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Operation failed with native exit code $LASTEXITCODE"
  }
}

$env:HL_PRODUCTION_READONLY_DATABASE_URL='<percent-encoded direct read-only URL>'
$env:HL_PRODUCTION_PROJECT_REF='<production project ref>'
$env:SUPABASE_ACCESS_TOKEN='<fine-grained token with backups_read only>'
$pgBin=Join-Path $env:LOCALAPPDATA 'HonestLensesTools\PostgreSQL-17.10\pgsql\bin'
$pgDump=Join-Path $pgBin 'pg_dump.exe'
$pgDumpAll=Join-Path $pgBin 'pg_dumpall.exe'
$psql=Join-Path $pgBin 'psql.exe'

$baselineStamp=(Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$encryptedEvidenceBase='<mounted encrypted evidence directory>'
$evidenceRoot=Join-Path $encryptedEvidenceBase "honest-lenses-production-$baselineStamp"
New-Item -ItemType Directory -Path $evidenceRoot -ErrorAction Stop | Out-Null
```

Record `$baselineStamp`; never record credential values.

## 1. Clean-checkout and tool verification

```powershell
$dirty=git status --porcelain
Assert-NativeSuccess 'git status'
if ($dirty) { throw 'Baseline capture requires a clean checkout' }

$releaseCommit=git rev-parse HEAD
Assert-NativeSuccess 'git rev-parse HEAD'
$releaseTags=git tag --points-at HEAD
Assert-NativeSuccess 'git tag --points-at HEAD'
if ($releaseTags -notcontains 'hl-security-rc1-2026-07-29') {
  throw 'Checkout is not the approved release tag'
}

$expectedHashes=@{
  $pgDump='031ec0830df6cae8621c5b71188a597987e0c09bb8c3360c8cc76fcc10850cd6'
  $pgDumpAll='e79d01191c1e506301eeade0f3940350192a918041e01ba39d7cef9dbfbefb56'
  $psql='e0113742a0520185e6dcaf90dafbfd15b02633218d311715f3400613c206d1dc'
}
foreach ($tool in @($pgDump,$pgDumpAll,$psql)) {
  $actual=(Get-FileHash -Algorithm SHA256 -LiteralPath $tool).Hash.ToLowerInvariant()
  if ($actual -ne $expectedHashes[$tool]) { throw "Tool hash mismatch: $tool" }
  $version=& $tool --version
  Assert-NativeSuccess "$tool --version"
  if ($version -notmatch 'PostgreSQL\) 17\.10$') {
    throw "Tool version mismatch: $version"
  }
}

@(
  "release_commit=$releaseCommit"
  "release_tags=$($releaseTags -join ',')"
  "pg_dump=$(& $pgDump --version)"
  "pg_dumpall=$(& $pgDumpAll --version)"
  "psql=$(& $psql --version)"
) | Set-Content -Encoding utf8 (Join-Path $evidenceRoot 'toolchain.txt')
Assert-NativeSuccess 'psql --version recorded in toolchain.txt'
```

Expected: clean checkout, approved tag present, every version and hash exact.

## 2. Migration ledger

```powershell
$ledger=& $psql -X --set ON_ERROR_STOP=1 --tuples-only --no-align `
  --dbname $env:HL_PRODUCTION_READONLY_DATABASE_URL `
  --file 'docs/production-deployment/sql/migration-ledger-export.sql'
Assert-NativeSuccess 'migration ledger export'
$ledger | Set-Content -Encoding utf8 (Join-Path $evidenceRoot 'migration-ledger.json')
```

Expected remote version: `20260721143337`. Expected pending local versions are
`20260729144510` and `20260729160750`. No other local or remote version is
permitted.

## 3. Public schema dump

```powershell
& $pgDump `
  --dbname $env:HL_PRODUCTION_READONLY_DATABASE_URL `
  --schema public `
  --schema-only `
  --format plain `
  --file (Join-Path $evidenceRoot 'schema-public.sql')
Assert-NativeSuccess 'public schema dump'
```

Expected:

- output is non-empty and contains no table data;
- all reviewed public tables, views, functions, constraints, indexes, RLS,
  policies, grants, enum, and trigger are present;
- managed schemas are captured through catalog metadata instead.

## 4. Roles

```powershell
& $pgDumpAll `
  --database $env:HL_PRODUCTION_READONLY_DATABASE_URL `
  --roles-only `
  --file (Join-Path $evidenceRoot 'roles.sql')
Assert-NativeSuccess 'roles dump'
```

Expected: role definitions without passwords, browser roles without
`BYPASSRLS`, expected hosted service-role properties, and no unexplained custom
login role. A permission failure is `NOT VERIFIED`, not a waiver.

## 5. Full catalog export

```powershell
$catalog=& $psql -X --set ON_ERROR_STOP=1 --tuples-only --no-align `
  --dbname $env:HL_PRODUCTION_READONLY_DATABASE_URL `
  --file 'docs/production-deployment/sql/production-catalog-export.sql'
Assert-NativeSuccess 'production catalog export'
$catalog | Set-Content -Encoding utf8 (Join-Path $evidenceRoot 'catalog.json')
```

Expected: `transaction_read_only` is `on`; roles, memberships, extensions,
schemas, relations, owners, columns, constraints, indexes, function and view
definitions, triggers, enums, policies, grants, default ACLs, migration
history, and Storage buckets are present. `commerce_v2`, `legacy_archive`, and
`security_private` are absent.

## 6. Pre-migration assertions

```powershell
$assertions=& $psql -X --set ON_ERROR_STOP=1 --tuples-only --no-align `
  --dbname $env:HL_PRODUCTION_READONLY_DATABASE_URL `
  --file 'docs/production-deployment/sql/pre-migration-assertions.sql'
Assert-NativeSuccess 'pre-migration assertions'
$assertions | Set-Content -Encoding utf8 `
  (Join-Path $evidenceRoot 'pre-migration-assertions.json')
```

Expected: all 12 checks report `PASS`. Any missing result, `FAIL`, warning, or
query error is `NO-GO`.

## 7. Confidential rollback rows

```powershell
$rollbackRows=& $psql -X --set ON_ERROR_STOP=1 --tuples-only --no-align `
  --dbname $env:HL_PRODUCTION_READONLY_DATABASE_URL `
  --file 'docs/production-deployment/sql/rollback-recovery-rows.sql'
Assert-NativeSuccess 'rollback recovery-row export'
$rollbackRows | Set-Content -Encoding utf8 `
  (Join-Path $evidenceRoot 'rollback-recovery-rows.json')
```

This contains production identifiers. Encrypt it immediately, never commit it,
and restrict it to the database and incident commanders.

## 8. Backup/PITR metadata

```powershell
$backupHeaders=@{ Authorization="Bearer $env:SUPABASE_ACCESS_TOKEN" }
$backupUri="https://api.supabase.com/v1/projects/$env:HL_PRODUCTION_PROJECT_REF/database/backups"
Invoke-RestMethod -Method Get -Uri $backupUri -Headers $backupHeaders |
  ConvertTo-Json -Depth 20 |
  Set-Content -Encoding utf8 (Join-Path $evidenceRoot 'backups.json')
```

This is a read-only `GET`. Do not use a restore endpoint.

## 9. Checksums

```powershell
Get-ChildItem -LiteralPath $evidenceRoot -File |
  Where-Object Name -ne 'manifest.sha256' |
  Sort-Object Name |
  ForEach-Object {
    $hash=(Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
    "$hash  $($_.Name)"
  } |
  Set-Content -Encoding ascii (Join-Path $evidenceRoot 'manifest.sha256')
```

Copy the encrypted evidence folder to the approved store. A second operator
verifies each hash independently.

## 10. Repeatability check

With DDL frozen, repeat steps 2–6 into a second timestamped folder. Schema,
catalog, ledger, and assertions must match after excluding timestamps. A
mismatch makes the baseline non-authoritative.

## Completion rule

Baseline is `PASS` only when every native command exits zero, expected metadata
is present, all assertions pass, both captures agree, the manifest is
independently verified, and backup verification also passes.
