"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";
import RxForm from "@/components/RxForm";

type EyeRx = {
  lens_id?: string | null;
  sphere?: number;
  cylinder?: number;
  axis?: number;
  add?: string;
  base_curve?: number;
};

type OcrApiResponse = {
  ocr_json?: {
    right?: EyeRx;
    left?: EyeRx;
    expires?: string;
    issued_date?: string;
    patient_name?: string;
    doctor_name?: string;
    prescriber_phone?: string;
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

type OcrExtract = {
  patientName?: string;
  doctorName?: string;
  doctorPhone?: string;
  issuedDate?: string;
  expires?: string;
  rawText?: string;
};

export default function ConfirmClient() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const source = searchParams.get("source");

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [initialDraft, setInitialDraft] = useState<RxDraft | undefined>();
  const [ocrExtract, setOcrExtract] = useState<OcrExtract | undefined>();

  useEffect(() => {
    if (!orderId) return;

    let isMounted = true;

    async function fetchOcr(): Promise<void> {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const accessToken = session?.access_token;

        if (!accessToken) {
          throw new Error("No auth session found");
        }

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

        const ocr = data.ocr_json;

        const mapEye = (eye?: EyeRx): EyeRxDraft => ({
          lens_id: eye?.lens_id ?? "",
          sph: eye?.sphere != null ? `${eye.sphere}` : "",
          cyl: eye?.cylinder != null ? `${eye.cylinder}` : "",
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
          patientName: ocr.patient_name,
          doctorName: ocr.doctor_name,
          doctorPhone: ocr.prescriber_phone,
          issuedDate: ocr.issued_date,
          expires: ocr.expires,
        };

        if (isMounted) {
          setInitialDraft(draft);
          setOcrExtract(meta);
        }
      } catch (err: unknown) {
        if (isMounted) {
          if (err instanceof Error) {
            setError(err.message);
          } else {
            setError("Error loading prescription");
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
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
    <div className="pt-16 px-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-8">Confirm Your Prescription</h1>

      <RxForm
        orderId={orderId}
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
  );
}
