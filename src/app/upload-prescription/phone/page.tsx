import { Suspense } from "react";
import PhoneUploadClient from "./PhoneUploadClient";

export const metadata = {
  title: "Upload your prescription | Honest Lenses",
  robots: { index: false, follow: false },
};

export default function PhoneUploadPage() {
  return (
    <Suspense fallback={<main className="phone-upload-shell">Loading…</main>}>
      <PhoneUploadClient />
    </Suspense>
  );
}
