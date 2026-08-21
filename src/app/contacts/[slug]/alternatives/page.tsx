import type { Metadata } from "next";
import { lenses } from "@/LensCore/data/lenses";
import {
  findLensBySlug,
  getLensSlug,
  isPublicCatalogLens,
  SITE_URL,
} from "@/lib/seo/contactSeoRoutes";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const lens = findLensBySlug(lenses, slug);

  if (!lens) return {};

  return {
    title: `Alternatives to ${lens.displayName}`,
    description: `Compare similar contact lens options to ${lens.displayName} based on replacement schedule and lens category.`,
    alternates: {
      canonical: `${SITE_URL}/contacts/${slug}/alternatives`,
    },
  };
}

export default async function AlternativesPage({ params }: Props) {
  const { slug } = await params;

  const lens = findLensBySlug(lenses, slug);

  if (!lens) return notFound();

  const alternatives = lenses
    .filter(isPublicCatalogLens)
    .filter((l) => l.replacement === lens.replacement)
    .filter((l) => l.displayName !== lens.displayName)
    .slice(0, 5);

  return (
    <div style={{ padding: 40, maxWidth: 900 }}>
      <h1>Alternatives to {lens.displayName}</h1>

      <p>
        These options share the same replacement schedule. Confirm the exact
        lens named on your prescription before ordering.
      </p>

      <ul>
        {alternatives.map((l) => (
          <li key={l.coreId}>
            <a href={`/contacts/${getLensSlug(l)}`}>{l.displayName}</a>
          </li>
        ))}
      </ul>

      <p>
        <a href={`/contacts/${slug}`}>Back to {lens.displayName}</a>
      </p>
    </div>
  );
}
