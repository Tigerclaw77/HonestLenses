"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { captureClientException } from "@/lib/posthog/client";
import {
  getCurrentOrderRecovery,
  type OrderRecoveryState,
} from "@/lib/orderRecoveryClient";

const DISMISS_PREFIX = "hl_order_recovery_dismissed:";

export default function OrderRecoveryBanner() {
  const router = useRouter();
  const [recovery, setRecovery] = useState<OrderRecoveryState | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRecovery() {
      const result = await getCurrentOrderRecovery();

      if (result.failure) {
        try {
          captureClientException(result.failure.error, {
            source: "order_recovery_load",
            operation: "order_recovery_current",
            failure_kind: result.failure.kind,
            response_status: result.failure.status ?? null,
          });
        } catch {
          // Recovery is nonessential; telemetry must not affect homepage use.
        }
      }

      const nextRecovery = result.recovery;
      if (!nextRecovery) return;

      if (
        localStorage.getItem(`${DISMISS_PREFIX}${nextRecovery.orderId}`) ===
        "1"
      ) {
        return;
      }

      if (!cancelled) setRecovery(nextRecovery);
    }

    void loadRecovery();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!recovery?.orderId || !recovery.resumeUrl) return null;

  function dismiss() {
    if (recovery?.orderId) {
      localStorage.setItem(`${DISMISS_PREFIX}${recovery.orderId}`, "1");
    }
    setRecovery(null);
  }

  return (
    <div className="order-recovery-banner" role="status">
      <div className="order-recovery-copy">You have an unfinished order.</div>
      <div className="order-recovery-actions">
        <button
          type="button"
          className="order-recovery-resume"
          onClick={() => router.push(recovery.resumeUrl ?? "/cart")}
        >
          Resume Order
        </button>
        <button
          type="button"
          className="order-recovery-dismiss"
          aria-label="Dismiss unfinished order notice"
          onClick={dismiss}
        >
          X
        </button>
      </div>
    </div>
  );
}
