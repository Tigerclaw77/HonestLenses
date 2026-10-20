import type { Metadata } from "next";
import { Suspense } from "react";
import ReorderAccept from "./ReorderAccept";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Continue reorder | Honest Lenses",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ReorderAcceptPage() {
  return <main className="resume-order-shell"><section className="resume-order-card">
    <h1>Continue your reorder</h1>
    <p>Review your lenses, quantities, shipping, and current total before entering payment details.</p>
    <Suspense fallback={<p>Loading secure link…</p>}><ReorderAccept /></Suspense>
  </section></main>;
}
