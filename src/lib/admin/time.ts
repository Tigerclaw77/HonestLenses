export const ADMIN_TIME_ZONE = "America/Chicago";
export const ADMIN_TIME_ZONE_LABEL = "CT";

function parseTimestamp(value?: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatAdminDateTime(value?: string | Date | null): string {
  const date = parseTimestamp(value);
  if (!date) return "-";

  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: ADMIN_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)} ${ADMIN_TIME_ZONE_LABEL}`;
}

export function formatAdminDateTimeParts(
  value?: string | Date | null,
): { date: string; time: string } {
  const date = parseTimestamp(value);
  if (!date) return { date: "-", time: "-" };

  return {
    date: new Intl.DateTimeFormat("en-US", {
      timeZone: ADMIN_TIME_ZONE,
      month: "short",
      day: "numeric",
    }).format(date),
    time: `${new Intl.DateTimeFormat("en-US", {
      timeZone: ADMIN_TIME_ZONE,
      hour: "numeric",
      minute: "2-digit",
    }).format(date)} ${ADMIN_TIME_ZONE_LABEL}`,
  };
}

export function formatAdminDate(value?: string | Date | null): string {
  const date = parseTimestamp(value);
  if (!date) return "-";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: ADMIN_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
