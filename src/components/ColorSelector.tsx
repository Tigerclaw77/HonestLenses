"use client";

type ColorSelectorProps = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  disabled?: boolean;
};

export default function ColorSelector({
  value,
  onChange,
  options,
  disabled = false,
}: ColorSelectorProps) {
  // If a lens has exactly one color, show it but don’t allow change
  if (options.length === 1) {
    return (
      <input
        value={options[0]}
        disabled
        aria-label="Lens color"
      />
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="color-select"
      aria-label="Lens color"
    >
      <option value="">Select color</option>
      {options.map((color) => (
        <option key={color} value={color}>
          {color}
        </option>
      ))}
    </select>
  );
}
