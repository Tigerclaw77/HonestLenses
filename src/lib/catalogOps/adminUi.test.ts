import assert from "node:assert/strict";
import {
  LEGACY_LENSCORE_CLONE_REASON,
  LEGACY_LENSCORE_EDIT_REASON,
  MANAGED_CATALOG_CREATE_HREF,
} from "./adminUi";

assert.equal(
  MANAGED_CATALOG_CREATE_HREF,
  "/admin/catalog?managed=add#managed-catalog",
  "Add Lens must navigate directly to the persistent managed-family creation workflow.",
);
assert.match(LEGACY_LENSCORE_EDIT_REASON, /protected source records/i);
assert.match(LEGACY_LENSCORE_CLONE_REASON, /ambiguous duplicate/i);

console.log("Catalog admin protected-source action contract passed");
