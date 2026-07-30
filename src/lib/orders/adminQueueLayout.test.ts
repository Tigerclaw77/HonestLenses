import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(process.cwd(), "src", "app", "admin", "orders", "page.tsx"),
  "utf8",
);

const cardStart = source.indexOf("function ActiveOrderCard");
const detailsStart = source.indexOf("function OrderDetailsModal");
const componentStart = source.indexOf("export default function AdminOrdersPage");

assert.ok(cardStart >= 0 && detailsStart > cardStart);
assert.ok(componentStart > detailsStart);

const activeCard = source.slice(cardStart, detailsStart);
const detailsSurface = source.slice(detailsStart, componentStart);
const historyStart = source.indexOf("{archiveOrders.map");
const abandonedStart = source.indexOf("{abandonedOrders.map", historyStart);
const historyRows = source.slice(historyStart, abandonedStart);

for (const legacyExpandedHeading of [
  "Order Summary",
  "Customer / Shipping",
  "Payment",
  "Internal / Audit",
  "Order Quantity Adjustment",
  "Payment Adjustment",
  "Rx Image",
  "Full Rx",
]) {
  const escapedHeading = legacyExpandedHeading.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  assert.equal(
    new RegExp(`>\\s*${escapedHeading}\\s*<`, "i").test(activeCard),
    false,
    `${legacyExpandedHeading} is absent while Order Details is closed`,
  );
}

for (const visibleQueueSignal of [
  "customerName",
  "lensDisplay",
  "formatMoney(order.total_amount_cents)",
  "Queue Status",
  "Next Action",
  "Age",
  "Process",
  "Order Details",
]) {
  assert.ok(
    activeCard.includes(visibleQueueSignal),
    `active card keeps ${visibleQueueSignal}`,
  );
}

for (const recordOnlyField of [
  "shipping_phone",
  "shipping_email",
  "shipping_address1",
  "payment_intent_id",
  "stripe_payment_intent_status",
  "RxDetailsPanel",
  "Created:",
  "Updated:",
]) {
  assert.equal(
    activeCard.includes(recordOnlyField),
    false,
    `${recordOnlyField} stays out of the processing card`,
  );
  assert.equal(
    detailsSurface.includes(recordOnlyField),
    true,
    `${recordOnlyField} remains available behind Details`,
  );
}

for (const detailsOnlyControl of [
  "Order Summary",
  "Customer / Shipping",
  "Payment Record",
  "Workflow / Audit",
  "Adjust Quantity",
  "Adjust Capture",
  "Notes",
  "Copy Order",
  "Archive",
  "Admin override",
]) {
  assert.equal(
    activeCard.includes(detailsOnlyControl),
    false,
    `${detailsOnlyControl} stays out of the processing card`,
  );
  assert.equal(
    detailsSurface.includes(detailsOnlyControl),
    true,
    `${detailsOnlyControl} remains available behind Order Details`,
  );
}

for (const removedQueueRecordSignal of [
  "Payment",
  "Authorized:",
  "Captured:",
  "Created:",
  "Updated:",
  "CopyableValue",
  "getOrderStatusFlags",
]) {
  assert.equal(
    activeCard.includes(removedQueueRecordSignal),
    false,
    `${removedQueueRecordSignal} is removed from the work queue`,
  );
}

assert.ok(activeCard.includes("PrescriberVerificationTracker"));
assert.ok(
  source.includes('"minmax(125px, 0.65fr) repeat(3, minmax(0, 1fr))"'),
  "verification attempts render as one compact tracker row",
);
assert.ok(
  activeCard.includes('sectionKey === "ready_to_order"'),
  "ready-to-order cards expose the vendor-order primary action",
);
assert.ok(activeCard.includes("Verify Prescription"));
assert.ok(activeCard.includes("Place Vendor Order"));
assert.ok(activeCard.includes("Resolve Exception"));
assert.equal(
  (activeCard.match(/data-active-order-card/g) ?? []).length,
  1,
  "active queue cards expose a stable measurement hook",
);
assert.ok(source.includes("System Health ({queueIntegrityIssues.length})"));
assert.ok(source.includes('href="/admin/system-health"'));
assert.equal(source.includes("Diagnostic details"), false);
assert.ok(historyStart >= 0 && abandonedStart > historyStart);
assert.ok(historyRows.includes("setDetailsOrderId(o.id)"));
for (const inlineRecordSignal of [
  "expanded === o.id",
  "RxDetailsPanel",
  "Copy Order",
  "Payment:",
  "shipping_address1",
]) {
  assert.equal(
    historyRows.includes(inlineRecordSignal),
    false,
    `history rows do not reintroduce inline order records via ${inlineRecordSignal}`,
  );
}

console.log("Admin work-queue layout regression tests passed.");
