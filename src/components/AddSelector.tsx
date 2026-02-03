"use client";

type AddSelectorProps = {
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

export default function AddSelector({
  value,
  options,
  onChange,
}: AddSelectorProps) {
  if (!options || options.length === 0) return null;

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Add</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
