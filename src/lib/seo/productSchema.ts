import type { LensCore } from "@/LensCore/types";
import { SITE_URL } from "@/lib/seo/contactSeoRoutes";

export type ProductSchemaPriceOption = {
  sku: string;
  boxSize: number;
  pricePerBoxCents: number;
};

export function buildProductSchema({
  lens,
  slug,
  imageUrl,
  priceOptions,
  brandName,
  categoryName,
  replacementName,
}: {
  lens: LensCore;
  slug: string;
  imageUrl: string | null;
  priceOptions: ProductSchemaPriceOption[];
  brandName: string;
  categoryName: string;
  replacementName: string;
}) {
  const canonicalUrl = `${SITE_URL}/contacts/${slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${lens.displayName} Contact Lenses`,
    description: `${lens.displayName} contact lenses by ${lens.manufacturer}. ${replacementName} replacement. A valid contact lens prescription is required.`,
    url: canonicalUrl,
    ...(imageUrl ? { image: `${SITE_URL}${imageUrl}` } : {}),
    brand: { "@type": "Brand", name: brandName },
    manufacturer: { "@type": "Organization", name: lens.manufacturer },
    category: categoryName,
    // A single-pack lens has one real merchant SKU. A multi-pack page does not.
    ...(priceOptions.length === 1 ? { sku: priceOptions[0].sku } : {}),
    additionalProperty: [
      { "@type": "PropertyValue", name: "Replacement schedule", value: replacementName },
      ...(priceOptions.length ? [{
        "@type": "PropertyValue",
        name: "Available box sizes",
        value: priceOptions.map((option) => `${option.boxSize} lenses`).join(", "),
      }] : []),
    ],
    ...(priceOptions.length ? {
      offers: priceOptions.map((option) => ({
        "@type": "Offer",
        name: `${option.boxSize}-lens box`,
        priceCurrency: "USD",
        price: (option.pricePerBoxCents / 100).toFixed(2),
        url: canonicalUrl,
        seller: { "@type": "Organization", name: "Honest Lenses" },
      })),
    } : {}),
  };
}
