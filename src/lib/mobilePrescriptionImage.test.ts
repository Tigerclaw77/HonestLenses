import assert from "node:assert/strict";
import { prepareMobilePrescriptionFile } from "./mobilePrescriptionImage";
import { validatePrescriptionUpload } from "./security/uploadValidation";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x64, 0x00, 0x64, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9]);
const png = Buffer.alloc(24);
Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
png.writeUInt32BE(100, 16);
png.writeUInt32BE(100, 20);
const heic = Buffer.alloc(24);
heic.writeUInt32BE(24, 0);
heic.write("ftyp", 4, "ascii");
heic.write("heic", 8, "ascii");
heic.write("mif1", 16, "ascii");
heic.write("heic", 20, "ascii");

async function main() {
const mobileJpeg = await prepareMobilePrescriptionFile(new File([jpeg], "mobile.jpg", { type: "image/jpeg" }));
const mobilePng = await prepareMobilePrescriptionFile(new File([png], "mobile.png", { type: "image/png" }));
assert.equal(mobileJpeg.type, "image/jpeg");
assert.equal(mobilePng.type, "image/png");
await validatePrescriptionUpload(mobileJpeg);
await validatePrescriptionUpload(mobilePng);

const normalized = await prepareMobilePrescriptionFile(
  new File([heic], "IMG_1001.HEIC", { type: "image/heic" }),
  async () => ({ blob: new Blob([jpeg], { type: "image/jpeg" }), width: 100, height: 100 }),
);
assert.equal(normalized.type, "image/jpeg");
assert.equal(normalized.name, "prescription-mobile.jpg");
assert.equal((await validatePrescriptionUpload(normalized)).extension, "jpg");

await assert.rejects(prepareMobilePrescriptionFile(new File([Buffer.from("fake")], "fake.heic", { type: "image/heic" })), /valid JPG, PNG, HEIC, or HEIF/i);
await assert.rejects(prepareMobilePrescriptionFile(new File([heic], "spoof.jpg", { type: "image/jpeg" })), /valid JPG, PNG, HEIC, or HEIF/i);
await assert.rejects(prepareMobilePrescriptionFile(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.heic", { type: "image/heic" })), /10 MB/i);
await assert.rejects(
  prepareMobilePrescriptionFile(new File([heic], "broken.heic", { type: "image/heic" }), async () => { throw new Error("decoder failed"); }),
  /couldn't convert this iPhone photo/i,
);
await assert.rejects(validatePrescriptionUpload(new File([heic], "desktop.heic", { type: "image/heic" })), /JPEG or PNG/i);

console.log("mobile prescription image matrix passed");
}

void main();
