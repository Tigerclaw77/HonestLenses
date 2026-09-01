export const TECHNICAL_BLOCKER_TYPES = new Set([
  "missing_credentials",
  "provider_unavailable",
  "impossible_operation",
  "founder_prohibition",
]);

export function parseScopes(value = "") {
  return new Set(value.split(",").map((scope) => scope.trim()).filter(Boolean));
}

export function evaluateFounderAuthority({
  founderGo = false,
  authorizedScopes = [],
  requestedScopes = [],
  advisories = [],
  technicalBlockers = [],
  destructive = false,
  destructiveAuthorized = false,
}) {
  const authorized = new Set(authorizedScopes);
  const blockers = technicalBlockers.map((blocker) => ({ ...blocker }));

  for (const scope of requestedScopes) {
    if (!authorized.has(scope)) {
      blockers.push({ type: "founder_prohibition", detail: `Scope is not authorized: ${scope}` });
    }
  }

  if (destructive && !destructiveAuthorized) {
    blockers.push({ type: "founder_prohibition", detail: "Destructive operation lacks explicit founder intent." });
  }

  for (const blocker of blockers) {
    if (!TECHNICAL_BLOCKER_TYPES.has(blocker.type)) {
      throw new Error(`Unknown technical blocker type: ${blocker.type}`);
    }
  }

  if (!founderGo) {
    return {
      proceed: false,
      decision: "approval_required",
      blockers: [{ type: "founder_go_missing", detail: "FOUNDER_GO=1 is required." }, ...blockers],
      warnings: advisories,
    };
  }

  if (blockers.length > 0) {
    return { proceed: false, decision: "hard_blocked", blockers, warnings: advisories };
  }

  return {
    proceed: true,
    decision: "founder_override_acknowledged",
    blockers: [],
    warnings: advisories.map((warning) =>
      `This normally violates ${warning} safeguard. Founder override acknowledged; proceeding with the scoped action.`,
    ),
  };
}
