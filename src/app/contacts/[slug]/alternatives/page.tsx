import { lenses } from "@/LensCore/data/lenses";
import { slugifyLens } from "@/lib/seo/slugifyLens";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function AlternativesPage({ params }: Props) {
  const { slug } = await params;

  const lens = lenses.find(
    (l) => slugifyLens(l.displayName) === slug
  );

  if (!lens) return notFound();

  const alternatives = lenses
    .filter((l) => l.replacement === lens.replacement)
    .filter((l) => l.displayName !== lens.displayName)
    .slice(0, 5);

  return (
    <div style={{ padding: 40 }}>
      <h1>Alternatives to {lens.displayName}</h1>

      <ul>
        {alternatives.map((l) => (
          <li key={l.displayName}>{l.displayName}</li>
        ))}
      </ul>
    </div>
  );
}