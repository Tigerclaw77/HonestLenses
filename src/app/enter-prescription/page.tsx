"use client";

import Header from "../../components/Header";
import RxForm, { type RxDraft } from "../../components/RxForm";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

/* =========================
   Helper
========================= */

function emptyEye(): RxDraft["left"] {
  return {
    coreId: "",
    brand: "",
    sph: "",
    cyl: "",
    axis: "",
    add: "",
    bc: "",
    dia: "",
    color: "",
  };
}

/* =========================
   Content
========================= */

function EnterPrescriptionContent() {
  const searchParams = useSearchParams();

  const rightLens = searchParams.get("right") ?? "";
  const leftLens = searchParams.get("left") ?? "";

  const hasPrefill = rightLens || leftLens;

  const initialDraft: RxDraft | undefined = hasPrefill
    ? {
        right: {
          ...emptyEye(),
          brand: rightLens,
        },
        left: {
          ...emptyEye(),
          brand: leftLens,
        },
        expires: "",
      }
    : undefined;

  return (
    <>
      <Header variant="shop" />
      <RxForm initialDraft={initialDraft} />
    </>
  );
}

/* =========================
   Page Wrapper
========================= */

export default function EnterPrescriptionPage() {
  return (
    <Suspense fallback={null}>
      <EnterPrescriptionContent />
    </Suspense>
  );
}