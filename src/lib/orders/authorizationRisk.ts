export const AUTHORIZATION_WARNING_WINDOW_MS = 24 * 60 * 60 * 1000;
export const AUTHORIZATION_URGENT_WINDOW_MS = 6 * 60 * 60 * 1000;

export type AuthorizationRiskLevel =
  | "not_authorized"
  | "unknown_deadline"
  | "healthy"
  | "warning"
  | "urgent"
  | "expired";

export type AuthorizationRiskInput = {
  stripePaymentIntentStatus?: string | null;
  authorizedAt?: string | null;
  captureBefore?: string | null;
};

export type AuthorizationRisk = {
  level: AuthorizationRiskLevel;
  authorizedAt: string | null;
  captureBefore: string | null;
  ageMs: number | null;
  remainingMs: number | null;
};

function parseTimestamp(value?: string | null): number | null {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getAuthorizationRisk(
  input: AuthorizationRiskInput,
  now = new Date(),
): AuthorizationRisk {
  const authorizedAtMs = parseTimestamp(input.authorizedAt);
  const captureBeforeMs = parseTimestamp(input.captureBefore);
  const authorizedAt =
    authorizedAtMs === null ? null : new Date(authorizedAtMs).toISOString();
  const captureBefore =
    captureBeforeMs === null ? null : new Date(captureBeforeMs).toISOString();
  const ageMs =
    authorizedAtMs === null ? null : Math.max(0, now.getTime() - authorizedAtMs);

  if (input.stripePaymentIntentStatus?.trim().toLowerCase() !== "requires_capture") {
    return {
      level: "not_authorized",
      authorizedAt,
      captureBefore,
      ageMs,
      remainingMs: null,
    };
  }

  if (captureBeforeMs === null) {
    return {
      level: "unknown_deadline",
      authorizedAt,
      captureBefore: null,
      ageMs,
      remainingMs: null,
    };
  }

  const remainingMs = captureBeforeMs - now.getTime();
  const level: AuthorizationRiskLevel =
    remainingMs <= 0
      ? "expired"
      : remainingMs <= AUTHORIZATION_URGENT_WINDOW_MS
        ? "urgent"
        : remainingMs <= AUTHORIZATION_WARNING_WINDOW_MS
          ? "warning"
          : "healthy";

  return {
    level,
    authorizedAt,
    captureBefore,
    ageMs,
    remainingMs,
  };
}

export function authorizationRiskPriority(level: AuthorizationRiskLevel): number {
  const priorities: Record<AuthorizationRiskLevel, number> = {
    expired: 0,
    urgent: 1,
    warning: 2,
    unknown_deadline: 3,
    healthy: 4,
    not_authorized: 5,
  };

  return priorities[level];
}
