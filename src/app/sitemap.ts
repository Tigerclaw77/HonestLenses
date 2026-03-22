import { MetadataRoute } from "next";
import { lenses } from "@/LensCore/data/lenses";
import { slugifyLens } from "@/lib/seo/slugifyLens";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://honestlenses.com";

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${base}/contacts`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];

  const lensPages: MetadataRoute.Sitemap = lenses.map((lens) => ({
    url: `${base}/contacts/${slugifyLens(lens.displayName)}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // const parameterPages: MetadataRoute.Sitemap = lenses.map((lens) => ({
  //   url: `${base}/contacts/${slugifyLens(lens.displayName)}/parameters`,
  //   lastModified: new Date(),
  //   changeFrequency: "monthly",
  //   priority: 0.6,
  // }));

  // const alternativePages: MetadataRoute.Sitemap = lenses.map((lens) => ({
  //   url: `${base}/contacts/${slugifyLens(lens.displayName)}/alternatives`,
  //   lastModified: new Date(),
  //   changeFrequency: "monthly",
  //   priority: 0.6,
  // }));

  return [
    ...staticPages,
    ...lensPages,
    // ...parameterPages,
    // ...alternativePages,
  ];
}