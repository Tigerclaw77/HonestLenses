import { lenses } from "@/LensCore";
import { resolveBrand } from "@/lib/resolveBrand";
import { getLensSkus } from "@/lib/pricing/getLensSkus";

type RecordValue = Record<string, unknown>;
export function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue : {};
}
export type SelectedProduct = { sku: string | null; right: string | null; left: string | null };
export type ProductEvidenceOrder = {
  sku?: unknown; rx?: unknown; rx_ocr_raw?: unknown; rx_ocr_meta?: unknown;
  rx_upload_path?: unknown; rx_status?: unknown;
};
export function selectedProduct(order: ProductEvidenceOrder): SelectedProduct {
  const rx = record(order.rx);
  const family = typeof order.sku === "string"
    ? lenses.find(l => getLensSkus(l).includes(order.sku as string))?.coreId : null;
  const eye = (name: string) => typeof record(rx[name]).coreId === "string"
    ? record(rx[name]).coreId as string : (rx[name] ? family ?? null : null);
  return { sku: typeof order.sku === "string" ? order.sku : null, right: eye("right"), left: eye("left") };
}
export function prescribedProducts(raw: unknown): Partial<Record<"right" | "left", string>> {
  const ocr = record(raw);
  const products: Partial<Record<"right" | "left", string>> = {};
  for (const name of ["right", "left"] as const) {
    const eye = record(ocr[name]);
    const brand = eye.brand_raw ?? ocr.brand_raw;
    if (!ocr[name] || typeof brand !== "string") continue;
    const result = resolveBrand({ rawString: brand,
      hasCyl: typeof eye.cylinder === "number" && eye.cylinder !== 0,
      hasAdd: typeof eye.add === "string" && Boolean(eye.add.trim()),
      bc: typeof eye.baseCurve === "number" ? eye.baseCurve : null,
      dia: typeof eye.diameter === "number" ? eye.diameter : null }, lenses);
    if (result.lensId && result.confidence === "high") products[name] = result.lensId;
  }
  return products;
}
export function originalProduct(order: ProductEvidenceOrder): SelectedProduct {
  const saved = record(record(order.rx_ocr_meta).selected_product);
  return Object.keys(saved).length ? saved as SelectedProduct : selectedProduct(order);
}
export function productChanges(order: ProductEvidenceOrder, nextRx: unknown) {
  const original = originalProduct(order);
  const next = selectedProduct({ rx: nextRx });
  return (["right", "left"] as const).filter(eye => original[eye] && original[eye] !== next[eye]);
}
export function hasUnresolvedProductMismatch(order: ProductEvidenceOrder): boolean {
  if (!order.rx_upload_path) return false;
  const prescribed = prescribedProducts(order.rx_ocr_raw);
  const current = selectedProduct(order);
  // Compare catalog identity, never a loose family match (MAX is distinct).
  for (const eye of ["right", "left"] as const) {
    if (current[eye] && prescribed[eye] && current[eye] !== prescribed[eye]) return true;
  }
  const changes = productChanges(order, order.rx);
  if (!changes.length) return false;
  const resolution = record(record(order.rx_ocr_meta).product_resolution);
  return resolution.upload_path !== order.rx_upload_path ||
    resolution.action !== "accept_prescribed_product" ||
    changes.some(eye => resolution[eye] !== current[eye] || prescribed[eye] !== current[eye]);
}

export function productChangeDescription(order: ProductEvidenceOrder, nextRx: unknown): string {
  const before = originalProduct(order);
  const after = selectedProduct({ rx: nextRx });
  const name = (id: string | null) => lenses.find(l => l.coreId === id)?.displayName ?? id ?? "none";
  return productChanges(order, nextRx).map(eye =>
    `${eye === "right" ? "Right" : "Left"} eye: ${name(before[eye])} → ${name(after[eye])}`,
  ).join("; ");
}
