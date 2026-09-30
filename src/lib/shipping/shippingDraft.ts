export type ShippingDraftFields = {
  shipping_first_name: string;
  shipping_last_name: string;
  shipping_email: string;
  shipping_phone: string;
  shipping_address1: string;
  shipping_address2: string;
  shipping_city: string;
  shipping_state: string;
  shipping_zip: string;
};

const KEY = "hl_shipping_draft_v1";
const MAX_AGE_MS = 30 * 60 * 1000;
const FIELDS: (keyof ShippingDraftFields)[] = [
  "shipping_first_name", "shipping_last_name", "shipping_email",
  "shipping_phone", "shipping_address1", "shipping_address2",
  "shipping_city", "shipping_state", "shipping_zip",
];

export function clearShippingDraft(storage: Storage) {
  try { storage.removeItem(KEY); } catch { /* Browser storage may be unavailable. */ }
}

export function saveShippingDraft(
  storage: Storage,
  orderId: string,
  actorId: string,
  form: ShippingDraftFields,
  now = Date.now(),
) {
  try {
    storage.setItem(KEY, JSON.stringify({ orderId, actorId, savedAt: now, form }));
  } catch { /* Checkout remains usable without browser storage. */ }
}

export function readShippingDraft(
  storage: Storage,
  orderId: string,
  actorId: string,
  now = Date.now(),
): ShippingDraftFields | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== "object") throw new Error("Invalid draft");
    const record = saved as Record<string, unknown>;
    if (
      record.orderId !== orderId || record.actorId !== actorId ||
      typeof record.savedAt !== "number" ||
      now < record.savedAt || now - record.savedAt > MAX_AGE_MS ||
      !record.form || typeof record.form !== "object"
    ) throw new Error("Expired or mismatched draft");
    const form = record.form as Record<string, unknown>;
    if (!FIELDS.every((field) => typeof form[field] === "string")) {
      throw new Error("Invalid draft fields");
    }
    return Object.fromEntries(FIELDS.map((field) => [field, form[field]])) as ShippingDraftFields;
  } catch {
    clearShippingDraft(storage);
    return null;
  }
}
