"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import RxForm, { type RxDraft } from "@/components/RxForm";

type Eye = {
  sphere?: number | string;
  cylinder?: number | string;
  axis?: number | string;
  add?: string;
  base_curve?: string;
  diameter?: string;
};

type OrderRx = {
  left?: Eye;
  right?: Eye;
  brand_raw?: string;
  expires?: string;
};

type OrderResponse = {
  id: string;
  rx?: OrderRx | null;
};

export default function ConfirmClient() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialDraft, setInitialDraft] = useState<RxDraft | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError("Missing orderId");
      setLoading(false);
      return;
    }

    const safeOrderId = orderId;

    async function load() {
      try {
        setLoading(true);

        const res = await fetch(`/api/orders/${safeOrderId}`, {
          cache: "no-store",
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error(`Failed to load order (${res.status})`);
        }

        const order = (await res.json()) as OrderResponse;

        if (!order?.rx) {
          throw new Error("No prescription data found for this order");
        }

        const rx = order.rx;

        console.log("ORDER RX RAW DATA", rx);

        const mapEye = (eye?: Eye): RxDraft["left"] => ({
          coreId: "",
          brand: "", // 🔥 REQUIRED now
          sph: eye?.sphere != null ? Number(eye.sphere).toFixed(2) : "",
          cyl: eye?.cylinder != null ? Number(eye.cylinder).toFixed(2) : "",
          axis: eye?.axis != null ? String(eye.axis) : "",
          add: eye?.add ?? "",
          bc: eye?.base_curve ?? "",
          dia: eye?.diameter ?? "", // 🔥 REQUIRED now
          color: "",
        });

        const draft: RxDraft = {
          left: mapEye(rx.left),
          right: mapEye(rx.right),
          expires: rx.expires ?? "",
        };

        console.log("MAPPED DRAFT", draft);

        setInitialDraft(draft);
        setError(null);
      } catch (err: unknown) {
        console.error("CONFIRM LOAD ERROR", err);

        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load prescription");
        }
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [orderId]);

  if (loading) {
    return <div style={{ padding: 40 }}>Loading prescription...</div>;
  }

  if (error) {
    return <div style={{ padding: 40, color: "red" }}>{error}</div>;
  }

  if (!initialDraft) {
    return <div style={{ padding: 40 }}>No prescription data found.</div>;
  }

  return (
    <div style={{ padding: 40 }}>
      <RxForm initialDraft={initialDraft} />
    </div>
  );
}
