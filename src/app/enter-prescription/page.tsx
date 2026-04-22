"use client";

import Header from "../../components/Header";
import RxForm from "../../components/RxForm";
// import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function EnterPrescriptionContent() {
  // const searchParams = useSearchParams();

  // const rightLens = searchParams.get("right") ?? undefined;
  // const leftLens = searchParams.get("left") ?? undefined;

  return (
    <>
      <Header variant="shop" />

      <RxForm />
    </>
  );
}

export default function EnterPrescriptionPage() {
  return (
    <Suspense fallback={null}>
      <EnterPrescriptionContent />
    </Suspense>
  );
}