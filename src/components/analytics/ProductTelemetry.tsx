"use client";

import { useEffect } from "react";
import { POSTHOG_EVENTS, track } from "@/lib/posthog/client";

type ProductTelemetryProps = {
  coreId: string;
  manufacturer: string;
  displayName: string;
  source: "product_page" | "browse";
};

export default function ProductTelemetry({
  coreId,
  manufacturer,
  displayName,
  source,
}: ProductTelemetryProps) {
  useEffect(() => {
    track(POSTHOG_EVENTS.VIEWED_PRODUCT, {
      core_id: coreId,
      manufacturer,
      lens_name: displayName,
      source,
    });
  }, [coreId, manufacturer, displayName, source]);

  return null;
}
