"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";
import RxForm from "@/components/RxForm";
import type { OcrExtract } from "@/types/ocr";
import ComingSoonOverlay from "../../../components/overlays/ComingSoonOverlay";

type EyeRx = {
  coreId?: string | null;
  sphere?: number;
  cylinder?: number;
  axis?: number;
  add?: string;
  base_curve?: number;
  diameter?: number;
};

type ParsedOcr = {
  brand_raw?: string | null;
  right?: EyeRx;
  left?: EyeRx;
  expires?: string;
  issued_date?: string;
  patient_name?: string;
  doctor_name?: string;
  prescriber_phone?: string;
};

type OcrApiResponse = {
  ocr_json?: ParsedOcr | string;
  ocr_meta?: {
    brand_constraints?: {
      lockedManufacturer?: string | null;
      boostManufacturers?: string[];
      matchedTokens?: string[];
    };
  };
};

type EyeRxDraft = {
  coreId: string;
  sph: string;
  cyl: string;
  axis: string;
  add: string;
  bc: string;
  color: string;
};

type RxDraft = {
  right: EyeRxDraft;
  left: EyeRxDraft;
  expires: string;
};

function isMeaningfulCyl(value: unknown): boolean {
  if (typeof value !== "number") return false;
  return Math.abs(value) >= 0.12;
}

function isMeaningfulAdd(add: unknown): boolean {
  if (typeof add !== "string") return false;

  const s = add.trim().toLowerCase();
  if (!s) return false;

  const compact = s.replace(/\s+/g, "");
  if (s.includes("or") && s.includes(",")) return false;
  if (compact === "d,n,h,orl" || compact === "d,n,horl") return false;

  if (/[+-]?\d+(\.\d+)?/.test(s)) return true;

  if (["h", "hi", "high", "m", "med", "medium", "l", "lo", "low"].includes(s)) {
    return true;
  }

  return false;
}

export default function ConfirmClient() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId") ?? "";
  const source = searchParams.get("source");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialDraft, setInitialDraft] = useState<RxDraft | undefined>();
  const [ocrExtract, setOcrExtract] = useState<OcrExtract | undefined>();

  const [showComingSoon, setShowComingSoon] = useState(false);

  useEffect(() => {
    if (!orderId) return;

    let isMounted = true;

    async function fetchOcr(): Promise<void> {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const accessToken = session?.access_token;
        if (!accessToken) throw new Error("No auth session found");

        const res = await fetch(`/api/orders/${orderId}/rx-ocr`, {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!res.ok) {
          throw new Error(`Failed to load OCR data (${res.status})`);
        }

        const data: OcrApiResponse = await res.json();

        if (!data.ocr_json) {
          throw new Error("OCR data not found for this order");
        }

        // 🔥 FIX: normalize string vs object
        const raw = data.ocr_json;

        const ocr: ParsedOcr =
          typeof raw === "string"
            ? JSON.parse(raw)
            : raw;

        // ===== STRUCTURAL DETECTION =====
        const hasCyl =
          isMeaningfulCyl(ocr.right?.cylinder) ||
          isMeaningfulCyl(ocr.left?.cylinder);

        const hasAdd =
          isMeaningfulAdd(ocr.right?.add) ||
          isMeaningfulAdd(ocr.left?.add);

        // ===== RESOLVER =====
        let proposedLensId: string | null = null;
        let proposalConfidence: "high" | "medium" | "low" | null = null;

        if (ocr.brand_raw && ocr.brand_raw.trim().length > 0) {
          const resolveRes = await fetch("/api/resolve-lens", {
            method: "POST",
            cache: "no-store",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              rawString: ocr.brand_raw,
              hasCyl,
              hasAdd,
              bc: ocr.right?.base_curve ?? ocr.left?.base_curve ?? null,
              dia: ocr.right?.diameter ?? ocr.left?.diameter ?? null,
            }),
          });

          if (!resolveRes.ok) {
            const txt = await resolveRes.text().catch(() => "");
            throw new Error(
              `Resolver API failed (${resolveRes.status}) ${txt}`,
            );
          }

          const resolverData = await resolveRes.json();

          proposedLensId = resolverData.finalLensId ?? null;
          proposalConfidence = resolverData.confidence ?? null;

          if (proposedLensId?.startsWith("CV")) {
            if (isMounted) setShowComingSoon(true);
          }
        }

        // ===== MAP DRAFT =====
        const mapEye = (eye?: EyeRx): EyeRxDraft => ({
          coreId: proposedLensId ?? "",
          sph: eye?.sphere != null ? Number(eye.sphere).toFixed(2) : "",
          cyl: eye?.cylinder != null ? Number(eye.cylinder).toFixed(2) : "",
          axis: eye?.axis != null ? `${eye.axis}` : "",
          add: eye?.add ?? "",
          bc: eye?.base_curve != null ? `${eye.base_curve}` : "",
          color: "",
        });

        const draft: RxDraft = {
          right: mapEye(ocr.right),
          left: mapEye(ocr.left),
          expires: ocr.expires ?? "",
        };

        const meta: OcrExtract = {
          patientName: ocr.patient_name ?? undefined,
          doctorName: ocr.doctor_name ?? undefined,
          doctorPhone: ocr.prescriber_phone ?? undefined,
          issuedDate: ocr.issued_date ?? undefined,
          expires: ocr.expires ?? undefined,
          rawText: ocr.brand_raw ?? undefined,
          proposedLensId,
          proposalConfidence,
        };

        if (isMounted) {
          setInitialDraft(draft);
          setOcrExtract(meta);
        }
      } catch (err: unknown) {
        if (!isMounted) return;

        if (err instanceof Error) setError(err.message);
        else setError("Error loading prescription");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchOcr();

    return () => {
      isMounted = false;
    };
  }, [orderId]);

  if (!orderId) {
    return <div className="p-8 text-red-500">Missing order ID</div>;
  }

  if (loading) {
    return <div className="p-8">Loading prescription...</div>;
  }

  if (error) {
    return <div className="p-8 text-red-500">{error}</div>;
  }

  return (
    <>
      {showComingSoon && (
        <ComingSoonOverlay onClose={() => setShowComingSoon(false)} />
      )}

      <div className="pt-16 px-6 max-w-5xl mx-auto">
        <RxForm
          mode="ocr"
          initialDraft={initialDraft}
          ocrExtract={ocrExtract}
        />

        {source === "manual" && (
          <div className="mt-8">
            <Link
              href="/upload-prescription"
              className="text-sm text-neutral-400 hover:text-white underline"
            >
              Upload prescription instead
            </Link>
          </div>
        )}
      </div>
    </>
  );
}