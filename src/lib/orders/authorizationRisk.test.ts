import { strict as assert } from "node:assert";
import {
  authorizationRiskPriority,
  getAuthorizationRisk,
} from "./authorizationRisk";

const now = new Date("2026-08-11T22:00:00.000Z");

assert.deepEqual(
  getAuthorizationRisk(
    {
      stripePaymentIntentStatus: "requires_capture",
      authorizedAt: "2026-08-11T21:00:00.000Z",
      captureBefore: "2026-08-13T22:00:00.000Z",
    },
    now,
  ),
  {
    level: "healthy",
    authorizedAt: "2026-08-11T21:00:00.000Z",
    captureBefore: "2026-08-13T22:00:00.000Z",
    ageMs: 60 * 60 * 1000,
    remainingMs: 48 * 60 * 60 * 1000,
  },
);

assert.equal(
  getAuthorizationRisk(
    {
      stripePaymentIntentStatus: "requires_capture",
      captureBefore: "2026-08-12T21:00:00.000Z",
    },
    now,
  ).level,
  "warning",
);
assert.equal(
  getAuthorizationRisk(
    {
      stripePaymentIntentStatus: "requires_capture",
      captureBefore: "2026-08-12T03:00:00.000Z",
    },
    now,
  ).level,
  "urgent",
);
assert.equal(
  getAuthorizationRisk(
    {
      stripePaymentIntentStatus: "requires_capture",
      captureBefore: "2026-08-11T21:59:59.000Z",
    },
    now,
  ).level,
  "expired",
);
assert.equal(
  getAuthorizationRisk(
    { stripePaymentIntentStatus: "requires_capture" },
    now,
  ).level,
  "unknown_deadline",
);
assert.equal(
  getAuthorizationRisk(
    {
      stripePaymentIntentStatus: "succeeded",
      captureBefore: "2026-08-11T21:59:59.000Z",
    },
    now,
  ).level,
  "not_authorized",
);
assert.ok(
  authorizationRiskPriority("urgent") < authorizationRiskPriority("healthy"),
);

console.log("Authorization risk regression tests passed.");
