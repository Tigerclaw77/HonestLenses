import { strict as assert } from "node:assert";
import {
  ADMIN_TIME_ZONE,
  formatAdminActivity,
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
assert.deepEqual(
  formatAdminActivity(
    "2026-08-01T15:00:00.000Z",
    new Date("2026-08-01T18:00:00.000Z"),
  ),
  { date: "Aug 1", detail: "3 hours ago" },
  "activity under 24 hours shows a relative time",
);
assert.deepEqual(
  formatAdminActivity(
    "2026-07-29T19:14:00.000Z",
    new Date("2026-07-31T20:00:00.000Z"),
  ),
  { date: "Jul 29", detail: "2:14 PM CT" },
  "activity at least 24 hours old shows Central time",
);

console.log("Admin Central Time presentation tests passed.");
