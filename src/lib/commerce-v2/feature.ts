export function isCommerceV2Enabled(
  value = process.env.COMMERCE_V2_ENABLED,
): boolean {
  return value?.trim().toLowerCase() === "true";
}
