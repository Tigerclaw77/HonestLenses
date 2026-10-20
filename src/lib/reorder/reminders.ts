import { createReminderControlToken, type ReminderAction } from "./tokens";

function baseUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://www.honestlenses.com")
    .replace(/\/$/, "");
}

function controlUrl(orderId: string, action: ReminderAction) {
  const token = createReminderControlToken(orderId, action);
  return `${baseUrl()}/reminders/${action}?token=${encodeURIComponent(token)}`;
}

export function buildReorderReminder({ orderId, firstName, reorderUrl, postalAddress, copyVariant }: {
  orderId: string; firstName: string; reorderUrl: string; postalAddress: string;
  copyVariant?: "reliable" | "uncertain" | "follow_up";
}) {
  const actions: [ReminderAction, string][] = [
    ["postpone_30", "Remind Me Later"],
    ["stop", "Stop Reminders"],
  ];
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]!);
  const links = actions.map(([action, label]) => ({ label, url: controlUrl(orderId, action) }));
  const subject = "A friendly reminder from Honest Lenses";
  const body = copyVariant === "follow_up"
    ? "You asked us to check back around now."
    : copyVariant === "reliable"
      ? "Based on when you last ordered, you may be getting close to needing more contacts."
      : copyVariant === "uncertain"
        ? "It's been a little while since your last order. Need more contacts?"
        : "Just checking in! If you need more contact lenses, reordering is quick and easy.";
  return {
    subject,
    html: `<p>Hi ${escape(firstName)},</p><p>${escape(body)}</p><p><a href="${escape(reorderUrl)}" style="display:inline-block;padding:12px 18px;background:#4c1d95;color:#fff;text-decoration:none;border-radius:6px">Reorder My Contacts</a></p>${links.map(link => `<p><a href="${escape(link.url)}">${link.label}</a></p>`).join("")}<p>This is a commercial message from Honest Lenses.</p><p>Honest Lenses · ${escape(postalAddress)}</p>`,
    text: `Hi ${firstName},\n\n${body}\n\nReorder My Contacts: ${reorderUrl}\n\n${links.map(link => `${link.label}: ${link.url}`).join("\n")}\n\nThis is a commercial message from Honest Lenses.\nHonest Lenses · ${postalAddress}`,
    headers: { "List-Unsubscribe": `<${controlUrl(orderId, "stop")}>` },
  };
}

export { runReorderReminders } from "./recallRunner";
