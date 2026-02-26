"use client";

import Header from "../../components/Header";
import RxForm from "../../components/RxForm";

export default function EnterPrescriptionPage() {
  return (
    <>
      <Header variant="shop" />
      <RxForm mode="manual" />
    </>
  );
}