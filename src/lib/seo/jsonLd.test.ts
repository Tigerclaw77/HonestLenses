import assert from "node:assert/strict";

import { serializeJsonLd } from "./jsonLd";

const escaped = serializeJsonLd({ value: "</script><tag>&\u2028" });
assert.equal(escaped.includes("</script>"), false, "JSON-LD cannot terminate its script");
assert.ok(escaped.includes("\\u003c"));
assert.deepEqual(JSON.parse(escaped), { value: "</script><tag>&\u2028" });

console.log("JSON-LD serialization tests passed");
