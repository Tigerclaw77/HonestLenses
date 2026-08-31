export type JsonLdPrimitive = string | number | boolean | null;
export type JsonLdValue =
  | JsonLdPrimitive
  | JsonLdValue[]
  | { [key: string]: JsonLdValue | undefined };

/**
 * Serialize JSON-LD without allowing HTML-significant characters to terminate
 * the script element. This is shared by every public schema surface.
 */
export function serializeJsonLd(value: JsonLdValue): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
