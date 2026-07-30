export const VERIFICATION_ATTEMPT_EVENT_TYPES = {
  phone: "verification_phone_attempted",
  fax: "verification_fax_attempted",
} as const;

export type ManualVerificationAttemptMethod =
  keyof typeof VERIFICATION_ATTEMPT_EVENT_TYPES;

export type VerificationAttemptEvent = {
  order_id: string;
  event_type?: string | null;
  created_at?: string | null;
};

export type VerificationAttemptTimestamps = {
  phoneAttemptedAt: string | null;
  faxAttemptedAt: string | null;
};

export function isManualVerificationAttemptMethod(
  value: unknown,
): value is ManualVerificationAttemptMethod {
  return value === "phone" || value === "fax";
}

export function getVerificationAttemptEventType(
  method: ManualVerificationAttemptMethod,
): string {
  return VERIFICATION_ATTEMPT_EVENT_TYPES[method];
}

export function collectLatestVerificationAttempts(
  events: VerificationAttemptEvent[],
): Map<string, VerificationAttemptTimestamps> {
  const attempts = new Map<string, VerificationAttemptTimestamps>();

  for (const event of events) {
    if (!event.created_at) continue;

    const current = attempts.get(event.order_id) ?? {
      phoneAttemptedAt: null,
      faxAttemptedAt: null,
    };

    if (
      event.event_type === VERIFICATION_ATTEMPT_EVENT_TYPES.phone &&
      (!current.phoneAttemptedAt ||
        Date.parse(event.created_at) > Date.parse(current.phoneAttemptedAt))
    ) {
      current.phoneAttemptedAt = event.created_at;
    }

    if (
      event.event_type === VERIFICATION_ATTEMPT_EVENT_TYPES.fax &&
      (!current.faxAttemptedAt ||
        Date.parse(event.created_at) > Date.parse(current.faxAttemptedAt))
    ) {
      current.faxAttemptedAt = event.created_at;
    }

    attempts.set(event.order_id, current);
  }

  return attempts;
}
