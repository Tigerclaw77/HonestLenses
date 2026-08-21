import { MetadataRoute } from "next";
import { commercialContactPageList } from "@/app/contacts/_commercial/commercialPages";
import { lenses } from "@/LensCore/data/lenses";
import {
  getConditionRoutes,
  getLensParameterRoutes,
  getLensSlug,
  getParameterIndexRoutes,
  isPublicCatalogLens,
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
  "buying-contact-lenses-online",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const publicLenses = lenses.filter(isPublicCatalogLens);

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      changeFrequency: "daily",
      priority: 1,
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
  ];

  const lensPages: MetadataRoute.Sitemap = publicLenses.map((lens) => ({
    url: `${SITE_URL}/contacts/${getLensSlug(lens)}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const guidePages: MetadataRoute.Sitemap = guideSlugs.map((slug) => ({
    url: `${SITE_URL}/guides/${slug}`,
    changeFrequency: "monthly",
    priority: 0.65,
  }));

  const commercialContactPages: MetadataRoute.Sitemap =
    commercialContactPageList.map((page) => ({
      url: page.canonicalUrl,
      changeFrequency: "weekly",
      priority: 0.75,
    }));

  const parameterPages: MetadataRoute.Sitemap = publicLenses.map((lens) => ({
    url: `${SITE_URL}/contacts/${getLensSlug(lens)}/parameters`,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const alternativePages: MetadataRoute.Sitemap = publicLenses.map((lens) => ({
    url: `${SITE_URL}/contacts/${getLensSlug(lens)}/alternatives`,
    changeFrequency: "monthly",
    priority: 0.55,
  }));

  const parameterIndexPages: MetadataRoute.Sitemap = getParameterIndexRoutes(
    publicLenses,
  ).map(({ parameter, value }) => ({
    url: `${SITE_URL}/contacts/by/${parameter}/${value}`,
    changeFrequency: "monthly",
    priority: 0.55,
  }));

  const conditionPages: MetadataRoute.Sitemap = getConditionRoutes(publicLenses).map(
    (condition) => ({
      url: `${SITE_URL}/contacts/for/${condition}`,
      changeFrequency: "monthly",
      priority: 0.55,
    }),
  );

  const lensParameterPages: MetadataRoute.Sitemap = getLensParameterRoutes(
    publicLenses,
  ).map(({ slug, parameter, value }) => ({
    url: `${SITE_URL}/contacts/${slug}/${parameter}/${value}`,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [
    ...staticPages,
    ...lensPages,
    ...commercialContactPages,
    ...guidePages,
    ...parameterPages,
    ...alternativePages,
    ...parameterIndexPages,
    ...conditionPages,
    ...lensParameterPages,
  ];
}
