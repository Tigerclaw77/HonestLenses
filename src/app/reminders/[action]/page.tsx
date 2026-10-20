import type { Metadata } from "next";
import ReminderControl from "./ReminderControl";
import { REMINDER_ACTIONS, type ReminderAction } from "@/lib/reorder/tokens";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Reminder preferences | Honest Lenses",
  robots: { index: false, follow: false }, referrer: "no-referrer",
};

export default async function ReminderControlPage({ params, searchParams }: {
  params: Promise<{ action: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { action } = await params;
  const { token } = await searchParams;
  if (!REMINDER_ACTIONS.includes(action as ReminderAction)) return <main>Reminder link unavailable.</main>;
  return <main className="resume-order-shell"><section className="resume-order-card">
    <h1>Reminder preferences</h1>
    <p>Choose when you would like to hear from Honest Lenses again.</p>
    <ReminderControl action={action as ReminderAction} token={token ?? ""} />
  </section></main>;
}
