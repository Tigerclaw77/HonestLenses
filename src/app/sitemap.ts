import { MetadataRoute } from "next";
import { commercialContactPageList } from "@/app/contacts/_commercial/commercialPages";
import { guides } from "@/app/guides/guides";
import { lenses } from "@/LensCore/data/lenses";
import {
  getLensSlug,
  isPublicCatalogLens,
  SITE_URL,
} from "@/lib/seo/contactSeoRoutes";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/browse`,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/contacts`,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/guides`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...[
      "/verification",
      "/returns",
      "/about",
      "/contact",
      "/vision-benefits",
    ].map((path) => ({
      url: `${SITE_URL}${path}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];

  const lensPages: MetadataRoute.Sitemap = lenses
    .filter(isPublicCatalogLens)
    .map((lens) => ({
    url: `${SITE_URL}/contacts/${getLensSlug(lens)}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const guidePages: MetadataRoute.Sitemap = guides.map((guide) => ({
    url: `${SITE_URL}/guides/${guide.slug}`,
    changeFrequency: "monthly",
    priority: 0.65,
  }));

  const commercialContactPages: MetadataRoute.Sitemap =
    commercialContactPageList.map((page) => ({
      url: page.canonicalUrl,
      changeFrequency: "weekly",
      priority: 0.75,
    }));

  return [
    ...staticPages,
    ...lensPages,
    ...commercialContactPages,
    ...guidePages,
  ];
}
