import type { Metadata } from "next";
import { lenses } from "@/LensCore/data/lenses";
import {
  getConditionLensMatches,
  getLensSlug,
  getReadableCondition,
  isContactCondition,
  isPublicCatalogLens,
  SITE_URL,
} from "@/lib/seo/contactSeoRoutes";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ condition: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { condition } = await params;

  if (!isContactCondition(condition)) return {};

  const results = getConditionLensMatches(
    lenses.filter(isPublicCatalogLens),
    condition,
  );

  if (results.length === 0) return {};

  const readableCondition = getReadableCondition(condition);

  return {
    title: `Best Contact Lenses for ${readableCondition}`,
    description: `Browse contact lens options commonly prescribed for ${readableCondition}.`,
    alternates: {
      canonical: `${SITE_URL}/contacts/for/${condition}`,
    },
  };
}

export default async function ConditionPage({ params }: Props) {
  const { condition } = await params;

  if (!isContactCondition(condition)) return notFound();

  const results = getConditionLensMatches(
    lenses.filter(isPublicCatalogLens),
    condition,
  );

  if (!results.length) return notFound();

  const readableCondition = getReadableCondition(condition);

  return (
    <div style={{ padding: 40, maxWidth: 900 }}>
      <h1>Best Contact Lenses for {readableCondition}</h1>

      <ul>
        {results.map((lens) => (
          <li key={lens.coreId}>
            <a href={`/contacts/${getLensSlug(lens)}`}>{lens.displayName}</a>
          </li>
        ))}
      </ul>

      <p>
        <a href="/contacts">Browse all contact lenses</a>
      </p>
    </div>
  );
}
