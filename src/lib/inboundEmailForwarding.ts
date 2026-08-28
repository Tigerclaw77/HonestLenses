import { Resend } from "resend";

const FORWARDING_LEASE_MS = 5 * 60 * 1000;
const SUPPORT_FROM = "Honest Lenses Support <support@honestlenses.com>";

type InboundForwardEnvironment = Record<string, string | undefined>;

export type InboundEmailForwardInput = {
  svixId: string;
  emailId: string;
  receivedAt: string;
  sender: string | null;
  recipient: string | null;
};

export type InboundEmailForwardResult = {
  forwarded: boolean;
  duplicate: boolean;
  forwardedEmailId: string | null;
};

export class InboundEmailForwardingInProgressError extends Error {
  constructor() {
    super("Inbound email forwarding is already in progress.");
    this.name = "InboundEmailForwardingInProgressError";
  }
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function getInboundEmailForwardRecipient(
  environment: InboundForwardEnvironment = process.env,
): string {
  const recipient = environment.INBOUND_EMAIL_FORWARD_RECIPIENT?.trim() ?? "";
  if (!isEmail(recipient)) {
    throw new Error("Inbound email forwarding recipient is not configured");
  }
  return recipient;
}

function getInboundEmailForwardFrom(
  environment: InboundForwardEnvironment = process.env,
): string {
  return environment.INBOUND_EMAIL_FORWARD_FROM?.trim() || SUPPORT_FROM;
}

function conciseError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 1000);
}

function hasActiveLease(startedAt: string | null, now: Date): boolean {
  if (!startedAt) return false;
  const started = new Date(startedAt).getTime();
  return Number.isFinite(started) && now.getTime() - started < FORWARDING_LEASE_MS;
}

async function getSupabaseServer() {
  const { supabaseServer } = await import("@/lib/supabase-server");
  return supabaseServer;
}

async function getOrCreateReceipt(input: InboundEmailForwardInput) {
  const supabaseServer = await getSupabaseServer();
  const { data: existing, error: existingError } = await supabaseServer
    .from("inbound_email_forwards")
    .select("svix_id, forwarding_started_at, forwarded_email_id")
    .eq("svix_id", input.svixId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { error: insertError } = await supabaseServer
    .from("inbound_email_forwards")
    .insert({
      svix_id: input.svixId,
      resend_received_email_id: input.emailId,
      sender: input.sender,
      recipient: input.recipient,
      received_at: input.receivedAt,
    });

  if (!insertError) {
    return {
      svix_id: input.svixId,
      forwarding_started_at: null,
      forwarded_email_id: null,
    };
  }

  const { data: racedReceipt, error: racedReceiptError } = await supabaseServer
    .from("inbound_email_forwards")
    .select("svix_id, forwarding_started_at, forwarded_email_id")
    .eq("svix_id", input.svixId)
    .maybeSingle();

  if (racedReceiptError || !racedReceipt) throw insertError;
  return racedReceipt;
}

async function claimForwarding(
  svixId: string,
  currentStartedAt: string | null,
  nowIso: string,
): Promise<boolean> {
  const supabaseServer = await getSupabaseServer();
  let query = supabaseServer
    .from("inbound_email_forwards")
    .update({ forwarding_started_at: nowIso, failure_reason: null, updated_at: nowIso })
    .eq("svix_id", svixId)
    .is("forwarded_email_id", null);

  query = currentStartedAt
    ? query.eq("forwarding_started_at", currentStartedAt)
    : query.is("forwarding_started_at", null);

  const { data, error } = await query.select("svix_id");
  if (error) throw error;
  return Boolean(data?.length);
}

export async function forwardInboundEmail(
  input: InboundEmailForwardInput,
  environment: InboundForwardEnvironment = process.env,
): Promise<InboundEmailForwardResult> {
  const receipt = await getOrCreateReceipt(input);
  if (receipt.forwarded_email_id) {
    return {
      forwarded: false,
      duplicate: true,
      forwardedEmailId: receipt.forwarded_email_id,
    };
  }

  const now = new Date();
  if (hasActiveLease(receipt.forwarding_started_at, now)) {
    throw new InboundEmailForwardingInProgressError();
  }

  const nowIso = now.toISOString();
  const claimed = await claimForwarding(
    input.svixId,
    receipt.forwarding_started_at,
    nowIso,
  );
  if (!claimed) throw new InboundEmailForwardingInProgressError();

  try {
    const apiKey = environment.RESEND_API_KEY?.trim();
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

    const resend = new Resend(apiKey);
    const result = await resend.emails.receiving.forward({
      emailId: input.emailId,
      from: getInboundEmailForwardFrom(environment),
      to: getInboundEmailForwardRecipient(environment),
      passthrough: true,
    });
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message ?? "Resend did not return a forwarded email ID");
    }

    const forwardedAt = new Date().toISOString();
    const supabaseServer = await getSupabaseServer();
    const { error: updateError } = await supabaseServer
      .from("inbound_email_forwards")
      .update({
        forwarded_email_id: result.data.id,
        forwarded_at: forwardedAt,
        failure_reason: null,
        updated_at: forwardedAt,
      })
      .eq("svix_id", input.svixId)
      .eq("forwarding_started_at", nowIso);
    if (updateError) throw updateError;

    return { forwarded: true, duplicate: false, forwardedEmailId: result.data.id };
  } catch (error) {
    const supabaseServer = await getSupabaseServer();
    await supabaseServer
      .from("inbound_email_forwards")
      .update({
        forwarding_started_at: null,
        failure_reason: conciseError(error),
        updated_at: new Date().toISOString(),
      })
      .eq("svix_id", input.svixId)
      .eq("forwarding_started_at", nowIso);
    throw error;
  }
}
