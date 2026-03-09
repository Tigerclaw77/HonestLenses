import { lenses } from "@/LensCore/data/lenses";
import { slugifyLens } from "@/lib/seo/slugifyLens";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  const params = [];

  for (let i = 0; i < lenses.length; i++) {
    for (let j = i + 1; j < lenses.length; j++) {
      params.push({
        slug:
          slugifyLens(lenses[i].displayName) +
          "-vs-" +
          slugifyLens(lenses[j].displayName),
      });
    }
  }

  return params;
}

export default async function ComparePage({ params }: Props) {
  const { slug } = await params;

  const parts = slug.split("-vs-");

  if (parts.length !== 2) return notFound();

  const [aSlug, bSlug] = parts;

  const lensA = lenses.find((l) => slugifyLens(l.displayName) === aSlug);

  const lensB = lenses.find((l) => slugifyLens(l.displayName) === bSlug);

  if (!lensA || !lensB) return notFound();

  return (
    <div style={{ padding: 40, maxWidth: 900 }}>
      <h1>
        {lensA.displayName} vs {lensB.displayName}
      </h1>

      <p>
        Compare {lensA.displayName} and {lensB.displayName} contact lenses
        including base curve, diameter, and replacement schedule.
      </p>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th>Feature</th>
            <th>{lensA.displayName}</th>
            <th>{lensB.displayName}</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td>Manufacturer</td>
            <td>{lensA.manufacturer}</td>
            <td>{lensB.manufacturer}</td>
          </tr>

          <tr>
            <td>Replacement</td>
            <td>{lensA.replacement}</td>
            <td>{lensB.replacement}</td>
          </tr>

          <tr>
            <td>Base Curve</td>
            <td>{lensA.parameters?.baseCurve?.join(", ") || "-"}</td>
            <td>{lensB.parameters?.baseCurve?.join(", ") || "-"}</td>
          </tr>

          <tr>
            <td>Diameter</td>
            <td>{lensA.parameters?.diameter?.join(", ") || "-"}</td>
            <td>{lensB.parameters?.diameter?.join(", ") || "-"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
