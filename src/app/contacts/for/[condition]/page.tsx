import { lenses } from "@/LensCore/data/lenses";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ condition: string }>;
};

export default async function ConditionPage({ params }: Props) {
  const { condition } = await params;

  const results = lenses.filter((lens) => {
    if (condition === "astigmatism") {
      return !!lens.parameters?.toric;
    }

    if (condition === "presbyopia") {
      return !!lens.parameters?.multifocal;
    }

    return false;
  });

  if (!results.length) return notFound();

  return (
    <div style={{ padding: 40, maxWidth: 900 }}>
      <h1>Best Contact Lenses for {condition}</h1>

      <ul>
        {results.map((lens) => (
          <li key={lens.displayName}>{lens.displayName}</li>
        ))}
      </ul>
    </div>
  );
}
