export function slugifyLens(name: string) {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\+/g, "plus")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}