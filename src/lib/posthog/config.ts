export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

type PublicPostHogConfig = {
  key: string | null;
  host: string;
  rawHost: string | null;
  enabled: boolean;
  replayEnabled: boolean;
  captureExceptionsEnabled: boolean;
  debugEnabled: boolean;
  hostWasNormalized: boolean;
};

function cleanEnv(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizePostHogHost(rawHost?: string | null): {
  host: string;
  wasNormalized: boolean;
} {
  const host = (rawHost ?? DEFAULT_POSTHOG_HOST).replace(/\/$/, "");

  if (
    host === "https://us.posthog.com" ||
    host === "http://us.posthog.com" ||
    host === "https://posthog.com" ||
    host === "http://posthog.com"
  ) {
    return {
      host: DEFAULT_POSTHOG_HOST,
      wasNormalized: true,
    };
  }

  return {
    host,
    wasNormalized: false,
  };
}

export function getPublicPostHogConfig(): PublicPostHogConfig {
  const key = cleanEnv(process.env.NEXT_PUBLIC_POSTHOG_KEY);
  const rawHost = cleanEnv(process.env.NEXT_PUBLIC_POSTHOG_HOST);
  const normalized = normalizePostHogHost(rawHost);

  return {
    key,
    host: normalized.host,
    rawHost,
    enabled: Boolean(key),
    replayEnabled: process.env.NEXT_PUBLIC_POSTHOG_SESSION_REPLAY !== "false",
    captureExceptionsEnabled:
      process.env.NEXT_PUBLIC_POSTHOG_CAPTURE_EXCEPTIONS !== "false",
    debugEnabled:
      process.env.NODE_ENV === "development" &&
      process.env.NEXT_PUBLIC_POSTHOG_DEBUG !== "false",
    hostWasNormalized: normalized.wasNormalized,
  };
}
