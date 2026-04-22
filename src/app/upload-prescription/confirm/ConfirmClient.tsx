"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import RxForm, { type RxDraft } from "@/components/RxForm";
import { createClient } from "@supabase/supabase-js";

/* =========================
   TYPES
========================= */

type Eye = {
  sphere?: number | string;
  cylinder?: number | string;
  axis?: number | string;
  add?: string;
  base_curve?: string;
  diameter?: string;
  brand_raw?: string;
};

/* =========================
   COMPONENT
========================= */

export default function ConfirmClient() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");

  const safeOrderId = orderId; // ✅ FIX

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialDraft, setInitialDraft] = useState<RxDraft | null>(null);

  useEffect(() => {
    if (!safeOrderId) {
      setError("Missing orderId");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);

        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        );

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        console.log("SESSION DEBUG", { session, sessionError });

        if (!session?.access_token) {
          throw new Error("No auth session found");
        }

        const res = await fetch(`/api/orders/${safeOrderId}`, {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        console.log("FETCH STATUS", res.status);

        if (!res.ok) {
          const text = await res.text();
          console.error("FETCH ERROR BODY", text);
          throw new Error(`Failed to load order (${res.status})`);
        }

        const json = await res.json();
        const order = json.order;

        if (!order?.rx) {
          throw new Error("No prescription data found for this order");
        }

        const rx = order.rx;

        console.log("ORDER RX RAW DATA", rx);

        const mapEye = (eye?: Eye): RxDraft["left"] => ({
          coreId: "",
          brand: eye?.brand_raw ?? "",
          sph:
            eye?.sphere != null && !isNaN(Number(eye.sphere))
              ? Number(eye.sphere).toFixed(2)
              : "",
          cyl:
            eye?.cylinder != null && !isNaN(Number(eye.cylinder))
              ? Number(eye.cylinder).toFixed(2)
              : "",
          axis: eye?.axis != null ? String(eye.axis) : "",
          add: eye?.add ?? "",
          bc: eye?.base_curve ?? "",
          dia: eye?.diameter ?? "",
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
  }, [safeOrderId]);

  /* =========================
     UI STATES
  ========================= */

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