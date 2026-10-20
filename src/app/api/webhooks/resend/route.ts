export const runtime = "nodejs";

import { handleResendWebhook } from "@/lib/email/resendWebhookHandler";

export async function POST(req: Request) {
  return handleResendWebhook(req);
}
