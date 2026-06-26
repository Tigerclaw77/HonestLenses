import { MetadataRoute } from "next";
import { lenses } from "@/LensCore/data/lenses";
import {
  getConditionRoutes,
  getLensParameterRoutes,
  getLensSlug,
  getParameterIndexRoutes,
  SITE_URL,
} from "@/lib/seo/contactSeoRoutes";

const guideSlugs = [
  "why-is-my-contact-lens-order-delayed",
  "passive-prescription-verification",
  "can-i-buy-contacts-with-expired-prescription",
  "how-long-does-contact-lens-verification-take",
  "why-are-contact-lenses-cheaper-online",
  "why-was-my-contact-lens-prescription-rejected",
  "what-happens-if-my-eye-doctor-does-not-respond",
  "what-information-is-needed-to-verify-a-contact-lens-prescription",
  "can-i-use-my-glasses-prescription-to-buy-contacts",
  "why-do-contact-lens-prescriptions-expire",
  "can-someone-else-order-contacts-for-me",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/contacts`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/guides`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];

  const lensPages: MetadataRoute.Sitemap = lenses.map((lens) => ({
    url: `${SITE_URL}/contacts/${getLensSlug(lens)}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const guidePages: MetadataRoute.Sitemap = guideSlugs.map((slug) => ({
    url: `${SITE_URL}/guides/${slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.65,
  }));

  const parameterPages: MetadataRoute.Sitemap = lenses.map((lens) => ({
    url: `${SITE_URL}/contacts/${getLensSlug(lens)}/parameters`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const alternativePages: MetadataRoute.Sitemap = lenses.map((lens) => ({
    url: `${SITE_URL}/contacts/${getLensSlug(lens)}/alternatives`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.55,
  }));

  const parameterIndexPages: MetadataRoute.Sitemap = getParameterIndexRoutes(
    lenses,
  ).map(({ parameter, value }) => ({
    url: `${SITE_URL}/contacts/by/${parameter}/${value}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.55,
  }));

  const conditionPages: MetadataRoute.Sitemap = getConditionRoutes(lenses).map(
    (condition) => ({
      url: `${SITE_URL}/contacts/for/${condition}`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.55,
    }),
  );

  const lensParameterPages: MetadataRoute.Sitemap = getLensParameterRoutes(
    lenses,
  ).map(({ slug, parameter, value }) => ({
    url: `${SITE_URL}/contacts/${slug}/${parameter}/${value}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [
    ...staticPages,
    ...lensPages,
    ...guidePages,
    ...parameterPages,
    ...alternativePages,
    ...parameterIndexPages,
    ...conditionPages,
    ...lensParameterPages,
  ];
}
