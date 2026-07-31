export type CheckoutSuccessMode = "uploaded" | "passive";

export function buildCheckoutSuccessPath({
  orderId,
  mode,
  deadline,
}: {
  orderId: string;
  mode: CheckoutSuccessMode;
  deadline?: string | null;
}): string {
  const params = new URLSearchParams({ mode, orderId });
  if (deadline) params.set("deadline", deadline);
  return `/checkout/success?${params.toString()}`;
}
