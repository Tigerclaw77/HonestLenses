import { strict as assert } from "node:assert";
import { getArmoryOrderRouting } from "./armoryRouting";

const fulfilledBase = {
  status: "captured",
  payment_intent_id: "pi_armory_routing",
  stripe_payment_intent_status: "succeeded",
  verification_status: "verified",
  rx: {
    right: { coreId: "OASYS_1D", sphere: "-1.00" },
    left: { coreId: "OASYS_1D", sphere: "-1.25" },
  },
};

for (const fulfillmentStatus of [
  "ordered",
  "backordered",
  "shipped",
  "delivered",
]) {
  const routing = getArmoryOrderRouting({
    ...fulfilledBase,
    fulfillment_status: fulfillmentStatus,
  });

  assert.equal(
    routing.lifecycleOwner,
    "armory",
    `${fulfillmentStatus} lifecycle belongs to Armory`,
  );
  assert.equal(
    routing.activeDashboardLane,
    null,
    `${fulfillmentStatus} does not clutter the active dashboard`,
  );
  assert.equal(
    routing.founderActionRequired,
    false,
    `${fulfillmentStatus} does not imply founder action`,
  );
  assert.deepEqual(routing.founderActionReasons, []);
}

const founderException = getArmoryOrderRouting({
  ...fulfilledBase,
  fulfillment_status: "ordered",
  admin_notes:
    "Armory exception: Supplier requires founder approval for a product substitution.",
});
assert.equal(founderException.lifecycleOwner, "armory");
assert.equal(founderException.activeDashboardLane, "resolve_exception");
assert.equal(founderException.founderActionRequired, true);
assert.deepEqual(founderException.founderActionReasons, [
  "Supplier requires founder approval for a product substitution.",
]);

const inconsistentSupplierOrder = getArmoryOrderRouting({
  ...fulfilledBase,
  status: "authorized",
  stripe_payment_intent_status: "requires_capture",
  fulfillment_status: "ordered",
});
assert.equal(inconsistentSupplierOrder.lifecycleOwner, "armory");
assert.equal(
  inconsistentSupplierOrder.activeDashboardLane,
  "resolve_exception",
);
assert.equal(inconsistentSupplierOrder.founderActionRequired, true);
assert.ok(
  inconsistentSupplierOrder.founderActionReasons.some((reason) =>
    reason.includes("requires captured payment"),
  ),
);

const readyToOrder = getArmoryOrderRouting({
  ...fulfilledBase,
  fulfillment_status: "review",
});
assert.equal(readyToOrder.lifecycleOwner, "honest_lenses");
assert.equal(readyToOrder.activeDashboardLane, "ready_to_order");
assert.equal(readyToOrder.founderActionRequired, false);

console.log("Armory responsibility and exception-routing matrix passed.");
