import assert from "node:assert/strict";
import { assertRequiredSchema, REQUIRED_SCHEMA } from "./required-schema.mjs";
for (const missing of Object.keys(REQUIRED_SCHEMA)) {
  const client = { from: table => ({ select: () => ({ limit: async () => ({ error: table === missing ? { code: "42703", message: "required relation/column missing" } : null }) }) }) };
  await assert.rejects(assertRequiredSchema(client), error => error.message.includes(missing) && error.message.includes("REQUIRED PRODUCTION SCHEMA"));
}
await assertRequiredSchema({ from: () => ({ select: () => ({ limit: async () => ({ error: null }) }) }) });
console.log("Production schema failure tests passed (every required relation).");
