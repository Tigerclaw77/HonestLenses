export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

export function plainTextToHtml(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

export function sanitizeEmailHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}
