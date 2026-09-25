export const ORDER_RECOVERY_EMAIL_TYPE = "order_recovery";
export const ORDER_RECOVERY_EMAIL_COOLDOWN_SECONDS = 15 * 60;

export type OrderRecoveryEmailSendClaim = {
  claimId: string;
  claimedAt: string;
};

export async function runWithOrderRecoveryEmailSendClaim({
  acquireClaim,
  send,
}: {
  acquireClaim: () => Promise<OrderRecoveryEmailSendClaim | null>;
  send: (claim: OrderRecoveryEmailSendClaim) => Promise<void>;
}): Promise<boolean> {
  const claim = await acquireClaim();
  if (!claim) return false;

  await send(claim);
  return true;
}

export function getOrderRecoveryEmailIdempotencyKey(claimId: string): string {
  return `order-recovery:${claimId}`;
}
