import type { Metadata } from "next";
import { lenses } from "@/LensCore/data/lenses";
import {
  findLensBySlug,
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
