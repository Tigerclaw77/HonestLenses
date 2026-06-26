import { lenses } from "@/LensCore/data/lenses";
import {
  findLensBySlug,
  SITE_URL,
} from "@/lib/seo/contactSeoRoutes";
import { notFound } from "next/navigation";

import {
  formatSphere,
  formatCylinder,
  formatDiameter,
  formatBaseCurve,
  formatAxis
} from "@/lib/formatters/rxFormat";

type Props = {
  params: Promise<{ slug: string }>;
};

type SphereSegment = {
  min: number;
  max: number;
};

type LensParameters = {
  sphere?: {
    segments: SphereSegment[];
    exclude?: number[];
  };
  cylinder?: number[];
  axis?: number[];
  add?: number[];
  baseCurve?: number[];
  diameter?: number[];
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

  const p = lens.parameters as LensParameters;

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
        {p?.sphere?.segments
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
        {Array.isArray(p?.baseCurve)
          ? p.baseCurve.map(formatBaseCurve).join(", ")
          : "Varies"}
      </p>

      {/* Diameter */}

      <h2>{lens.displayName} Diameter</h2>

      <p>
        {Array.isArray(p?.diameter)
          ? p.diameter.map(formatDiameter).join(", ")
          : "Varies"}
      </p>

      {/* Cylinder */}

      {p?.cylinder && (
        <>
          <h2>{lens.displayName} Cylinder</h2>

          <p>
            {Array.isArray(p.cylinder)
              ? p.cylinder.map(formatCylinder).join(", ")
              : p.cylinder}
          </p>
        </>
      )}

      {/* Axis */}

      {p?.axis && (
        <>
          <h2>Axis</h2>

          <p>
            {Array.isArray(p.axis)
              ? p.axis.map(formatAxis).join(", ")
              : p.axis}
          </p>
        </>
      )}

      {/* Add */}

      {p?.add && (
        <>
          <h2>Add Power</h2>

          <p>{p.add.join(", ")}</p>
        </>
      )}
    </div>
  );
}
