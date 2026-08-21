import { lenses } from "@/LensCore/data/lenses";
import {
  findLensBySlug,
  getLensAddValues,
  getLensAxisValues,
  getLensCylinderValues,
  SITE_URL,
} from "@/lib/seo/contactSeoRoutes";
import { notFound } from "next/navigation";

import {
  formatSphere,
  formatCylinder,
  formatDiameter,
  formatBaseCurve,
  formatAxis,
} from "@/lib/formatters/rxFormat";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;

  const lens = findLensBySlug(lenses, slug);

  if (!lens) return {};

  return {
    title: `${lens.displayName} Parameters`,
    description: `View sphere, cylinder, axis, base curve, and diameter parameters for ${lens.displayName} contact lenses.`,
    alternates: {
      canonical: `${SITE_URL}/contacts/${slug}/parameters`,
    },
  };
}

export default async function ParametersPage({ params }: Props) {
  const { slug } = await params;

  const lens = findLensBySlug(lenses, slug);

  if (!lens) return notFound();

  const p = lens.parameters;
  const cylinderValues = getLensCylinderValues(lens);
  const axisValues = getLensAxisValues(lens);
  const addValues = getLensAddValues(lens);

  return (
    <div style={{ padding: 40, maxWidth: 900 }}>
      <h1>{lens.displayName} Parameters</h1>

      <p>
        This page lists prescription parameter availability for{" "}
        {lens.displayName} contact lenses.
      </p>

      {/* Sphere */}

      <h2>{lens.displayName} Sphere Range</h2>

      <p>
      {p.sphere?.segments
          ? p.sphere.segments
              .map(
                (s) =>
                  `${formatSphere(s.min)} to ${formatSphere(s.max)}`
              )
              .join(", ")
          : "Varies by prescription."}
      </p>

      {/* Base Curve */}

      <h2>Base Curve</h2>

      <p>
        {Array.isArray(p.baseCurve)
          ? p.baseCurve.map(formatBaseCurve).join(", ")
          : "Varies"}
      </p>

      {/* Diameter */}

      <h2>{lens.displayName} Diameter</h2>

      <p>
        {Array.isArray(p.diameter)
          ? p.diameter.map(formatDiameter).join(", ")
          : "Varies"}
      </p>

      {/* Cylinder */}

      {cylinderValues.length > 0 && (
        <>
          <h2>{lens.displayName} Cylinder</h2>

          <p>{cylinderValues.map(formatCylinder).join(", ")}</p>
        </>
      )}

      {/* Axis */}

      {axisValues.length > 0 && (
        <>
          <h2>Axis</h2>

          <p>{axisValues.map(formatAxis).join(", ")}</p>
        </>
      )}

      {/* Add */}

      {addValues.length > 0 && (
        <>
          <h2>Add Power</h2>

          <p>{addValues.join(", ")}</p>
        </>
      )}

      <p>
        <a href={`/contacts/${slug}`}>Back to {lens.displayName}</a>
      </p>
    </div>
  );
}
