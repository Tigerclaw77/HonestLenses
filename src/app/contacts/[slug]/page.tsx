import { lenses } from "@/LensCore/data/lenses";
import { slugifyLens } from "@/lib/seo/slugifyLens";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return lenses.map((lens) => ({
    slug: slugifyLens(lens.displayName),
  }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;

  const lens = lenses.find(
    (l) => slugifyLens(l.displayName) === slug
  );

  if (!lens) return {};

  return {
    title: `${lens.displayName} Contact Lenses | Honest Lenses`,
    description: `Shop ${lens.displayName} contact lenses with prescription verification and manufacturer-direct fulfillment from Honest Lenses.`,
  };
}

export default async function LensPage({ params }: Props) {
  const { slug } = await params;

  const lens = lenses.find(
    (l) => slugifyLens(l.displayName) === slug
  );

  if (!lens) return notFound();

  return (
    <div style={{ padding: 40, maxWidth: 900 }}>
      <h1>{lens.displayName} Contact Lenses</h1>

      <p>
        {lens.displayName} contact lenses are manufactured by {lens.manufacturer}.
        These lenses are designed for {lens.replacement} replacement schedules.
      </p>

      <h2>Prescription Requirements</h2>

      <p>
        A valid contact lens prescription is required to purchase {lens.displayName}.
        Honest Lenses verifies prescriptions according to the FTC Contact Lens Rule.
      </p>

      <h2>Lens Parameters</h2>

      <p>
        View detailed parameter availability for {lens.displayName}.
      </p>

      <a href={`/contacts/${slug}/parameters`}>
        View Full Parameter Ranges
      </a>
    </div>
  );
}