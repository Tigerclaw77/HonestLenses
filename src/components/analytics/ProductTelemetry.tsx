"use client";

import { useEffect } from "react";
import { POSTHOG_EVENTS, track } from "@/lib/posthog/client";
import { getLensAnalyticsPropertiesByCoreId } from "@/lib/posthog/lensMetadata";

type ProductTelemetryProps = {
  coreId: string;
  source: "product_page" | "browse";
};

export default function ProductTelemetry({
  coreId,
  source,
}: ProductTelemetryProps) {
  useEffect(() => {
    track(
      POSTHOG_EVENTS.VIEWED_PRODUCT,
      getLensAnalyticsPropertiesByCoreId(coreId, { source }),
    );
  }, [coreId, source]);

  return null;
}
