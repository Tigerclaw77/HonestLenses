"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type RecoveryState = {
  hasRecovery?: boolean;
  orderId?: string;
  resumeUrl?: string;
};

const DISMISS_PREFIX = "hl_order_recovery_dismissed:";

export default function OrderRecoveryBanner() {
  const router = useRouter();
  const [recovery, setRecovery] = useState<RecoveryState | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRecovery() {
      const res = await fetch("/api/order-recovery/current", {
        cache: "no-store",
      });

      if (!res.ok) return;

      const body = (await res.json().catch(() => null)) as RecoveryState | null;
      if (!body?.hasRecovery || !body.orderId || !body.resumeUrl) return;

      if (localStorage.getItem(`${DISMISS_PREFIX}${body.orderId}`) === "1") {
        return;
      }

      if (!cancelled) setRecovery(body);
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
