const PNG_LENS_IMAGE_IDS = new Set([
  "ULTRA",
  "ULTRA_AST",
  "ULTRA_MF",
  "ULTRA_AST_MF",
]);

export function getLensImage(coreId: string): string {
  const safeCoreId = encodeURIComponent(coreId);
  const extension = PNG_LENS_IMAGE_IDS.has(coreId) ? "png" : "webp";
  return `/lens-images/${safeCoreId}.${extension}`;
}
