import { Suspense } from "react";
import VerificationDetailsClient from "./VerificationDetailsClient";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <VerificationDetailsClient />
    </Suspense>
  );
}