# Honest Lenses production deployment log

Classification: confidential operational record

## Identity

- Release commit:
- Application artifact/deployment ID:
- Production Supabase project ref/region:
- Production Stripe account ID:
- Supabase CLI version:
- Database role:
- Window start/end UTC:
- Founder/incident commander:
- Database operator:
- Application operator:
- Stripe operator:
- Recorder:

## Evidence

| Artifact | Path/reference | SHA-256 | Reviewer |
| --- | --- | --- | --- |
| Schema dump | | | |
| Roles dump | | | |
| Catalog | | | |
| Pre-migration assertions | | | |
| Migration ledger | | | |
| Backup metadata | | | |
| Rollback rows | | | |
| Write-drain observations | | | |
| Dry-run output | | | |
| Post-migration assertions/catalog | | | |
| Security Advisor | | | |
| Test/build/database gate | | | |

## Backup

- Recovery path: PITR / completed backup
- Recovery point UTC:
- Earliest/latest PITR:
- Accepted RPO:
- Measured/accepted RTO:
- Restore rehearsal project/evidence:
- Restore operator:
- Storage object recovery:

## Preflight

| Time UTC | Gate | Result | Evidence/operator |
| --- | --- | --- | --- |
| | Founder checklist | | |
| | Drift comparison | | |
| | Feature flags | | |
| | Production identities | | |
| | Database health | | |
| | Stripe/webhook health | | |
| | Write drain | | |
| | `db push --dry-run` | | |

## Migration execution

| Time UTC | Version | SHA-256 | Start | End | Result/history row | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| | `20260729144510` | `e79d7e03c982809f4ee9a5f49fc5e2f68d4c6e7babe11465ca95b3382256194f` | | | | |
| | `20260729160750` | `6d33638cbc727b8c30b78a11328b091f574856b77845a62ee66b62191d3cb99c` | | | | |

## Verification and smoke tests

| Time UTC | Test group | Result | IDs/evidence | Operator |
| --- | --- | --- | --- | --- |
| | Post-migration assertions | | | |
| | Security Advisor | | | |
| | Customer/public | | | |
| | Cart/checkout | | | |
| | Payment/canary | | | |
| | Admin | | | |
| | Database/integrity | | | |
| | Stripe/webhooks/reconciliation | | | |

## Monitoring

| Time UTC | HTTP/errors | DB/locks | Stripe/webhooks | Auth/RLS | Integrity | Customer reports | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T+0 | | | | | | | |
| T+5m | | | | | | | |
| T+15m | | | | | | | |
| T+30m | | | | | | | |
| T+45m | | | | | | | |
| T+60m | | | | | | | |
| T+2h | | | | | | | |
| T+4h | | | | | | | |
| T+8h | | | | | | | |
| T+12h | | | | | | | |
| T+24h | | | | | | | |

## Incident/rollback

- Trigger:
- Detection time:
- Writes stopped:
- Commit state:
- Stripe events after recovery point:
- Decision: forward fix / app rollback / schema reverse / PITR
- Approval:
- Recovery start/end:
- Post-recovery verification:

## Final decisions

- Writes reopened UTC:
- First hour: PASS / FAIL
- First day: PASS / FAIL
- Open risks:
- Incident commander signature/time:
