import { MetadataRoute } from "next";
import { lenses } from "@/LensCore/data/lenses";
import { slugifyLens } from "@/lib/seo/slugifyLens";

const guideSlugs = [
  "why-is-my-contact-lens-order-delayed",
  "passive-prescription-verification",
  "can-i-buy-contacts-with-expired-prescription",
  "how-long-does-contact-lens-verification-take",
  "why-are-contact-lenses-cheaper-online",
];

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
    {
      url: `${base}/guides`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];

  const lensPages: MetadataRoute.Sitemap = lenses.map((lens) => ({
    url: `${base}/contacts/${slugifyLens(lens.displayName)}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const guidePages: MetadataRoute.Sitemap = guideSlugs.map((slug) => ({
    url: `${base}/guides/${slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.65,
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
    ...guidePages,
    // ...parameterPages,
    // ...alternativePages,
  ];
}
