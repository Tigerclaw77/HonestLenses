export type ParameterResolution<T> = {
  rawValue: T | null;
  value: T | null;
  options: readonly T[];
  source: "explicit" | "single-option" | "missing";
  ambiguous: boolean;
  required: boolean;
  invalid: boolean;
};

export function resolveParameterOption<T>(
  rawValue: T | null | undefined,
  options: readonly T[] | undefined,
  isEqual: (a: T, b: T) => boolean = Object.is,
): ParameterResolution<T> {
  const raw = rawValue ?? null;
  const allowed = options ?? [];
  const explicitMatch =
    raw == null ? null : (allowed.find((option) => isEqual(option, raw)) ?? null);
  const hasOptions = allowed.length > 0;
  const invalid = raw != null && hasOptions && explicitMatch == null;
  const deterministicValue = allowed.length === 1 ? allowed[0] : null;

  return {
    rawValue: raw,
    value: raw ?? deterministicValue,
    options: allowed,
    source:
      raw != null
        ? "explicit"
        : deterministicValue != null
          ? "single-option"
          : "missing",
    ambiguous: allowed.length > 1,
    required: allowed.length > 1 && raw == null,
    invalid,
  };
}
