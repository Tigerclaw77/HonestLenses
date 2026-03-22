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
    description: `Shop ${lens.displayName} contact lenses with prescription verification and manufacturer-direct fulfillment from Honest Lenses. ${lens.displayName} is manufactured by ${lens.manufacturer} and designed for ${lens.replacement} replacement.`,
  };
}

export default async function LensPage({ params }: Props) {
  const { slug } = await params;

  const lens = lenses.find(
    (l) => slugifyLens(l.displayName) === slug
  );

  if (!lens) return notFound();

  return (
    <div style={{ padding: 40, maxWidth: 900, lineHeight: 1.6 }}>
      {/* Title */}
      <h1>{lens.displayName} Contact Lenses</h1>

      {/* Core description (CRITICAL for indexing) */}
      <p>
        {lens.displayName} is a contact lens manufactured by {lens.manufacturer} and
        designed for {lens.replacement} replacement. It is commonly prescribed for
        patients seeking consistent vision and reliable comfort throughout the day.
      </p>

      <p>
        These lenses are available in a range of parameters and must be dispensed
        according to a valid contact lens prescription. Your eye care provider
        determines whether {lens.displayName} is appropriate based on your visual
        needs and ocular health.
      </p>

      {/* Who it's for */}
      <h2>Who Is {lens.displayName} For?</h2>

      <p>
        {lens.displayName} may be prescribed for patients who prefer a{" "}
        {lens.replacement} replacement schedule and want a balance of comfort,
        convenience, and consistent optical performance. Suitability depends on
        individual prescription parameters and clinical evaluation by a licensed
        eye care provider.
      </p>

      {/* Prescription section */}
      <h2>Prescription Requirements</h2>

      <p>
        A valid contact lens prescription is required to purchase {lens.displayName}.
        Honest Lenses verifies prescriptions in accordance with the FTC Contact
        Lens Rule, either through direct verification or prescriber confirmation.
      </p>

      {/* Navigation / internal links */}
      <h2>Explore More</h2>

      <ul>
        <li>
          <a href={`/contacts/${slug}/parameters`}>
            View full parameter availability for {lens.displayName}
          </a>
        </li>
        <li>
          <a href={`/contacts/${slug}/alternatives`}>
            View similar contact lens options
          </a>
        </li>
      </ul>
    </div>
  );
}