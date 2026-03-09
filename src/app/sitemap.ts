import { lenses } from "@/LensCore/data/lenses";
import { slugifyLens } from "@/lib/seo/slugifyLens";

export default function sitemap() {
  const base = "https://honestlenses.com";

  const pages = [
    `${base}/contacts`,
  ];

  const lensPages = lenses.map((lens) => ({
    url: `${base}/contacts/${slugifyLens(lens.displayName)}`,
    lastModified: new Date(),
  }));

  const parameterPages = lenses.map((lens) => ({
    url: `${base}/contacts/${slugifyLens(lens.displayName)}/parameters`,
    lastModified: new Date(),
  }));

  const alternativePages = lenses.map((lens) => ({
    url: `${base}/contacts/${slugifyLens(lens.displayName)}/alternatives`,
    lastModified: new Date(),
  }));

  return [
    ...pages.map((url) => ({ url })),
    ...lensPages,
    ...parameterPages,
    ...alternativePages,
  ];
}