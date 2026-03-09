import { lenses } from "@/LensCore/data/lenses";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{
    parameter: string;
    value: string;
  }>;
};

const VALID_PARAMETERS = [
  "base-curve",
  "diameter",
  "cylinder",
];

export default async function ParameterIndexPage({ params }: Props) {
  const { parameter, value } = await params;

  // Prevent route collision with lens slugs
  if (!VALID_PARAMETERS.includes(parameter)) {
    return notFound();
  }

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return notFound();
  }

  const results = lenses.filter((lens) => {
    const p = lens.parameters as {
      baseCurve?: number[];
      diameter?: number[];
      cylinder?: number[];
    };

    if (!p) return false;

    if (parameter === "base-curve") {
      return Array.isArray(p.baseCurve) && p.baseCurve.includes(numericValue);
    }

    if (parameter === "diameter") {
      return Array.isArray(p.diameter) && p.diameter.includes(numericValue);
    }

    if (parameter === "cylinder") {
      return Array.isArray(p.cylinder) && p.cylinder.includes(numericValue);
    }

    return false;
  });

  if (results.length === 0) {
    return notFound();
  }

  return (
    <div style={{ padding: 40, maxWidth: 900 }}>
      <h1>
        Contact Lenses With {parameter.replace("-", " ")} {value}
      </h1>

      <p>
        The following contact lenses are available with{" "}
        {parameter.replace("-", " ")} {value}.
      </p>

      <ul>
        {results.map((lens) => (
          <li key={lens.displayName}>{lens.displayName}</li>
        ))}
      </ul>
    </div>
  );
}