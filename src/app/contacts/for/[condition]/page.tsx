import type { Metadata } from "next";
import { lenses } from "@/LensCore/data/lenses";
import {
  getConditionLensMatches,
  getReadableCondition,
  isContactCondition,
  SITE_URL,
} from "@/lib/seo/contactSeoRoutes";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ condition: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { condition } = await params;

  if (!isContactCondition(condition)) return {};

  const results = getConditionLensMatches(lenses, condition);

  if (results.length === 0) return {};

  const readableCondition = getReadableCondition(condition);

  return {
    title: `Contact Lens Catalog: ${readableCondition}`,
    description: `View catalog products with designs associated with ${readableCondition} prescriptions. Product selection requires an eye care professional.`,
    alternates: {
      canonical: `${SITE_URL}/contacts/for/${condition}`,
    },
    robots: { index: false, follow: true },
  };
}

export default async function ConditionPage({ params }: Props) {
  const { condition } = await params;

  if (!isContactCondition(condition)) return notFound();

  const results = getConditionLensMatches(lenses, condition);

  if (!results.length) return notFound();

  const readableCondition = getReadableCondition(condition);

  return (
    <div style={{ padding: 40, maxWidth: 900 }}>
      <h1>Catalog products associated with {readableCondition}</h1>

      <p>
        This catalog list is not a product recommendation. Only an eye care
        professional can select or change the lens on a contact lens
        prescription.
      </p>

      <ul>
        {results.map((lens) => (
          <li key={lens.displayName}>{lens.displayName}</li>
        ))}
      </ul>
    </div>
  );
}
