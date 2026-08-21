import type { Metadata } from "next";
import { lenses } from "@/LensCore/data/lenses";
import {
  getParameterIndexLensMatches,
  getReadableParameter,
  getLensSlug,
  isContactParameterKey,
  isPublicCatalogLens,
  SITE_URL,
} from "@/lib/seo/contactSeoRoutes";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{
    parameter: string;
    value: string;
  }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { parameter, value } = await params;

  if (!isContactParameterKey(parameter)) return {};

  const results = getParameterIndexLensMatches(
    lenses.filter(isPublicCatalogLens),
    parameter,
    value,
  );

  if (results.length === 0) return {};

  const readableParam = getReadableParameter(parameter);

  return {
    title: `Contact Lenses With ${readableParam} ${value}`,
    description: `Browse contact lenses available with ${readableParam} ${value}.`,
    alternates: {
      canonical: `${SITE_URL}/contacts/by/${parameter}/${value}`,
    },
  };
}

export default async function ParameterIndexPage({ params }: Props) {
  const { parameter, value } = await params;

  if (!isContactParameterKey(parameter)) {
    return notFound();
  }

  const results = getParameterIndexLensMatches(
    lenses.filter(isPublicCatalogLens),
    parameter,
    value,
  );

  if (results.length === 0) {
    return notFound();
  }

  const readableParam = getReadableParameter(parameter);

  return (
    <div style={{ padding: 40, maxWidth: 900 }}>
      <h1>
        Contact Lenses With {readableParam} {value}
      </h1>

      <p>
        The following contact lenses are available with{" "}
        {readableParam} {value}.
      </p>

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
