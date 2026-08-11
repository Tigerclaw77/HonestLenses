import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPrescriptionHandoffResponse,
  createPrescriptionHandoffToken,
  getPrescriptionHandoffStatus,
  hashPrescriptionHandoffToken,
  isValidPrescriptionHandoffToken,
  prescriptionHandoffBelongsToOrder,
  prescriptionHandoffCanAcceptUpload,
  prescriptionHandoffTokenMatches,
} from "./prescriptionHandoff";

const token = createPrescriptionHandoffToken();
assert.equal(isValidPrescriptionHandoffToken(token), true);
assert.equal(Buffer.from(token, "base64url").length, 32);
assert.notEqual(createPrescriptionHandoffToken(), token);
assert.equal(hashPrescriptionHandoffToken(token).length, 64);
assert.equal(hashPrescriptionHandoffToken(token).includes(token), false);
assert.equal(isValidPrescriptionHandoffToken("guess"), false);

const now = new Date("2026-08-10T12:00:00.000Z");
const base = {
  expires_at: "2026-08-10T12:10:00.000Z",
  completed_at: null,
  upload_claim_expires_at: null,
};
assert.equal(getPrescriptionHandoffStatus(base, now), "pending");
assert.equal(getPrescriptionHandoffStatus({ ...base, upload_claim_expires_at: "2026-08-10T12:01:00.000Z" }, now), "uploading");
assert.equal(getPrescriptionHandoffStatus({ ...base, expires_at: "2026-08-10T11:59:59.000Z" }, now), "expired");
assert.equal(getPrescriptionHandoffStatus({ ...base, completed_at: "2026-08-10T11:59:00.000Z" }, now), "completed");

const record = { token_hash: hashPrescriptionHandoffToken(token) };
assert.equal(prescriptionHandoffTokenMatches(record, token), true);
assert.equal(prescriptionHandoffTokenMatches(record, createPrescriptionHandoffToken()), false);

const capabilityRecord = {
  id: "handoff-id",
  order_id: "order-a",
  token_hash: record.token_hash,
  expires_at: base.expires_at,
  completed_at: null,
  upload_claim_id: null,
  upload_claim_expires_at: null,
  created_at: "2026-08-10T12:00:00.000Z",
};
assert.equal(prescriptionHandoffBelongsToOrder(capabilityRecord, "order-a"), true);
assert.equal(prescriptionHandoffBelongsToOrder(capabilityRecord, "order-b"), false);
assert.equal(prescriptionHandoffCanAcceptUpload(capabilityRecord, token, now), true);
assert.equal(prescriptionHandoffCanAcceptUpload({ ...capabilityRecord, completed_at: now.toISOString() }, token, now), false);
assert.equal(prescriptionHandoffCanAcceptUpload({ ...capabilityRecord, expires_at: "2026-08-10T11:59:00.000Z" }, token, now), false);
assert.equal(prescriptionHandoffCanAcceptUpload(capabilityRecord, createPrescriptionHandoffToken(), now), false);

const response = buildPrescriptionHandoffResponse(
  { id: "handoff-id", expires_at: base.expires_at },
  "data:image/png;base64,qr",
);
assert.deepEqual(Object.keys(response).sort(), ["expiresAt", "handoffId", "qrDataUrl"]);
assert.equal(JSON.stringify(response).includes("order_id"), false);
assert.equal(JSON.stringify(response).includes(token), false);

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const createRoute = source("src/app/api/prescription-handoffs/route.ts");
const pollRoute = source("src/app/api/prescription-handoffs/[id]/route.ts");
const mobileRoute = source("src/app/api/prescription-handoffs/mobile/upload/route.ts");
const store = source("src/lib/server/prescriptionHandoffStore.ts");
const desktopPage = source("src/app/upload-prescription/page.tsx");
const mobilePage = source("src/app/upload-prescription/phone/PhoneUploadClient.tsx");
const migration = source("supabase/migrations/20260811023838_prescription_mobile_handoffs.sql");

assert.match(createRoute, /canAccessOrder\(access, order\)/);
assert.match(pollRoute, /canAccessOrder\(access, order\)/);
assert.match(mobileRoute, /POST as processPrescriptionUpload/);
assert.match(mobileRoute, /completePrescriptionHandoff/);
assert.match(store, /\.is\("completed_at", null\)/);
assert.match(store, /upload_claim_id/);
assert.match(desktopPage, /accept="image\/jpeg,image\/png"/);
assert.match(desktopPage, /setInterval\(timer|PrescriptionPhoneHandoffModal/);
assert.match(desktopPage, /manualEntryHref/);
assert.match(mobilePage, /image\/heic,image\/heif/);
assert.match(migration, /token_hash text not null unique[\s\S]*\^\[0-9a-f\]\{64\}\$/);
assert.match(migration, /completed_at is null[\s\S]*upload_claim_id is null[\s\S]*upload_claim_expires_at is null/);
assert.match(migration, /prescription_mobile_handoffs_active_order_idx/);
assert.match(migration, /prescription_mobile_handoffs_active_token_idx/);
assert.match(migration, /prescription_mobile_handoffs_expiry_idx/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/);

console.log("prescription handoff security matrix passed");
