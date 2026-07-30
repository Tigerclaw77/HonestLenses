import { strict as assert } from "node:assert";
import {
  ADMIN_TIME_ZONE,
  formatAdminDate,
  formatAdminDateTime,
  formatAdminDateTimeParts,
} from "./time";

assert.equal(ADMIN_TIME_ZONE, "America/Chicago");

assert.equal(
  formatAdminDateTime("2026-01-15T18:30:00.000Z"),
  "Jan 15, 2026, 12:30 PM CT",
  "winter timestamps render in Central Standard Time",
);
assert.equal(
  formatAdminDateTime("2026-07-15T18:30:00.000Z"),
  "Jul 15, 2026, 1:30 PM CT",
  "summer timestamps render in Central Daylight Time",
);
assert.deepEqual(
  formatAdminDateTimeParts("2026-07-15T18:30:00.000Z"),
  { date: "Jul 15", time: "1:30 PM CT" },
);
assert.equal(
  formatAdminDate("2026-07-31T01:00:00.000Z"),
  "Jul 30, 2026",
  "admin date-only output uses the Central calendar date",
);
assert.equal(formatAdminDateTime("not-a-date"), "-");
assert.deepEqual(formatAdminDateTimeParts(null), { date: "-", time: "-" });

console.log("Admin Central Time presentation tests passed.");
