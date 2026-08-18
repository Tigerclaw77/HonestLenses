/**
 * Stable LensCore IDs are intentionally used here. Display names are editorial
 * data and must never decide whether a prescription colour is manufacturable.
 */
export const LENS_COLOR_OPTIONS_BY_CORE_ID: Record<string, string[]> = {
  AO_COL: [
    "Gemstone Green",
    "Green",
    "Pure Hazel",
    "Honey",
    "Brown",
    "Brilliant Blue",
    "Blue",
    "True Sapphire",
    "Turquoise",
    "Gray",
    "Sterling Gray",
    "Amethyst",
  ],
  DEFINE: [
    "Natural Shine",
    "Accent Style",
    "Vivid Style",
  ],
  DAILIES_COL: [
    "Mystic Blue",
    "Mystic Hazel",
    "Mystic Gray",
    "Mystic Green",
  ],
};

export function getColorOptions(coreId?: string | null): string[] {
  if (!coreId) return [];
  return LENS_COLOR_OPTIONS_BY_CORE_ID[coreId] ?? [];
}
