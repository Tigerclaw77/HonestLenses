const MAX_PRESCRIPTION_BYTES = 10 * 1024 * 1024;
const MAX_CATALOG_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 25_000_000;

type AllowedImage = {
  extension: "jpg" | "png";
  mimeType: "image/jpeg" | "image/png";
};

export type ValidatedPrescriptionUpload = AllowedImage & {
  buffer: Buffer;
  height: number;
  width: number;
};

export type ValidatedCatalogImageUpload = AllowedImage & {
  buffer: Buffer;
  height: number;
  width: number;
};

const ALLOWED_IMAGES: Record<string, AllowedImage> = {
  "image/jpeg": { extension: "jpg", mimeType: "image/jpeg" },
  "image/png": { extension: "png", mimeType: "image/png" },
};

function pngDimensions(buffer: Buffer): { width: number; height: number } | null {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) {
    return null;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function jpegDimensions(
  buffer: Buffer,
): { width: number; height: number } | null {
  if (
    buffer.length < 4 ||
    buffer[0] !== 0xff ||
    buffer[1] !== 0xd8
  ) {
    return null;
  }

  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > buffer.length) return null;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      return null;
    }

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame && segmentLength >= 7) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += segmentLength;
  }
  return null;
}

function dimensionsFor(
  buffer: Buffer,
  mimeType: AllowedImage["mimeType"],
): { width: number; height: number } | null {
  return mimeType === "image/png"
    ? pngDimensions(buffer)
    : jpegDimensions(buffer);
}

export async function validatePrescriptionUpload(
  file: File,
): Promise<ValidatedPrescriptionUpload> {
  if (file.size <= 0 || file.size > MAX_PRESCRIPTION_BYTES) {
    throw new Error("Prescription image must be between 1 byte and 10 MB.");
  }

  const allowed = ALLOWED_IMAGES[file.type];
  if (!allowed) {
    throw new Error("Prescription image must be a JPEG or PNG.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const dimensions = dimensionsFor(buffer, allowed.mimeType);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new Error("Prescription image content does not match its file type.");
  }

  if (dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) {
    throw new Error("Prescription image dimensions are too large.");
  }

  return { ...allowed, ...dimensions, buffer };
}

/** Product artwork has a separate, lower size ceiling from prescription data. */
export async function validateCatalogImageUpload(
  file: File,
): Promise<ValidatedCatalogImageUpload> {
  if (file.size <= 0 || file.size > MAX_CATALOG_IMAGE_BYTES) {
    throw new Error("Catalog image must be between 1 byte and 5 MB.");
  }
  const allowed = ALLOWED_IMAGES[file.type];
  if (!allowed) throw new Error("Catalog image must be a JPEG or PNG.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const dimensions = dimensionsFor(buffer, allowed.mimeType);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new Error("Catalog image content does not match its file type.");
  }
  if (dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) {
    throw new Error("Catalog image dimensions are too large.");
  }
  return { ...allowed, ...dimensions, buffer };
}
