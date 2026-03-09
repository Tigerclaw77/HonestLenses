import { lenses } from "@/LensCore/data/lenses";
import { slugifyLens } from "@/lib/seo/slugifyLens";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{
    slug: string;
    parameter: string;
    value: string;
  }>;
};

export default async function LensParameterPage({ params }: Props) {
  const { slug, parameter, value } = await params;

  const lens = lenses.find(
    (l) => slugifyLens(l.displayName) === slug
  );

  if (!lens) return notFound();

  const readableParam = parameter.replace("-", " ");

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