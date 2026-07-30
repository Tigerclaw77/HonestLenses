import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLensImage } from "./getLensImage";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

for (const coreId of ["ULTRA", "ULTRA_AST"]) {
  const imagePath = getLensImage(coreId);
  assert.equal(
    imagePath,
    `/lens-images/${coreId}.png`,
    `${coreId} uses its existing PNG asset`,
  );
  assert.equal(
    existsSync(path.join(repositoryRoot, "public", imagePath)),
    true,
    `${coreId} image reference resolves to a real public asset`,
  );
}

assert.equal(
  getLensImage("OASYS_1D"),
  "/lens-images/OASYS_1D.webp",
  "existing WebP image behavior is unchanged",
);

console.log("Commercial lens image references passed.");
