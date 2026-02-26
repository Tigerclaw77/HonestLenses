"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";
import RxForm from "@/components/RxForm";
import type { OcrExtract } from "@/types/ocr";
import ComingSoonOverlay from "../../../components/overlays/ComingSoonOverlay";

type EyeRx = {
  lens_id?: string | null;
  sphere?: number;
  cylinder?: number;
  axis?: number;
  add?: string;
  base_curve?: number;
  diameter?: number;
};

type OcrApiResponse = {
  ocr_json?: {
    brand_raw?: string | null;
    right?: EyeRx;
    left?: EyeRx;
    expires?: string;
    issued_date?: string;
    patient_name?: string;
    doctor_name?: string;
    prescriber_phone?: string;
  };
  ocr_meta?: {
    brand_constraints?: {
      lockedManufacturer?: string | null;
      boostManufacturers?: string[];
      matchedTokens?: string[];
    };
  };
};

type EyeRxDraft = {
  lens_id: string;
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
  // Treat 0.00 as no cyl; small tolerance for OCR noise.
  return Math.abs(value) >= 0.12;
}

function isMeaningfulAdd(add: unknown): boolean {
  if (typeof add !== "string") return false;

  const s = add.trim().toLowerCase();
  if (!s) return false;

  // Ignore legend / option-list patterns like: "D,N,H or L"
  const compact = s.replace(/\s+/g, "");
  if (s.includes("or") && s.includes(",")) return false;
  if (compact === "d,n,h,orl" || compact === "d,n,horl") return false;

  // Numeric add like +1.25 / 2.00 / 1.75
  if (/[+-]?\d+(\.\d+)?/.test(s)) return true;

  // Letter-based adds (keep conservative)
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

        // 1) Pull OCR payload for this order
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
        if (!data.ocr_json)
          throw new Error("OCR data not found for this order");

        const ocr = data.ocr_json;

        // 2) Structural detection (conservative, ignores legend strings)
        const hasCyl =
          isMeaningfulCyl(ocr.right?.cylinder) ||
          isMeaningfulCyl(ocr.left?.cylinder);

        const hasAdd =
          isMeaningfulAdd(ocr.right?.add) || isMeaningfulAdd(ocr.left?.add);

        // 3) Resolve lens server-side (hybrid + AI audit)
        let proposedLensId: string | null = null;
        let proposalConfidence: "high" | "medium" | "low" | null = null;

        if (ocr.brand_raw && ocr.brand_raw.trim().length > 0) {
          const resolveRes = await fetch("/api/resolve-lens", {
            method: "POST",
            cache: "no-store",
            headers: {
              "Content-Type": "application/json",
              // keep auth consistent; your resolver route can ignore it if not needed
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

          const resolverData: {
            finalLensId: string | null;
            confidence: "high" | "medium" | "low";
          } = await resolveRes.json();

          proposedLensId = resolverData.finalLensId ?? null;
          proposalConfidence = resolverData.confidence ?? null;

          // 🔒 CooperVision temporary block
          if (proposedLensId && proposedLensId.startsWith("CV")) {
            if (isMounted) setShowComingSoon(true);
          }
        }

        // 4) Map eye -> draft
        const mapEye = (eye?: EyeRx): EyeRxDraft => ({
          lens_id: proposedLensId ?? "",
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

        // 5) Build OcrExtract (use shared type from @/types/ocr)
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
