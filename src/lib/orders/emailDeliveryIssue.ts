export type EmailDeliveryAttempt = {
  order_id: string;
  email_type: string;
  recipient: string;
  delivery_status: string;
  last_event_at: string;
  sent_at: string;
  failure_reason?: string | null;
};

export type EmailDeliveryIssue = {
  kind: "customer" | "prescriber";
  emailType: string;
  recipient: string;
  deliveryStatus: string;
  failureReason: string | null;
  occurredAt: string;
};

const ATTENTION_STATUSES = new Set([
  "bounced",
  "complained",
  "failed",
  "suppressed",
]);

function category(emailType: string): EmailDeliveryIssue["kind"] {
  return emailType.trim().toLowerCase() === "verification_request"
    ? "prescriber"
    : "customer";
}

function timestamp(attempt: EmailDeliveryAttempt): number {
  const value = Date.parse(attempt.last_event_at || attempt.sent_at);
  return Number.isFinite(value) ? value : 0;
}

/** The latest attempt in each channel supersedes earlier attempts, while history remains intact. */
export function getCurrentEmailDeliveryIssue(
  attempts: EmailDeliveryAttempt[],
): EmailDeliveryIssue | null {
  const latestByKind = new Map<EmailDeliveryIssue["kind"], EmailDeliveryAttempt>();

  for (const attempt of attempts) {
    const kind = category(attempt.email_type);
    const current = latestByKind.get(kind);
    if (!current || timestamp(attempt) > timestamp(current)) {
      latestByKind.set(kind, attempt);
    }
  }

  return [...latestByKind.entries()]
    .filter(([, attempt]) =>
      ATTENTION_STATUSES.has(attempt.delivery_status.trim().toLowerCase()),
    )
    .map(([kind, attempt]) => ({
      kind,
      emailType: attempt.email_type,
      recipient: attempt.recipient,
      deliveryStatus: attempt.delivery_status,
      failureReason: attempt.failure_reason ?? null,
      occurredAt: attempt.last_event_at || attempt.sent_at,
    }))
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))[0] ?? null;
}

export function emailDeliveryIssueReason(issue: EmailDeliveryIssue): string {
  if (issue.kind === "prescriber") {
    return `Prescription verification email could not be delivered to ${issue.recipient}. Confirm or correct the prescriber email address.`;
  }
  return "Customer email could not be delivered; confirm or correct the email address.";
}
