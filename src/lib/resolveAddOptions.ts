import { Lens } from "../data/lenses";

export function resolveAddOptions(lens?: Lens): string[] {
  if (!lens) return [];

  if (lens.addOptions && lens.addOptions.length > 0) {
    return lens.addOptions;
  }

  return [];
}
