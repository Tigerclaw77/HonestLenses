import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  evaluateWriteDrain,
  stripWriteDrainCanaryHeaders,
} from "@/lib/security/writeDrain";

export function proxy(request: NextRequest) {
  const decision = evaluateWriteDrain(request);
  if (!decision.allowed) {
    return NextResponse.json(
      {
        error: "Writes are temporarily paused for scheduled maintenance.",
        code: "WRITE_DRAIN_ACTIVE",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "Retry-After": "60",
        },
      },
    );
  }

  return NextResponse.next({
    request: {
      headers: stripWriteDrainCanaryHeaders(request.headers),
    },
  });
}

export const config = {
  matcher: ["/api/:path*", "/admin/orders/image-url"],
};
