"use client";

import Header from "../../components/Header";
import RxForm from "../../components/RxForm";
import { useSearchParams } from "next/navigation";

export default function EnterPrescriptionPage() {
  const searchParams = useSearchParams();

  const rightLens = searchParams.get("right") ?? undefined;
  const leftLens = searchParams.get("left") ?? undefined;

  return (
    <>
      <Header variant="shop" />

      <RxForm
        mode="manual"
        initialRightLens={rightLens}
        initialLeftLens={leftLens}
      />
    </>
  );
}