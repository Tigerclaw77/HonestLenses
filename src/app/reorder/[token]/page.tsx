import type { Metadata } from "next";
import ReorderRequest from "./ReorderRequest";
import { captureServerEvent } from "@/lib/posthog/server";
import { POSTHOG_EVENTS } from "@/lib/posthog/events";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Reorder contacts | Honest Lenses",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ReorderPage({ params }: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  await captureServerEvent({ event: POSTHOG_EVENTS.REORDER_ENTRY_OPENED });
  return <main className="resume-order-shell"><section className="resume-order-card">
    <h1>Reorder your contacts</h1>
    <p>We’ll send a short-lived checkout link to the email address on your previous order.</p>
    <ReorderRequest token={token} />
    <p>Can’t use this link? Contact support@honestlenses.com for help.</p>
  </section></main>;
}
