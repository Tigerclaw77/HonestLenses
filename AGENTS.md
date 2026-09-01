# Honest Lenses repository authority

All repository agents and automation must follow the canonical [Founder Authority Policy](docs/production-deployment/00-founder-authority.md).

For production work, precedence is:

1. explicit founder instruction;
2. current technical safety conditions;
3. automated recommendations;
4. runbook defaults.

An explicit, scoped founder instruction satisfies repository approval and signoff requirements. Do not describe a founder-authorized action as "unauthorized by the repository runbook." If an advisory safeguard is waived, report: "This normally violates X safeguard. Founder override acknowledged; proceeding with the scoped action."

Stop only for a genuine hard blocker defined by the canonical policy. Founder authorization is scope-bound: it never authorizes unrelated commits, migrations, production data changes, payment actions, or destructive operations. Destructive work requires explicit founder intent for that operation.
