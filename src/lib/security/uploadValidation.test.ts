import assert from "node:assert/strict";
import { validatePrescriptionUpload } from "./uploadValidation";

async function main() {
  const jpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x64, 0x00, 0x64,
    0x01, 0x01, 0x11, 0x00, 0xff, 0xd9,
  ]);
  const valid = await validatePrescriptionUpload(
    new File([jpeg], "prescription.jpg", { type: "image/jpeg" }),
  );
  assert.equal(valid.extension, "jpg");
  assert.equal(valid.width, 100);
  assert.equal(valid.height, 100);

  await assert.rejects(
    validatePrescriptionUpload(
      new File([Buffer.from("not an image")], "prescription.jpg", {
        type: "image/jpeg",
      }),
    ),
    /does not match/i,
  );
  await assert.rejects(
    validatePrescriptionUpload(
      new File([jpeg], "prescription.svg", { type: "image/svg+xml" }),
    ),
    /JPEG or PNG/i,
  );
  await assert.rejects(
    validatePrescriptionUpload(
      new File(
        [new Uint8Array(10 * 1024 * 1024 + 1)],
        "prescription.jpg",
        { type: "image/jpeg" },
      ),
    ),
    /10 MB/i,
  );

  console.log("Prescription upload validation matrix passed");
}

void main();
