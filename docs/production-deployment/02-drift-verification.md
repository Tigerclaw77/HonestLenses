# Repository-to-production drift verification

The repository and production are expected to differ only by two reviewed,
pending migrations. The legacy production schema is represented by the
approved baseline artifact, not by a complete historical migration chain.

## Sources compared

1. Repository commit and `supabase/migrations`.
2. Approved `schema-public.sql`, `roles.sql`, `catalog.json`, and
   `manifest.sha256`.
3. A fresh read-only production capture made during the deployment window.

Do not compare production against synthetic files under `supabase/validation`;
they are test fixtures, not production migrations.

## Required repository state

Exactly these migration files may exist:

```text
20260721143337_resend_email_delivery_tracking.sql
20260729144510_create_commerce_v2_phase1.sql
20260729160750_security_remediation_least_privilege.sql
```

Expected SHA-256:

| File | SHA-256 | Production disposition |
| --- | --- | --- |
| `20260721143337_resend_email_delivery_tracking.sql` | `436f288fca137665bbe94040c8282ce5c7bd1575a2774ae1a666162601d56fec` | Already applied; must be skipped |
| `20260729144510_create_commerce_v2_phase1.sql` | `e79d7e03c982809f4ee9a5f49fc5e2f68d4c6e7babe11465ca95b3382256194f` | Pending |
| `20260729160750_security_remediation_least_privilege.sql` | `6d33638cbc727b8c30b78a11328b091f574856b77845a62ee66b62191d3cb99c` | Pending |

Verify:

```powershell
Get-ChildItem 'supabase/migrations' -File -Filter '*.sql' |
  Sort-Object Name |
  Select-Object -ExpandProperty Name

Get-ChildItem 'supabase/migrations' -File -Filter '*.sql' |
  Sort-Object Name |
  Get-FileHash -Algorithm SHA256
```

Any extra, missing, renamed, or changed migration is `FAIL`.

## Migration-history comparison

Review `migration-ledger.json` from the read-only baseline procedure and compare
it to the exact repository filenames.

Expected:

| Version | Local | Remote | Decision |
| --- | --- | --- | --- |
| `20260721143337` | present | present | Must match |
| `20260729144510` | present | absent | Expected pending |
| `20260729160750` | present | absent | Expected pending |

The CLI compares timestamps, not SQL contents. Therefore the
`pre-migration-assertions.sql` canonical Resend SQL hash must also pass.

Never use `migration repair` to make this table look correct during preflight.

## Object comparison

Compare the approved and fresh `catalog.json` exports section by section.
Ignore only `capture.captured_at_utc`. Nothing else is volatile because the
export contains metadata, not table rows.

| Section | Must match before migration | Expected result |
| --- | --- | --- |
| Server | PostgreSQL major/minor and database identity | Same reviewed hosted environment |
| Extensions | Names, versions, schemas | Exact approved set; no missing dependency |
| Roles | Flags and memberships | No new privileged/custom role; anon/auth no `BYPASSRLS` |
| Schemas | `public` present; pending schemas absent | Exact |
| Relations | 13 public tables and two public views, owner `postgres` | Exact |
| Columns | Names, order, type, nullability, defaults, generated expressions | Exact |
| Constraints | PK, FK, unique, check definitions and validation | Exact |
| Indexes | Name and `indexdef` | Exact |
| Functions | Signature, owner, security mode, search path, ACL, definition | Exact |
| Triggers | Name, table, definition | Exact |
| Views | Name, owner, options, definition | Exact |
| Enums | Type, label, order | Exact |
| Policies | Role, command, `USING`, `WITH CHECK` | Exact |
| Grants | Table/routine grantor, grantee, privilege | Exact |
| Default ACL | Owner/schema/object type/ACL | Exact |
| Migration history | Historical Resend only | Exact |
| Storage buckets | `prescriptions` exists and pre-migration configuration matches | Exact |

## Schema dump comparison

Normalize only known non-semantic dump headers, then compare:

```powershell
git diff --no-index --word-diff=plain `
  '<approved-evidence>\schema-public.sql' `
  '<fresh-evidence>\schema-public.sql'
```

Expected: no semantic difference. Do not dismiss ownership, ACL, policy,
function-body, search-path, enum-order, or index-definition changes as
formatting.

## Drift classifications

| Result | Action |
| --- | --- |
| Exact match | Mark drift verification `PASS` |
| Difference explained by a separately approved migration already in repository | Update package, repeat hosted rehearsal, then recapture |
| Unknown production object or changed definition | `NO-GO`; identify provenance before migration |
| Dashboard/manual DDL not in approved baseline | `NO-GO`; capture and review it |
| Extra migration-history version | `NO-GO`; do not repair during the window |
| Missing historical Resend version | `NO-GO`; do not push |
| Pending migration already present remotely | `NO-GO`; determine whether an unauthorized change occurred |

## Expected final output

- All 12 pre-migration assertions: `PASS`.
- Approved/fresh catalog comparison: no difference except capture timestamp.
- Schema dump: no semantic difference.
- Migration list: one matched historical row and exactly two local-only rows.
- Migration hashes: exact values above.
- Founder checklist “Repository matches production baseline”: `PASS`.
