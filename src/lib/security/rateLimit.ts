import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

type RateLimitOptions = {
  scope: string;
  limit: number;
  windowSeconds: number;
  identity?: string | null;
};

export type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
  unavailable: boolean;
};

function getClientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function getRateLimitSecret(): string | null {
  return process.env.RATE_LIMIT_KEY_SECRET?.trim() || null;
}

export function createRateLimitBucketKey(
  request: Request,
  { scope, identity }: Pick<RateLimitOptions, "scope" | "identity">,
): string | null {
  const secret = getRateLimitSecret();
  if (!secret) return null;

  const material = `${scope}\n${getClientAddress(request)}\n${identity ?? ""}`;
  const digest = createHmac("sha256", secret)
    .update(material)
    .digest("base64url");
  return `${scope}:${digest}`;
}

export async function enforceRateLimit(
  request: Request,
  options: RateLimitOptions,
): Promise<RateLimitDecision> {
  if (
    !Number.isInteger(options.limit) ||
    options.limit <= 0 ||
    !Number.isInteger(options.windowSeconds) ||
    options.windowSeconds <= 0
  ) {
    return {
      allowed: false,
      retryAfterSeconds: options.windowSeconds,
      unavailable: true,
    };
  }

  const bucketKey = createRateLimitBucketKey(request, options);
  if (!bucketKey) {
    return {
      allowed: false,
      retryAfterSeconds: options.windowSeconds,
      unavailable: true,
    };
  }

  const { data, error } = await supabaseServer.rpc("consume_rate_limit", {
    p_bucket_key: bucketKey,
    p_limit: options.limit,
    p_window_seconds: options.windowSeconds,
  });

  if (error || typeof data !== "boolean") {
    console.error("[rate limit] decision unavailable", {
      scope: options.scope,
      code: error?.code ?? "INVALID_RESPONSE",
    });
    return {
      allowed: false,
      retryAfterSeconds: options.windowSeconds,
      unavailable: true,
    };
  }

  return {
    allowed: data,
    retryAfterSeconds: options.windowSeconds,
    unavailable: false,
  };
}

export function rateLimitErrorResponse(decision: RateLimitDecision) {
  if (decision.unavailable) {
    return NextResponse.json(
      { error: "Request protection is temporarily unavailable." },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { error: "Too many requests. Try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(decision.retryAfterSeconds),
      },
    },
  );
}
