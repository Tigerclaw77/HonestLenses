"use client";

import { useSearchParams } from "next/navigation";
import RxForm from "@/components/RxForm";

export default function ConfirmClient() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");

  if (!orderId) {
    return <div>Missing order ID</div>;
  }

  return (
    <div>
      <h1>Confirm Your Prescription</h1>
      <RxForm orderId={orderId} />
    </div>
  );
}