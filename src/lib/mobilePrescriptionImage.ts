const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_PIXELS = 25_000_000;
const HEADER_BYTES = 512;

export type MobileImageKind = "jpeg" | "png" | "heic";
type DecodeResult = { blob: Blob; width: number; height: number };
export type HeicDecoder = (file: File) => Promise<DecodeResult>;

const HEIC_BRANDS = new Set([
  "heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs",
]);

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function uint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

export function detectMobileImageKind(bytes: Uint8Array): MobileImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  ) {
    return "png";
  }
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== "ftyp") return null;

  const boxSize = uint32(bytes, 0);
  if (boxSize < 16 || boxSize > bytes.length) return null;
  const brands: string[] = [ascii(bytes, 8, 4)];
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    brands.push(ascii(bytes, offset, 4));
  }
  return brands.some((brand) => HEIC_BRANDS.has(brand)) ? "heic" : null;
}

function mimeMatches(kind: MobileImageKind, mime: string): boolean {
  if (!mime) return true;
  const normalized = mime.toLowerCase();
  if (kind === "jpeg") return normalized === "image/jpeg" || normalized === "image/jpg";
  if (kind === "png") return normalized === "image/png";
  return normalized === "image/heic" || normalized === "image/heif";
}

async function inspectOriginal(file: File): Promise<MobileImageKind> {
  if (file.size <= 0 || file.size > MAX_INPUT_BYTES) {
    throw new Error("Prescription photo must be between 1 byte and 10 MB.");
  }
  const header = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  const kind = detectMobileImageKind(header);
  if (!kind || !mimeMatches(kind, file.type)) {
    throw new Error("Choose a valid JPG, PNG, HEIC, or HEIF prescription photo.");
  }
  return kind;
}

async function loadImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; dispose: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: () => bitmap.close(),
      };
    } catch {
      // Safari's <img> decoder and createImageBitmap support have not always
      // landed together. Fall through to the object-URL decoder.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export const browserHeicDecoder: HeicDecoder = async (file) => {
  const decoded = await loadImage(file);
  try {
    if (decoded.width <= 0 || decoded.height <= 0) throw new Error("Invalid image dimensions");
    const scale = Math.min(1, Math.sqrt(MAX_OUTPUT_PIXELS / (decoded.width * decoded.height)));
    const width = Math.max(1, Math.floor(decoded.width * scale));
    const height = Math.max(1, Math.floor(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(decoded.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.88),
    );
    canvas.width = 1;
    canvas.height = 1;
    if (!blob) throw new Error("JPEG encoding failed");
    return { blob, width, height };
  } finally {
    decoded.dispose();
  }
};

export async function prepareMobilePrescriptionFile(
  file: File,
  decodeHeic: HeicDecoder = browserHeicDecoder,
): Promise<File> {
  const kind = await inspectOriginal(file);
  if (kind !== "heic") return file;

  try {
    const normalized = await decodeHeic(file);
    if (
      normalized.width <= 0 ||
      normalized.height <= 0 ||
      normalized.width * normalized.height > MAX_OUTPUT_PIXELS ||
      normalized.blob.size <= 0 ||
      normalized.blob.size > MAX_INPUT_BYTES
    ) {
      throw new Error("Converted image is outside supported limits");
    }
    const output = new File([normalized.blob], "prescription-mobile.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    const outputHeader = new Uint8Array(await output.slice(0, HEADER_BYTES).arrayBuffer());
    if (detectMobileImageKind(outputHeader) !== "jpeg") {
      throw new Error("Converted image is not JPEG");
    }
    return output;
  } catch {
    throw new Error(
      "We couldn't convert this iPhone photo. Please try taking the photo again or choose a JPG or PNG.",
    );
  }
}
