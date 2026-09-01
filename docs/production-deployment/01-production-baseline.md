# Production baseline capture

> Governance: [Founder authority policy](00-founder-authority.md). This capture procedure supplies evidence; release-specific filenames and ceremony are defaults, not vetoes after explicit scoped founder authorization.

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
| `psql.exe` | PostgreSQL 17.10 at the same `bin` directory | `e0113742a0520185e6dcaf90dafbfd15b02633218d311715f3400613c206d1dc` |

The source archive was the EDB PostgreSQL 17.10 Windows x64 binary archive
`postgresql-17.10-1-windows-x64-binaries.zip`, downloaded over TLS from
`get.enterprisedb.com`; its SHA-256 was
`f9aafca58e7026a1ef2caeee711acf761671e57904d430adc85f468374f5a821`.
The archive is not required after extraction.

The repository gate `npm.cmd run test:security:baseline-toolchain` exercised
these exact binaries and every read-only repository SQL boundary against
disposable PostgreSQL, captured schema, roles, and catalog output, and cleaned
up the instance. Production was not connected.

PostgreSQL 17.10 `pg_dump --schema-only` is approved because the pinned
implementation begins a transaction and executes `SET TRANSACTION ISOLATION
LEVEL REPEATABLE READ, READ ONLY` before reading the source database.
`pg_dumpall` is not used. Roles and memberships are captured by the pinned
repository file `sql/roles-catalog-export.sql` inside an explicit read-only
transaction.

Supabase CLI `2.109.1` remains the pinned migration tool, but it is not part of
baseline capture. Its wrapper is
`%APPDATA%\npm\supabase.cmd` (SHA-256
`113e06711687301b8111ebdd0b507342d8d0af6150d505f1c0f60bb8faad321a`)
and implementation is
`%APPDATA%\npm\node_modules\supabase\dist\supabase.js` (SHA-256
`253caa8c31ee5976322d04a8bd7752622c0915e7943de3f74e2b73395c54a240`).

## Prerequisites

- The production database-owner **Session pooler** Postgres URL from the
  Supabase Dashboard Connect dialog. It must use the Shared Pooler host and
  port `5432`; direct connectivity and IPv6 are not prerequisites.
- Its use is founder-approved only for this procedure. Do not create a
  dedicated role.
- `HL_PRODUCTION_PROJECT_REF` set to the production project ref.
- Production DDL frozen for both captures.
- A local output location outside Git on a BitLocker-protected drive whose
  status is `Fully Encrypted`, `100%`, and `Protection On`. This satisfies the
  encrypted-evidence requirement.
- A clean checkout of the annotated release tag.

No Supabase Management API token is required. Backup/PITR state is verified by
the founder in the Supabase Dashboard under step 10.

The database owner credential is not a waiver of least privilege. Safety comes
from server-enforced read-only transactions in every repository capture file,
the pinned `pg_dump` read-only transaction, verification inside each actual
transaction, a strict command allowlist, no interactive SQL session, and
immediate credential cleanup. `PGOPTIONS default_transaction_read_only=on` is
not required and must not be treated as a gate. If any transaction reports
anything other than `on`, mark the baseline `NOT VERIFIED`, clear the
credential, and stop.

## Environment and native-exit guard

Open a clean PowerShell session. Do not paste secrets into the deployment log.

```powershell
function Assert-NativeSuccess([string]$Operation) {
  if ($LASTEXITCODE -ne 0) {
    if (Get-Command Clear-ProductionBaselineCredential -ErrorAction SilentlyContinue) {
      Clear-ProductionBaselineCredential
    }
    throw "$Operation failed with native exit code $LASTEXITCODE"
  }
}

function Clear-ProductionBaselineCredential {
  Remove-Item Env:HL_PRODUCTION_SESSION_POOLER_URL -ErrorAction SilentlyContinue
}

$env:HL_PRODUCTION_PROJECT_REF='<production project ref>'
$pgBin=Join-Path $env:LOCALAPPDATA 'HonestLensesTools\PostgreSQL-17.10\pgsql\bin'
$pgDump=Join-Path $pgBin 'pg_dump.exe'
$psql=Join-Path $pgBin 'psql.exe'

$baselineStamp=(Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$encryptedEvidenceBase='<existing local directory on a BitLocker-protected drive>'
$evidenceBasePath=(Resolve-Path -LiteralPath $encryptedEvidenceBase).Path
$evidenceDrive=Split-Path -Qualifier $evidenceBasePath
$bitLockerStatus=& manage-bde.exe -status $evidenceDrive
Assert-NativeSuccess 'BitLocker status'
if (
  ($bitLockerStatus -notmatch 'Conversion Status:\s+Fully Encrypted') -or
  ($bitLockerStatus -notmatch 'Percentage Encrypted:\s+100(?:\.0)?%') -or
  ($bitLockerStatus -notmatch 'Protection Status:\s+Protection On')
) {
  throw 'Evidence drive must be fully encrypted with BitLocker protection on'
}

$evidenceRoot=Join-Path $encryptedEvidenceBase "honest-lenses-production-$baselineStamp"
New-Item -ItemType Directory -Path $evidenceRoot -ErrorAction Stop | Out-Null
$bitLockerStatus |
  Set-Content -Encoding utf8 (Join-Path $evidenceRoot 'bitlocker-status.txt')
```

Record `$baselineStamp`; never record credential values.

The only approved database clients for this procedure are the pinned
`pg_dump.exe` and `psql.exe`. `psql.exe` may execute only the named read-only
SQL files under `docs/production-deployment/sql/`. Never start `psql.exe`
interactively, use `--command`, open a query editor, or use another database
tool during capture.

If any database command fails, immediately run the credential-cleanup commands
in step 9 before recording or investigating the failure.

## 1. Clean-checkout and tool verification

```powershell
$dirty=git status --porcelain
Assert-NativeSuccess 'git status'
if ($dirty) { throw 'Baseline capture requires a clean checkout' }

$expectedCommit='<full commit SHA from the founder-authorized scope>'
$releaseCommit=git rev-parse HEAD
Assert-NativeSuccess 'git rev-parse HEAD'
if ($releaseCommit -ne $expectedCommit) {
  throw 'Checkout does not match the founder-authorized commit'
}

$expectedHashes=@{
  $pgDump='031ec0830df6cae8621c5b71188a597987e0c09bb8c3360c8cc76fcc10850cd6'
  $psql='e0113742a0520185e6dcaf90dafbfd15b02633218d311715f3400613c206d1dc'
}
foreach ($tool in @($pgDump,$psql)) {
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
  "psql=$(& $psql --version)"
) | Set-Content -Encoding utf8 (Join-Path $evidenceRoot 'toolchain.txt')
Assert-NativeSuccess 'psql --version recorded in toolchain.txt'
```

Expected: clean checkout, approved tag present, every version and hash exact.

## 2. Secure Session pooler credential and verify the route

Acquire the canonical IPv4-compatible Session pooler URL without recording it:

```powershell
$ownerUrlSecure=Read-Host `
  'Paste the percent-encoded production Session pooler owner URL (port 5432)' `
  -AsSecureString
try {
  $env:HL_PRODUCTION_SESSION_POOLER_URL=(
    [System.Net.NetworkCredential]::new('', $ownerUrlSecure).Password
  )
} finally {
  $ownerUrlSecure.Dispose()
  Remove-Variable ownerUrlSecure -ErrorAction SilentlyContinue
}
$poolerUri=[Uri]$env:HL_PRODUCTION_SESSION_POOLER_URL
if (
  $poolerUri.Port -ne 5432 -or
  $poolerUri.Host -notmatch '\.pooler\.supabase\.com$' -or
  $poolerUri.UserInfo -notmatch [regex]::Escape($env:HL_PRODUCTION_PROJECT_REF)
) {
  Clear-ProductionBaselineCredential
  throw 'Credential is not the approved project Session pooler URL on port 5432'
}
"connection_route=session_pooler_port_5432" |
  Add-Content -Encoding utf8 (Join-Path $evidenceRoot 'toolchain.txt')
$poolerUri=$null
```

Expected: the URL identifies the approved project, Shared Pooler host, and
port `5432`. Do not make a standalone read-only assertion: each repository SQL
file proves `transaction_read_only=on` inside the transaction that performs
its capture, and `pg_dump` creates its own read-only transaction.

## 3. Migration ledger

```powershell
$ledger=& $psql -X --set ON_ERROR_STOP=1 --quiet --tuples-only --no-align `
  --dbname $env:HL_PRODUCTION_SESSION_POOLER_URL `
  --file 'docs/production-deployment/sql/migration-ledger-export.sql'
Assert-NativeSuccess 'migration ledger export'
$ledger | Set-Content -Encoding utf8 (Join-Path $evidenceRoot 'migration-ledger.json')
$ledgerDocument=($ledger | Out-String).Trim() | ConvertFrom-Json
if ($ledgerDocument.transaction_read_only -ne 'on') {
  Clear-ProductionBaselineCredential
  throw 'Migration ledger transaction was not read-only'
}
```

Expected: `transaction_read_only=on`; remote version `20260721143337`;
pending local versions `20260729144510` and `20260729160750`; no other local
or remote version.

## 4. Public schema dump

```powershell
& $pgDump `
  --dbname $env:HL_PRODUCTION_SESSION_POOLER_URL `
  --schema public `
  --schema-only `
  --lock-wait-timeout 5s `
  --format plain `
  --file (Join-Path $evidenceRoot 'schema-public.sql')
Assert-NativeSuccess 'public schema dump'
```

Expected:

- output is non-empty and contains no table data;
- all reviewed public tables, views, functions, constraints, indexes, RLS,
  policies, grants, enum, and trigger are present;
- managed schemas are captured through catalog metadata instead.
- the pinned PostgreSQL 17.10 client enforced its internal `READ ONLY`
  transaction; no external session default is required.

## 5. Roles

```powershell
$roles=& $psql -X --set ON_ERROR_STOP=1 --quiet --tuples-only --no-align `
  --dbname $env:HL_PRODUCTION_SESSION_POOLER_URL `
  --file 'docs/production-deployment/sql/roles-catalog-export.sql'
Assert-NativeSuccess 'roles catalog export'
$roles | Set-Content -Encoding utf8 (Join-Path $evidenceRoot 'roles.json')
$rolesDocument=($roles | Out-String).Trim() | ConvertFrom-Json
if ($rolesDocument.capture.transaction_read_only -ne 'on') {
  Clear-ProductionBaselineCredential
  throw 'Roles export transaction was not read-only'
}
```

Expected: `transaction_read_only=on`; role attributes and memberships without
password material; browser roles without `BYPASSRLS`; expected hosted
service-role properties; and no unexplained custom login role. A permission
failure is `NOT VERIFIED`, not a waiver.

## 6. Full catalog export

```powershell
$catalog=& $psql -X --set ON_ERROR_STOP=1 --quiet --tuples-only --no-align `
  --dbname $env:HL_PRODUCTION_SESSION_POOLER_URL `
  --file 'docs/production-deployment/sql/production-catalog-export.sql'
Assert-NativeSuccess 'production catalog export'
$catalog | Set-Content -Encoding utf8 (Join-Path $evidenceRoot 'catalog.json')
```

Expected: `transaction_read_only` is `on`; roles, memberships, extensions,
schemas, relations, owners, columns, constraints, indexes, function and view
definitions, triggers, enums, policies, grants, default ACLs, migration
history, and Storage buckets are present. `commerce_v2`, `legacy_archive`, and
`security_private` are absent.

## 7. Pre-migration assertions

```powershell
$assertions=& $psql -X --set ON_ERROR_STOP=1 --quiet --tuples-only --no-align `
  --dbname $env:HL_PRODUCTION_SESSION_POOLER_URL `
  --file 'docs/production-deployment/sql/pre-migration-assertions.sql'
Assert-NativeSuccess 'pre-migration assertions'
$assertions | Set-Content -Encoding utf8 `
  (Join-Path $evidenceRoot 'pre-migration-assertions.json')
```

Expected: all 12 checks report `PASS`; check 10 explicitly reports
`transaction_read_only=on`. Any missing result, `FAIL`, warning, or query
error is `NO-GO`.

## 8. Confidential rollback rows

```powershell
$rollbackRows=& $psql -X --set ON_ERROR_STOP=1 --quiet --tuples-only --no-align `
  --dbname $env:HL_PRODUCTION_SESSION_POOLER_URL `
  --file 'docs/production-deployment/sql/rollback-recovery-rows.sql'
Assert-NativeSuccess 'rollback recovery-row export'
$rollbackRows | Set-Content -Encoding utf8 `
  (Join-Path $evidenceRoot 'rollback-recovery-rows.json')
```

This contains production identifiers and must report
`transaction_read_only=on`. Encrypt it immediately, never commit it, and
restrict it to the database and incident commanders.

While DDL remains frozen, set `$evidenceRoot` to a new timestamped folder on
the same verified BitLocker drive, create it, and repeat steps 3 through 8.
Schema, roles, catalog, ledger, assertions, and rollback rows must match after
excluding timestamps. A mismatch makes the baseline non-authoritative.

## 9. Immediate credential cleanup

```powershell
Clear-ProductionBaselineCredential
if (Test-Path Env:HL_PRODUCTION_SESSION_POOLER_URL) {
  throw 'Production database owner credential cleanup failed'
}
```

Run this immediately after the second database capture, or immediately after
any failure. Close the PowerShell session after the local checksum work is
complete. Do not save the URL in PowerShell history, a profile, a script, the
evidence folder, or the deployment log.

## 10. Founder-verified Supabase Dashboard backup/PITR evidence

The founder opens the production project in the Supabase Dashboard and
captures either the three PNG files below or one three-page PDF containing the
same views:

1. `supabase-project-identity.png`: project Settings/General view with the
   production project name, project ref, and region visible.
2. `supabase-backup-status.png`: Database/Backups view with the latest
   completed backup status, backup type, backup timestamp, and available
   backup/retention list visible.
3. `supabase-pitr-status.png`: PITR view showing enabled or disabled. If
   enabled, the earliest and latest available recovery points and recovery
   window must be visible. If disabled, the disabled state must be explicit.

The PDF alternative must be named `supabase-backup-pitr-evidence.pdf` and its
pages must appear in that order. The evidence must be legible, show the
Dashboard project context, and contain no access token, database password, API
key, or customer data.

Record in `deployment-log.md`:

- founder name;
- verification UTC;
- project ref and region;
- latest completed backup type/status/time;
- PITR enabled/disabled and, when enabled, earliest/latest recovery point;
- accepted recovery path and RPO;
- confirmation that no restore, clone, or other mutation was initiated.

The founder compares the visible project ref to
`HL_PRODUCTION_PROJECT_REF`, signs the backup section in the deployment log,
and marks any missing or ambiguous value `NOT VERIFIED`. No Management API
token or API call is part of this procedure.

## 11. Checksums

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

Retain the evidence folder on the confirmed BitLocker-protected local drive,
outside Git, with access limited to the deployment operators. A second
operator verifies each hash independently.

The repeatability check is completed before credential cleanup under step 8.
Do not reconnect after step 9.

## Completion rule

Baseline is `PASS` only when every repository SQL capture reports
`transaction_read_only=on` from inside its actual transaction, pinned
PostgreSQL 17.10 `pg_dump --schema-only` exits zero, expected metadata is
present, all assertions pass, both captures agree, the credential was cleared,
BitLocker evidence shows full encryption with protection on, the manifest is
independently verified, and founder-verified Dashboard backup/PITR evidence
passes.
