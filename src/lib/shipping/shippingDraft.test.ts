import assert from "node:assert/strict";
import {
  clearShippingDraft,
  readShippingDraft,
  saveShippingDraft,
  type ShippingDraftFields,
} from "./shippingDraft";

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
} as Storage;
const form: ShippingDraftFields = {
  shipping_first_name: "Fixture",
  shipping_last_name: "Customer",
  shipping_email: "fixture@example.test",
  shipping_phone: "",
  shipping_address1: "123 Test St",
  shipping_address2: "",
  shipping_city: "Austin",
  shipping_state: "TX",
  shipping_zip: "78701",
};

saveShippingDraft(storage, "order-a", "guest", form, 1_000);
assert.deepEqual(readShippingDraft(storage, "order-a", "guest", 2_000), form);
assert.equal(readShippingDraft(storage, "order-a", "another-user", 2_000), null);
assert.equal(values.size, 0, "actor mismatch clears the previous draft");

saveShippingDraft(storage, "order-a", "guest", form, 1_000);
assert.equal(readShippingDraft(storage, "order-b", "guest", 2_000), null);
assert.equal(values.size, 0, "order mismatch clears the previous draft");

saveShippingDraft(storage, "order-a", "guest", form, 1_000);
assert.equal(readShippingDraft(storage, "order-a", "guest", 30 * 60 * 1000 + 1_001), null);
assert.equal(values.size, 0, "expired draft is removed");

saveShippingDraft(storage, "order-a", "guest", form, 1_000);
clearShippingDraft(storage);
assert.equal(readShippingDraft(storage, "order-a", "guest", 2_000), null);

console.log("Shipping draft scope and expiry tests passed");
