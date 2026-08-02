import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isOrderRowControlTarget,
  ORDER_ROW_CONTROL_SELECTOR,
} from "@/lib/admin/orderRowInteraction";

const source = readFileSync(
  join(process.cwd(), "src", "app", "admin", "orders", "page.tsx"),
  "utf8",
);
const styles = readFileSync(
  join(process.cwd(), "src", "styles", "globals.css"),
  "utf8",
);
const adminOrdersRoute = readFileSync(
  join(process.cwd(), "src", "app", "api", "admin", "orders", "route.ts"),
  "utf8",
);
const systemHealthClient = readFileSync(
  join(
    process.cwd(),
    "src",
    "app",
    "admin",
    "system-health",
    "SystemHealthClient.tsx",
  ),
  "utf8",
);
const systemHealthPage = readFileSync(
  join(process.cwd(), "src", "app", "admin", "system-health", "page.tsx"),
  "utf8",
);

const cardStart = source.indexOf("function ActiveOrderCard");
const detailsStart = source.indexOf("function OrderDetailsModal");
const componentStart = source.indexOf("export default function AdminOrdersPage");

assert.ok(cardStart >= 0 && detailsStart > cardStart);
assert.ok(componentStart > detailsStart);

const activeCard = source.slice(cardStart, detailsStart);
const detailsSurface = source.slice(detailsStart, componentStart);
const copyableValueStart = source.indexOf("function CopyableValue");
const verificationAttemptStart = source.indexOf(
  "function VerificationAttemptRow",
  copyableValueStart,
);
const copyableValue = source.slice(copyableValueStart, verificationAttemptStart);
const expandedCardStart = activeCard.indexOf("{isOpen &&");
assert.ok(expandedCardStart >= 0);
assert.ok(
  activeCard.indexOf("<CustomerInformationBlock order={order} />") >
    expandedCardStart,
  "customer processing fields render inside the existing expanded card",
);

const rowToggleTestId = activeCard.indexOf(
  'data-testid="admin-queue-row-toggle"',
);
const rowToggleStart = activeCard.lastIndexOf("<button", rowToggleTestId);
const rowToggleEnd = activeCard.indexOf("</button>", rowToggleStart);
assert.ok(
  rowToggleTestId >= 0 && rowToggleStart >= 0 && rowToggleEnd > rowToggleStart,
);
const rowToggle = activeCard.slice(rowToggleStart, rowToggleEnd);
for (const rowToggleContract of [
  'type="button"',
  "onClick={onToggleProcess}",
  "aria-expanded={isOpen}",
  "aria-controls={processingPanelId}",
  'className="admin-order-row-trigger"',
]) {
  assert.ok(
    rowToggle.includes(rowToggleContract),
    `row toggle keeps ${rowToggleContract}`,
  );
}
assert.ok(
  activeCard.includes("if (isOpen || isOrderRowControlTarget(event.target)) return;"),
  "collapsed card background expands while explicit controls remain isolated",
);
assert.ok(
  activeCard.includes("id={processingPanelId}"),
  "row toggle controls the inline processing panel",
);

const rowBoundary = {};
const backgroundTarget = {
  closest: () => null,
} as unknown as EventTarget;
const nestedControlTarget = {
  closest: (selector: string) =>
    selector === ORDER_ROW_CONTROL_SELECTOR ? rowBoundary : null,
} as unknown as EventTarget;
assert.equal(isOrderRowControlTarget(backgroundTarget), false);
assert.equal(isOrderRowControlTarget(nestedControlTarget), true);
assert.equal(isOrderRowControlTarget(null), false);
assert.ok(
  activeCard.indexOf('<RxDetailsPanel order={order} heading="Prescription" />') >
    expandedCardStart,
  "prescription processing renders inside the existing expanded card",
);
assert.equal(
  activeCard.includes("runPrimaryAction"),
  false,
  "routine workflow actions do not route through Order Details",
);
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
  "Activity",
  "Details",
]) {
  assert.ok(
    activeCard.includes(visibleQueueSignal),
    `active card keeps ${visibleQueueSignal}`,
  );
}

for (const removedQueueSignal of [
  "Queue Status",
  "Next Action",
  ">Age<",
  ">Process<",
  "sectionTitle",
]) {
  assert.equal(
    activeCard.includes(removedQueueSignal),
    false,
    `${removedQueueSignal} is not repeated on active order rows`,
  );
}
assert.ok(
  activeCard.includes('data-testid="attention-reason"') &&
    activeCard.includes("Issue: {classification.reasons[0]}"),
  "Needs Attention rows keep their explicit operator-facing reason",
);

for (const routineProcessingField of [
  "shipping_first_name",
  "shipping_last_name",
  "shipping_phone",
  "shipping_email",
  "shipping_address1",
  "shipping_address2",
  "shipping_city",
  "shipping_state",
  "shipping_zip",
  "RxDetailsPanel",
  'heading="Prescription"',
  "CopyableValue",
]) {
  assert.equal(
    activeCard.includes(routineProcessingField),
    true,
    `${routineProcessingField} is available in the expanded processing card`,
  );
}

for (const copyLabel of [
  "First name",
  "Last name",
  "Phone",
  "Email",
  "Street address",
  "Apt / Suite",
  "City",
  "State",
  "ZIP",
]) {
  assert.ok(
    activeCard.includes(`label="${copyLabel}"`),
    `${copyLabel} has its own one-click copy control`,
  );
}
assert.ok(
  detailsSurface.includes("<CustomerInformationBlock"),
  "Order Details reuses the same individual customer-field copy controls",
);
assert.equal(
  detailsSurface.includes("<CopyableValue value={order.payment_intent_id}"),
  false,
  "PaymentIntent remains visible without a copy affordance",
);
assert.ok(
  detailsSurface.includes('PaymentIntent: {order.payment_intent_id ?? "-"}'),
  "PaymentIntent remains available for troubleshooting",
);

const customerInformationStart = activeCard.indexOf(
  "function CustomerInformationBlock",
);
assert.ok(customerInformationStart >= 0);
const customerInformation = activeCard.slice(customerInformationStart);
assert.equal(
  customerInformation.includes('display: "grid"'),
  false,
  "customer information reads as an address block rather than a field grid",
);
for (const line of [
  'data-customer-line="name"',
  'data-customer-line="address"',
  'data-customer-line="contact"',
]) {
  assert.ok(
    customerInformation.includes(line),
    `${line} preserves shipping-label reading order`,
  );
}
const customerFieldOrder = [
  'label="First name"',
  'label="Last name"',
  'label="Street address"',
  'label="Apt / Suite"',
  'label="City"',
  'label="State"',
  'label="ZIP"',
  'label="Phone"',
  'label="Email"',
];
let previousCustomerField = -1;
for (const field of customerFieldOrder) {
  const fieldIndex = customerInformation.indexOf(field);
  assert.ok(
    fieldIndex > previousCustomerField,
    `${field} follows natural reading order`,
  );
  previousCustomerField = fieldIndex;
}
assert.equal(
  copyableValue.includes(': "Copy"'),
  false,
  "copy labels are not permanently rendered beside customer information",
);
assert.ok(copyableValue.includes('className="admin-copyable-value__icon"'));
assert.ok(
  copyableValue.includes('className="admin-copyable-value__feedback">Copied'),
);
assert.ok(
  copyableValue.includes(
    '<span className="admin-copyable-value__text">{children ?? text}</span>',
  ),
  "the displayed value is the complete copy target",
);
assert.ok(
  copyableValue.includes("e.stopPropagation()"),
  "copy targets do not toggle their containing order row",
);
assert.ok(
  styles.includes("cursor: pointer"),
  "copyable values use a pointer cursor",
);
assert.ok(
  styles.includes(
    ".admin-copyable-value:hover .admin-copyable-value__text",
  ),
  "hover subtly underlines the value itself",
);
assert.ok(
  styles.includes("pointer-events: none"),
  "the copy icon cannot become a separate click target",
);

for (const recordOnlyField of [
  "payment_intent_id",
  "stripe_payment_intent_status",
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
  "Processing History",
  "Adjust Quantity",
  "Adjust Capture",
  "Notes",
  "Copy Order",
  "Archive",
]) {
  assert.equal(
    activeCard.includes(detailsOnlyControl),
    false,
    `${detailsOnlyControl} stays out of the processing card`,
  );
  assert.equal(
    detailsSurface.includes(detailsOnlyControl),
    true,
    `${detailsOnlyControl} remains available behind Details`,
  );
}

for (const removedQueueRecordSignal of [
  "Payment",
  "Authorized:",
  "Captured:",
  "Created:",
  "Updated:",
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
  activeCard.includes("workflowActionLabel(fulfillment, nextFulfillment)"),
  "the next routine workflow action is a visible button",
);
assert.ok(
  activeCard.includes("Undo to {labelizeStatus(previousFulfillment)}"),
  "the previous routine workflow action is a visible button",
);
assert.ok(source.includes("Approve / Ready to Order"));
assert.ok(source.includes("Place Vendor Order"));
assert.ok(source.includes("Mark Shipped"));
assert.ok(source.includes("Complete Order"));
assert.ok(activeCard.includes("Return to Review"));

const administrativeSelectStart = activeCard.indexOf(
  'aria-label="Administrative action"',
);
const administrativeSelectEnd = activeCard.indexOf(
  "</select>",
  administrativeSelectStart,
);
assert.ok(administrativeSelectStart >= 0);
assert.ok(administrativeSelectEnd > administrativeSelectStart);
const administrativeSelect = activeCard.slice(
  administrativeSelectStart,
  administrativeSelectEnd,
);
assert.ok(administrativeSelect.includes('value="hold"'));
assert.ok(administrativeSelect.includes('value="cancelled"'));
for (const routineStatus of [
  'value="review"',
  'value="ready_to_order"',
  'value="ordered"',
  'value="shipped"',
  'value="completed"',
]) {
  assert.equal(
    administrativeSelect.includes(routineStatus),
    false,
    `${routineStatus} is a visible workflow action, not a dropdown option`,
  );
}
assert.equal(
  />\s*Admin override\s*</.test(source),
  false,
  "the all-status Admin override control is removed",
);
assert.equal(
  (activeCard.match(/data-active-order-card/g) ?? []).length,
  1,
  "active queue cards expose a stable measurement hook",
);
assert.ok(source.includes("Operational Issues ({queueIntegrityIssues.length})"));
assert.ok(source.includes('href="/admin/system-health"'));
assert.equal(source.includes("Diagnostic details"), false);
assert.ok(
  adminOrdersRoute.includes("isMeaningfulOperationalActivityEvent(event)"),
  "the orders API skips projection and reconciliation events for Activity",
);
assert.ok(systemHealthClient.includes("No operational issues detected."));
assert.ok(systemHealthClient.includes("count > 0"));
assert.equal(systemHealthClient.includes("Commerce v2"), false);
assert.equal(systemHealthPage.includes("Commerce System Health"), false);
assert.equal(systemHealthPage.includes("payment ledger"), false);
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
