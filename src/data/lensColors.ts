export const LENS_COLOR_OPTIONS: Record<string, string[]> = {
  "Air Optix Colors": [
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
  "Define": [
    "Natural Shine",
    "Accent Style",
    "Vivid Style",
  ],
  "Dailies Colors": [
    "Mystic Blue",
    "Mystic Hazel",
    "Mystic Gray",
    "Mystic Green",
  ],
  "Freshlook Colorblends": [
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
};

export function getColorOptions(lensName?: string): string[] {
  if (!lensName) return [];
  return LENS_COLOR_OPTIONS[lensName] ?? [];
}
