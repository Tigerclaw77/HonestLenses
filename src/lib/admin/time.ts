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

export function formatAdminActivity(
  value?: string | Date | null,
  now: Date = new Date(),
): { date: string; detail: string } {
  const date = parseTimestamp(value);
  if (!date) return { date: "-", detail: "-" };

  const elapsedMs = Math.max(0, now.getTime() - date.getTime());
  if (elapsedMs < 24 * 60 * 60 * 1000) {
    const elapsedMinutes = Math.floor(elapsedMs / 60_000);
    let detail = "just now";
    if (elapsedMinutes >= 60) {
      const hours = Math.floor(elapsedMinutes / 60);
      detail = `${hours} hour${hours === 1 ? "" : "s"} ago`;
    } else if (elapsedMinutes >= 1) {
      detail = `${elapsedMinutes} minute${elapsedMinutes === 1 ? "" : "s"} ago`;
    }
    return {
      date: formatAdminDateTimeParts(date).date,
      detail,
    };
  }

  const dateTime = formatAdminDateTimeParts(date);
  return { date: dateTime.date, detail: dateTime.time };
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
