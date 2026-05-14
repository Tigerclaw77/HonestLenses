import {
  errorToAnalyticsProperties,
  sanitizeAnalyticsProperties,
  type AnalyticsProperties,
  type PostHogEventName,
} from "./events";

type CaptureServerEventInput = {
  event: PostHogEventName;
  distinctId?: string | null;
  properties?: AnalyticsProperties;
  request?: Request;
};

const SERVER_CAPTURE_TIMEOUT_MS = 1200;

function getPostHogHost(): string {
  return (
    process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com"
  ).replace(/\/$/, "");
}

function getPostHogKey(): string | null {
  return (
    process.env.POSTHOG_PROJECT_API_KEY ||
    process.env.NEXT_PUBLIC_POSTHOG_KEY ||
    null
  );
}

function getRequestProperties(req?: Request): AnalyticsProperties {
  if (!req) return {};

  const url = new URL(req.url);

  return {
    route_path: url.pathname,
    method: req.method,
  };
}

export async function captureServerEvent({
  event,
  distinctId,
  properties = {},
  request,
}: CaptureServerEventInput): Promise<void> {
  const apiKey = getPostHogKey();
  if (!apiKey) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, SERVER_CAPTURE_TIMEOUT_MS);

  try {
    await fetch(`${getPostHogHost()}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event,
        distinct_id: distinctId || "server",
        properties: sanitizeAnalyticsProperties({
          ...getRequestProperties(request),
          ...properties,
          source: "next_api",
        }),
      }),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[posthog-server] capture failed", error);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function captureServerException({
  event,
  error,
  distinctId,
  properties,
  request,
}: CaptureServerEventInput & { error: unknown }): Promise<void> {
  await captureServerEvent({
    event,
    distinctId,
    request,
    properties: {
      ...properties,
      ...errorToAnalyticsProperties(error),
    },
  });
}
