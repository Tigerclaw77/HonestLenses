import { createReminderControlToken, type ReminderAction } from "./tokens";
import type { RecallKind } from "./recallPolicy";

function baseUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://www.honestlenses.com")
    .replace(/\/$/, "");
}

function controlUrl(orderId: string, action: ReminderAction) {
  const token = createReminderControlToken(orderId, action);
  return `${baseUrl()}/reminders/${action}?token=${encodeURIComponent(token)}`;
}

export function buildReorderReminder({ orderId, firstName, reorderUrl, postalAddress, kind = "replenishment" }: {
  orderId: string; firstName: string; reorderUrl: string; postalAddress: string;
  kind?: RecallKind;
}) {
  const actions: [ReminderAction, string][] = [
    ["postpone_30", "Remind Me in 30 Days"],
    ["postpone_60", "Remind Me in 60 Days"],
    ["postpone_90", "Remind Me in 90 Days"],
    ["custom", "Choose a Reminder Date"],
    ["stop", "Stop Reminders"],
  ];
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]!);
  const links = actions.map(([action, label]) => ({ label, url: controlUrl(orderId, action) }));
  const expiration = kind !== "replenishment";
  const supply = kind !== "expiration";
  const subject = expiration ? "Your contact lens prescription expires soon" : "Ready for more contacts?";
  const body = [
    expiration ? "Our records indicate that your contact lens prescription will expire soon." : null,
    supply ? "Need more contacts? You can review your previous order and reorder securely." : null,
    expiration ? "If you already have an updated prescription, you can provide it during checkout." : null,
  ].filter(Boolean) as string[];
  return {
    subject,
    html: `<p>Hi ${escape(firstName)},</p>${body.map(line => `<p>${escape(line)}</p>`).join("")}<p><a href="${escape(reorderUrl)}">Reorder My Contacts</a></p><p>Not ready yet?</p>${links.map(link => `<p><a href="${escape(link.url)}">${link.label}</a></p>`).join("")}<p>Thank you for choosing Honest Lenses!</p><p>Honest Lenses · ${escape(postalAddress)}</p>`,
    text: `Hi ${firstName},\n\n${body.join("\n\n")}\n\nReorder My Contacts: ${reorderUrl}\n\nNot ready yet?\n${links.map(link => `${link.label}: ${link.url}`).join("\n")}\n\nThank you for choosing Honest Lenses!\nHonest Lenses · ${postalAddress}`,
    headers: { "List-Unsubscribe": `<${controlUrl(orderId, "stop")}>` },
  };
}

export { runReorderReminders } from "./recallRunner";
