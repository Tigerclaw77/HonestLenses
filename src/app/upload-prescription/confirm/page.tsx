import { Suspense } from "react";
import ConfirmClient from "./ConfirmClient";
import Header from "@/components/Header";

export default function ConfirmPage() {
  return (
    <Suspense fallback={<div>Loading prescription...</div>}>
      <Header />
      <ConfirmClient />
    </Suspense>
  );
}