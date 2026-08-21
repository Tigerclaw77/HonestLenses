import { lenses } from "@/LensCore/data/lenses";
import type { LensCore } from "@/LensCore/types";
import {
  findLensBySlug,
  getLensAddValues,
  getLensSlug,
  isPublicCatalogLens,
  SITE_URL,
} from "@/lib/seo/contactSeoRoutes";
import { notFound } from "next/navigation";
import ProductTelemetry from "@/components/analytics/ProductTelemetry";

type Props = {
  params: Promise<{ slug: string }>;
};

function ProductJsonLd({ lens, slug }: { lens: LensCore; slug: string }) {
  const product = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${lens.displayName} Contact Lenses`,
    description: `${lens.displayName} contact lenses manufactured by ${lens.manufacturer} for ${lens.replacement} replacement.`,
    manufacturer: {
      "@type": "Organization",
      name: lens.manufacturer,
    },
    category: "Contact lenses",
    url: `${SITE_URL}/contacts/${slug}`,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(product) }}
    />
  );
}

export function generateStaticParams() {
  return lenses.filter(isPublicCatalogLens).map((lens) => ({
    slug: getLensSlug(lens),
  }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;

  const lens = findLensBySlug(lenses, slug);

  if (!lens) return {};

  return {
    title: `${lens.displayName} Contact Lenses`,
    description: `Shop ${lens.displayName} contact lenses with prescription verification and manufacturer-direct fulfillment from Honest Lenses. ${lens.displayName} is manufactured by ${lens.manufacturer} and designed for ${lens.replacement} replacement.`,
    alternates: {
      canonical: `${SITE_URL}/contacts/${slug}`,
    },
  };
}

export default async function LensPage({ params }: Props) {
  const { slug } = await params;

  const lens = findLensBySlug(lenses, slug);

  if (!lens) return notFound();

  const relatedCategoryLinks = [
    lens.type.toric
      ? { href: "/contacts/for/astigmatism", label: "Contact lenses for astigmatism" }
      : null,
    lens.type.multifocal || getLensAddValues(lens).length > 0
      ? { href: "/contacts/for/presbyopia", label: "Multifocal contact lens options" }
      : null,
    lens.manufacturer === "VISTAKON"
      ? { href: "/contacts/acuvue-contact-lenses", label: "ACUVUE contact lenses" }
      : null,
  ].filter((link): link is { href: string; label: string } => Boolean(link));

  return (
    <div style={{ padding: 40, maxWidth: 900, lineHeight: 1.6 }}>
      <ProductJsonLd lens={lens} slug={slug} />
      <ProductTelemetry
        coreId={lens.coreId}
        source="product_page"
      />

      {/* Title */}
      <h1>{lens.displayName} Contact Lenses</h1>

      {/* Core description (CRITICAL for indexing) */}
      <p>
        {lens.displayName} is a contact lens manufactured by {lens.manufacturer} and
        designed for {lens.replacement} replacement. It is commonly prescribed for
        patients seeking consistent vision and reliable comfort throughout the day.
      </p>

      <p>
        These lenses are available in a range of parameters and must be dispensed
        according to a valid contact lens prescription. Your eye care provider
        determines whether {lens.displayName} is appropriate based on your visual
        needs and ocular health.
      </p>

      {/* Who it's for */}
      <h2>Who Is {lens.displayName} For?</h2>

      <p>
        {lens.displayName} may be prescribed for patients who prefer a{" "}
        {lens.replacement} replacement schedule and want a balance of comfort,
        convenience, and consistent optical performance. Suitability depends on
        individual prescription parameters and clinical evaluation by a licensed
        eye care provider.
      </p>

      {/* Prescription section */}
      <h2>Prescription Requirements</h2>

      <p>
        A valid contact lens prescription is required to purchase {lens.displayName}.
        Honest Lenses verifies prescriptions in accordance with the FTC Contact
        Lens Rule, either through direct verification or prescriber confirmation.
      </p>

      <p>
        <a
          href={`/enter-prescription?right=${encodeURIComponent(
            lens.coreId,
          )}&left=${encodeURIComponent(lens.coreId)}`}
        >
          Order {lens.displayName}
        </a>
      </p>

      {/* Navigation / internal links */}
      <h2>Explore More</h2>

      <ul>
        <li>
          <a href="/contacts">Browse all contact lenses</a>
        </li>
        <li>
          <a href={`/contacts/${slug}/parameters`}>
            View full parameter availability for {lens.displayName}
          </a>
        </li>
        <li>
          <a href={`/contacts/${slug}/alternatives`}>
            View similar contact lens options
          </a>
        </li>
        {relatedCategoryLinks.map((link) => (
          <li key={link.href}>
            <a href={link.href}>{link.label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
