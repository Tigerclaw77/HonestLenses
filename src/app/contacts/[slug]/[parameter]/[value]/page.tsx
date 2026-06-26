import type { Metadata } from "next";
import { lenses } from "@/LensCore/data/lenses";
import {
  findLensBySlug,
  getReadableParameter,
  hasLensParameterValue,
  isContactParameterKey,
  SITE_URL,
} from "@/lib/seo/contactSeoRoutes";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{
    slug: string;
    parameter: string;
    value: string;
  }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, parameter, value } = await params;
  const lens = findLensBySlug(lenses, slug);

  if (
    !lens ||
    !isContactParameterKey(parameter) ||
    !hasLensParameterValue(lens, parameter, value)
  ) {
    return {};
  }

  const readableParam = getReadableParameter(parameter);

  return {
    title: `${lens.displayName} ${readableParam} ${value}`,
    description: `${lens.displayName} contact lens availability for ${readableParam} ${value}.`,
    alternates: {
      canonical: `${SITE_URL}/contacts/${slug}/${parameter}/${value}`,
    },
  };
}

export default async function LensParameterPage({ params }: Props) {
  const { slug, parameter, value } = await params;

  const lens = findLensBySlug(lenses, slug);

  if (!lens) return notFound();

  if (
    !isContactParameterKey(parameter) ||
    !hasLensParameterValue(lens, parameter, value)
  ) {
    return notFound();
  }

  const readableParam = getReadableParameter(parameter);

  return (
    <div style={{ padding: 40, maxWidth: 900 }}>
      <h1>
        {lens.displayName} {readableParam} {value}
      </h1>

      <p>
        {lens.displayName} contact lenses are available with{" "}
        {readableParam} {value}.
      </p>

      <p>
        This page provides information about prescription parameters
        available for {lens.displayName} lenses.
      </p>
    </div>
  );
}
